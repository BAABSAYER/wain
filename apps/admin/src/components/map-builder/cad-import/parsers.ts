/**
 * CAD/BIM → Wain canvas room polygons.
 *
 *   DXF  — parsed inline via `dxf-parser` (closed LW/POLYLINEs).
 *   SVG  — parsed inline via DOMParser (<polygon>, <rect>, <path Mz>).
 *   IFC  — dynamic-imported `web-ifc` (IfcSpace bbox per space). Heavy WASM,
 *          only loaded when the user actually picks an .ifc file.
 *
 * Each parser returns rooms in its source coordinate space. `autoFitToFloor`
 * then scales + translates everything into the floor canvas so an imported
 * drawing in metres or inches lands sensibly regardless of original units.
 *
 * Y is normalised to "down" (screen convention). DXF/IFC source y goes up so
 * those parsers flip; SVG already matches.
 */
import type { Point2D } from "@wain/types";

export interface ParsedRoom {
  name: string;
  layer?: string;     // CAD layer / SVG group / IFC space tag — used as zone hint
  polygon: Point2D[];
}

export interface ParseResult {
  rooms: ParsedRoom[];
  /** Bounds in source coordinates (before fit-to-floor). */
  sourceBBox: { minX: number; minY: number; maxX: number; maxY: number };
  sourceUnits?: string;
  warnings: string[];
}

function emptyBBox() {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}
function widenBBox(b: ReturnType<typeof emptyBBox>, x: number, y: number) {
  if (x < b.minX) b.minX = x;
  if (y < b.minY) b.minY = y;
  if (x > b.maxX) b.maxX = x;
  if (y > b.maxY) b.maxY = y;
}

// ─── DXF ─────────────────────────────────────────────────────────────────────
export async function parseDxf(text: string): Promise<ParseResult> {
  // Dynamic import — keeps the parser out of the main bundle until used.
  const mod: any = await import("dxf-parser");
  const Parser = mod.default ?? mod;
  const parsed = new Parser().parseSync(text);

  const rooms: ParsedRoom[] = [];
  const bbox = emptyBBox();
  const warnings: string[] = [];
  let counter = 0;

  for (const e of (parsed?.entities ?? []) as any[]) {
    if (e.type !== "LWPOLYLINE" && e.type !== "POLYLINE") continue;
    const vertices: any[] = e.vertices ?? [];
    const isClosed = !!(e.shape || e.closed);
    if (!isClosed || vertices.length < 3) continue;

    // DXF is Y-up; flip so screen-down (the canvas's convention)
    const polygon: Point2D[] = vertices.map((v) => ({ x: v.x, y: -v.y }));
    for (const p of polygon) widenBBox(bbox, p.x, p.y);

    rooms.push({
      name: e.handle ? `Room ${e.handle}` : `Room ${++counter}`,
      layer: e.layer || undefined,
      polygon,
    });
  }

  if (rooms.length === 0) warnings.push("No closed polylines found — try exporting rooms as closed LWPOLYLINE entities.");

  return { rooms, sourceBBox: bbox, sourceUnits: "dxf", warnings };
}

// ─── SVG ─────────────────────────────────────────────────────────────────────
export function parseSvg(text: string): ParseResult {
  const dom = new DOMParser().parseFromString(text, "image/svg+xml");
  const parseErr = dom.querySelector("parsererror");
  if (parseErr) return { rooms: [], sourceBBox: emptyBBox(), warnings: ["Invalid SVG"] };

  const rooms: ParsedRoom[] = [];
  const bbox = emptyBBox();
  const warnings: string[] = [];
  let counter = 0;

  const groupLabel = (node: Element): string | undefined => {
    let cur: Element | null = node.parentElement;
    while (cur) {
      const id = cur.getAttribute?.("id");
      const label = cur.getAttribute?.("inkscape:label") || cur.getAttribute?.("data-name");
      if (label) return label;
      if (id && cur.tagName.toLowerCase() === "g") return id;
      cur = cur.parentElement;
    }
    return undefined;
  };

  // <polygon points="x1,y1 x2,y2 ...">
  dom.querySelectorAll("polygon").forEach((el) => {
    const pts = (el.getAttribute("points") || "").trim().split(/[\s,]+/).map(Number);
    if (pts.length < 6) return;
    const polygon: Point2D[] = [];
    for (let i = 0; i + 1 < pts.length; i += 2) polygon.push({ x: pts[i], y: pts[i + 1] });
    for (const p of polygon) widenBBox(bbox, p.x, p.y);
    rooms.push({ name: el.getAttribute("id") || `Room ${++counter}`, layer: groupLabel(el), polygon });
  });

  // <rect>
  dom.querySelectorAll("rect").forEach((el) => {
    const x = Number(el.getAttribute("x") || 0);
    const y = Number(el.getAttribute("y") || 0);
    const w = Number(el.getAttribute("width") || 0);
    const h = Number(el.getAttribute("height") || 0);
    if (w <= 0 || h <= 0) return;
    const polygon: Point2D[] = [
      { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h },
    ];
    for (const p of polygon) widenBBox(bbox, p.x, p.y);
    rooms.push({ name: el.getAttribute("id") || `Room ${++counter}`, layer: groupLabel(el), polygon });
  });

  // <path d="..."> — only closed M-L-Z paths (no curves).
  dom.querySelectorAll("path").forEach((el) => {
    const d = (el.getAttribute("d") || "").trim();
    if (!/[Zz]\s*$/.test(d)) return;
    // Tokenise simple M/L commands (skip Q/C/A — would need flattening)
    if (/[QCASTqcast]/.test(d)) { warnings.push(`Path ${el.id || "?"} has curves — skipped`); return; }
    const numbers = d.replace(/[MLZmlz,]/g, " ").split(/\s+/).filter(Boolean).map(Number);
    if (numbers.length < 6) return;
    const polygon: Point2D[] = [];
    for (let i = 0; i + 1 < numbers.length; i += 2) polygon.push({ x: numbers[i], y: numbers[i + 1] });
    for (const p of polygon) widenBBox(bbox, p.x, p.y);
    rooms.push({ name: el.getAttribute("id") || `Room ${++counter}`, layer: groupLabel(el), polygon });
  });

  if (rooms.length === 0) warnings.push("No <polygon>, <rect>, or closed <path> elements found.");
  return { rooms, sourceBBox: bbox, sourceUnits: "svg", warnings };
}

// ─── IFC ─────────────────────────────────────────────────────────────────────
export async function parseIfc(buffer: ArrayBuffer): Promise<ParseResult> {
  // web-ifc is ~3 MB and loads its own WASM; dynamic-import keeps the rest of
  // the admin lean. WASM is fetched from the configured path on first use.
  const WebIFC: any = await import("web-ifc");
  const api = new WebIFC.IfcAPI();
  // Load the bundled WASM via Next's static file pipeline (the postinstall
  // step in apps/admin/scripts/copy-ifc-wasm.mjs places it under /public).
  api.SetWasmPath("/web-ifc/");
  await api.Init();

  const modelId = api.OpenModel(new Uint8Array(buffer));
  const rooms: ParsedRoom[] = [];
  const bbox = emptyBBox();
  const warnings: string[] = [];

  try {
    // Every IfcSpace = a room. Pull each one's bbox in world coords; the
    // canvas only needs a 2D polygon so we project the bbox down to a
    // rectangle on the XY plane (Z is height — usually irrelevant for floor
    // wayfinding).
    // web-ifc returns a Vector<int> wrapper (with .size()/.get()), not a plain
    // array — cast to any so we can handle both shapes defensively.
    const spaceIds: any = api.GetLineIDsWithType(modelId, WebIFC.IFCSPACE);
    const total: number =
      typeof spaceIds?.size === "function" ? spaceIds.size() : spaceIds?.length ?? 0;
    let counter = 0;
    for (let i = 0; i < total; i++) {
      const id = typeof spaceIds.get === "function" ? spaceIds.get(i) : spaceIds[i];
      const props = api.GetLine(modelId, id);
      const name: string =
        props?.LongName?.value ||
        props?.Name?.value ||
        `Space ${++counter}`;

      // Get the geometry. web-ifc returns one or more meshes per element.
      const flatMesh = api.GetFlatMesh(modelId, id);
      const meshes = flatMesh?.geometries;
      if (!meshes || meshes.size?.() === 0) continue;

      const subBBox = emptyBBox();
      let n = meshes.size?.() ?? 0;
      for (let g = 0; g < n; g++) {
        const placedGeo = meshes.get(g);
        const geo = api.GetGeometry(modelId, placedGeo.geometryExpressID);
        const verts = api.GetVertexArray(geo.GetVertexData(), geo.GetVertexDataSize());
        // Vertex layout: x, y, z, nx, ny, nz repeated
        for (let v = 0; v < verts.length; v += 6) {
          const x = verts[v];
          // IFC is Z-up; project Y by negating Z to match screen convention
          const y = -verts[v + 2];
          widenBBox(subBBox, x, y);
        }
      }

      if (subBBox.minX === Infinity) continue;

      const polygon: Point2D[] = [
        { x: subBBox.minX, y: subBBox.minY },
        { x: subBBox.maxX, y: subBBox.minY },
        { x: subBBox.maxX, y: subBBox.maxY },
        { x: subBBox.minX, y: subBBox.maxY },
      ];
      for (const p of polygon) widenBBox(bbox, p.x, p.y);
      rooms.push({ name, layer: "IfcSpace", polygon });
    }
  } finally {
    api.CloseModel(modelId);
  }

  if (rooms.length === 0) warnings.push("No IfcSpace entities found — does the model contain rooms?");
  return { rooms, sourceBBox: bbox, sourceUnits: "ifc", warnings };
}

// ─── Auto-fit ────────────────────────────────────────────────────────────────
export function autoFitToFloor(
  result: ParseResult,
  floorWidth: number,
  floorHeight: number,
  margin = 50,
): ParsedRoom[] {
  const { minX, minY, maxX, maxY } = result.sourceBBox;
  const srcW = maxX - minX;
  const srcH = maxY - minY;
  if (!Number.isFinite(srcW) || !Number.isFinite(srcH) || srcW <= 0 || srcH <= 0) {
    return result.rooms;
  }
  const scale = Math.min(
    (floorWidth - 2 * margin) / srcW,
    (floorHeight - 2 * margin) / srcH,
  );
  const offsetX = (floorWidth - srcW * scale) / 2 - minX * scale;
  const offsetY = (floorHeight - srcH * scale) / 2 - minY * scale;
  return result.rooms.map((r) => ({
    ...r,
    polygon: r.polygon.map((p) => ({
      x: Math.round(p.x * scale + offsetX),
      y: Math.round(p.y * scale + offsetY),
    })),
  }));
}

export function detectFormat(filename: string): "dxf" | "svg" | "ifc" | null {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "dxf") return "dxf";
  if (ext === "svg") return "svg";
  if (ext === "ifc") return "ifc";
  return null;
}
