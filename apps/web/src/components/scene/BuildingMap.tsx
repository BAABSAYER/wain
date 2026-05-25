"use client";
import { useRef, useEffect, useState, useImperativeHandle, forwardRef, useMemo } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { isOpenSpace, categoryGlyph } from "@/lib/category-icons";

// ─── Types (mirror BuildingScene so the page can swap engines freely) ─────────

interface StoreData {
  id: string;
  name: string;
  nameAr: string;
  polygon: Array<{ x: number; y: number }>;
  extrudeHeight: number;
  color: string;
  category: string;
  zone?: string | null;
  zoneAr?: string | null;
  logoUrl?: string | null;
}

// Amenity categories → badge icon + color (wayfinding highlights)
function amenityBadge(s: StoreData): { icon: string; bg: string } | null {
  switch (s.category) {
    case "restroom":  return { icon: "🚻", bg: "#6366f1" };
    case "elevator":  return { icon: "🛗", bg: "#f59e0b" };
    case "stairs":    return { icon: "🪜", bg: "#16a34a" };
    case "escalator": return { icon: "⇅", bg: "#0d9488" };
    case "entrance":  return { icon: "🚪", bg: "#10b981" };
    case "parking":   return { icon: "🅿", bg: "#0ea5e9" };
    case "services":
      if (/prayer|مصل/i.test(`${s.name} ${s.nameAr}`)) return { icon: "🕌", bg: "#22c55e" };
      if (/info|reception|استقبال|معلومات/i.test(`${s.name} ${s.nameAr}`)) return { icon: "ⓘ", bg: "#0284c7" };
      return null;
    default: return null;
  }
}
interface RouteStep { nodeId: string; floorId: string; x: number; y: number; z: number; }
interface NavLine { a: { x: number; y: number }; b: { x: number; y: number }; }

export interface SceneProjectionInfo {
  azimuth: number;
  destScreen: { x: number; y: number; inView: boolean } | null;
}

interface Props {
  stores: StoreData[];
  routeSteps: RouteStep[];
  destinationId: string | null;
  selectedId: string | null;
  /** When set, blocks of this category are tinted (filter highlights, never hides). */
  highlightCategory?: string | null;
  floorWidth: number;
  floorHeight: number;
  origin: { x: number; y: number } | null;
  focus: { x: number; y: number } | null;
  heading: number | null;
  initialAzimuth: number | null;
  locale?: "en" | "ar";
  /** Walkable corridor segments (nav-graph edges) — drawn as arrowed paths. */
  navEdges?: NavLine[];
  onProjection?: (info: SceneProjectionInfo) => void;
  onBlockClick?: (storeId: string) => void;
}

export interface BuildingMapHandle {
  recenter: () => void;
  topView: () => void;
  tiltedView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

// ─── LEAP palette ─────────────────────────────────────────────────────────────
const BACKGROUND = "#f0e9da";   // cream outside
const FLOOR_COLOR = "#fbf8f3";  // warm off-white interior
const DEFAULT_BLOCK_COLOR = "#eef1f6"; // clean cool light-gray (LEAP white booths)
const HOVER_COLOR = "#93c5fd";         // light blue highlight on hover
const CATEGORY_HIGHLIGHT_COLOR = "#f59e0b"; // amber — units matching the active category filter
const DEST_COLOR = "#7c3aed";
const SELECTED_COLOR = "#ec4899";
const ROUTE_COLOR = "#4f9df8";  // bright royal-blue ribbon (LEAP)
const ROUTE_DARK = "#2563eb";   // darker blue edge/halo

// Floor units → local geographic coords. We center the floor at [0,0] and treat
// each floor unit as a small number of metres, then convert metres → degrees.
const METERS_PER_UNIT = 0.12;
const DEG_PER_M_LNG = 1 / 111320;
const DEG_PER_M_LAT = 1 / 110540;

function makeToLngLat(w: number, h: number) {
  return (x: number, y: number): [number, number] => {
    const mx = (x - w / 2) * METERS_PER_UNIT;
    const my = (h / 2 - y) * METERS_PER_UNIT; // flip y (page down → lat up)
    return [mx * DEG_PER_M_LNG, my * DEG_PER_M_LAT];
  };
}

function heightMeters(s: StoreData): number {
  // Exaggerate so blocks "pop" in the pitched view (LEAP-style chunky prisms).
  return Math.max(5, (s.extrudeHeight || 5)) * 2.2;
}

/** A small chevron arrow (pointing +x) for symbol layers. */
function makeArrowImage(fill = "#2563eb", stroke = "#ffffff"): { width: number; height: number; data: Uint8Array } {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  // chevron pointing to the right
  ctx.beginPath();
  ctx.moveTo(9, 6);
  ctx.lineTo(24, 16);
  ctx.lineTo(9, 26);
  ctx.lineTo(14, 16);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const img = ctx.getImageData(0, 0, size, size);
  return { width: size, height: size, data: new Uint8Array(img.data.buffer) };
}

/** A bold white ">" chevron (stroke, rounded) pointing +x — for the route ribbon. */
function makeChevronImage(): { width: number; height: number; data: Uint8Array } {
  const size = 40;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(14, 9);
  ctx.lineTo(29, 20);
  ctx.lineTo(14, 31);
  ctx.stroke();
  const img = ctx.getImageData(0, 0, size, size);
  return { width: size, height: size, data: new Uint8Array(img.data.buffer) };
}

const BuildingMap = forwardRef<BuildingMapHandle, Props>(function BuildingMap(
  { stores, routeSteps, destinationId, selectedId, highlightCategory = null, floorWidth, floorHeight,
    origin, focus, heading, initialAzimuth, locale = "en", navEdges = [], onProjection, onBlockClick },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const youMarkerRef = useRef<maplibregl.Marker | null>(null);
  const labelMarkersRef = useRef<maplibregl.Marker[]>([]);
  const readyRef = useRef(false);
  // `ready` STATE (not just the ref) so data/marker effects re-run once the map
  // finishes loading — refs don't trigger re-renders, which left labels unbuilt
  // until the first click changed a prop.
  const [ready, setReady] = useState(false);
  const floorCamRef = useRef<{ center: [number, number]; zoom: number } | null>(null);
  const originRef = useRef(origin);
  const didInitialFrameRef = useRef(false);
  const initialFrameFnRef = useRef<((fitZoom: number) => void) | null>(null);
  const fitZoomRef = useRef(18);
  originRef.current = origin;

  const toLngLat = useMemo(() => makeToLngLat(floorWidth, floorHeight), [floorWidth, floorHeight]);

  // Keep latest callbacks/data in refs so the map's persistent listeners stay current
  const onProjectionRef = useRef(onProjection);
  const onBlockClickRef = useRef(onBlockClick);
  const destLngLatRef = useRef<[number, number] | null>(null);
  onProjectionRef.current = onProjection;
  onBlockClickRef.current = onBlockClick;
  destLngLatRef.current = routeSteps.length >= 2
    ? toLngLat(routeSteps[routeSteps.length - 1].x, routeSteps[routeSteps.length - 1].y)
    : null;

  // Bounds of the whole floor (for fitBounds / recenter)
  const floorBounds = useMemo(() => {
    const sw = toLngLat(0, floorHeight);
    const ne = toLngLat(floorWidth, 0);
    return new maplibregl.LngLatBounds(sw, ne);
  }, [toLngLat, floorWidth, floorHeight]);

  // ── GeoJSON builders ───────────────────────────────────────────────────────
  const roomsFC = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: stores
      .filter((s) => !isOpenSpace(s.category) && s.polygon.length >= 3)
      .map((s) => {
        const ring = s.polygon.map((p) => toLngLat(p.x, p.y));
        ring.push(ring[0]); // close
        return {
          type: "Feature" as const,
          id: s.id,
          properties: {
            id: s.id, name: s.name, nameAr: s.nameAr,
            category: s.category, color: s.color || "#ffffff",
            height: heightMeters(s),
          },
          geometry: { type: "Polygon" as const, coordinates: [ring] },
        };
      }),
  }), [stores, toLngLat]);

  const routeFC = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: routeSteps.length >= 2 ? [{
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "LineString" as const,
        coordinates: routeSteps.map((s) => toLngLat(s.x, s.y)),
      },
    }] : [],
  }), [routeSteps, toLngLat]);

  const corridorsFC = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: navEdges.map((e, i) => ({
      type: "Feature" as const,
      id: i,
      properties: {},
      geometry: {
        type: "LineString" as const,
        coordinates: [toLngLat(e.a.x, e.a.y), toLngLat(e.b.x, e.b.y)],
      },
    })),
  }), [navEdges, toLngLat]);

  const floorFC = useMemo(() => {
    const ring = [
      toLngLat(0, 0), toLngLat(floorWidth, 0),
      toLngLat(floorWidth, floorHeight), toLngLat(0, floorHeight), toLngLat(0, 0),
    ];
    return {
      type: "FeatureCollection" as const,
      features: [{ type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [ring] } }],
    };
  }, [toLngLat, floorWidth, floorHeight]);

  // LEAP-style: clean white blocks; colour only for highlights. Department colour
  // is carried by the zone pills (DOM markers), not the blocks.
  // Priority: destination → selected → category filter → hover (feature-state) → default.
  const colorExpr = useMemo(() => ([
    "case",
    ["==", ["get", "id"], destinationId ?? "__none__"], DEST_COLOR,
    ["==", ["get", "id"], selectedId ?? "__none__"], SELECTED_COLOR,
    ["==", ["get", "category"], highlightCategory ?? "__none__"], CATEGORY_HIGHLIGHT_COLOR,
    ["boolean", ["feature-state", "hover"], false], HOVER_COLOR,
    DEFAULT_BLOCK_COLOR,
  ] as any), [destinationId, selectedId, highlightCategory]);

  // ── Initialise the map once ────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: "bg", type: "background", paint: { "background-color": BACKGROUND } }],
      },
      center: toLngLat(floorWidth / 2, floorHeight / 2),
      zoom: 18,
      pitch: 50,
      bearing: 0,
      attributionControl: false,
      dragRotate: true,
      pitchWithRotate: true,
      maxPitch: 70,
    });
    mapRef.current = map;

    map.on("load", () => {
      // Soft, even light so white blocks read clean (bright tops, gentle gray
      // sides) rather than harsh — matches the LEAP look.
      try {
        map.setLight({ anchor: "viewport", color: "#ffffff", intensity: 0.35, position: [1.5, 200, 50] });
      } catch { /* older style spec — ignore */ }

      // Floor surface + subtle border so the building reads on the cream backdrop
      map.addSource("floor", { type: "geojson", data: floorFC });
      map.addLayer({
        id: "floor-fill", type: "fill", source: "floor",
        paint: { "fill-color": FLOOR_COLOR },
      });
      map.addLayer({
        id: "floor-outline", type: "line", source: "floor",
        paint: { "line-color": "#e4dcca", "line-width": 4 },
      });

      // Corridor wayfinding network (always visible) — light path + arrows
      if (!map.hasImage("corridor-arrow")) {
        map.addImage("corridor-arrow", makeArrowImage(), { pixelRatio: 2 });
      }
      map.addSource("corridors", { type: "geojson", data: corridorsFC });
      map.addLayer({
        id: "corridor-line", type: "line", source: "corridors",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#9aa6b2", "line-width": 5, "line-opacity": 0.45 },
      });
      map.addLayer({
        id: "corridor-arrows", type: "symbol", source: "corridors",
        layout: {
          "symbol-placement": "line",
          "symbol-spacing": 55,
          "icon-image": "corridor-arrow",
          "icon-size": 0.55,
          "icon-rotation-alignment": "map",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
        paint: { "icon-opacity": 0.6 },
      });

      // Rooms (3D extrusion)
      map.addSource("rooms", { type: "geojson", data: roomsFC, promoteId: "id" });
      // Subtle contact shadow: each room's footprint as a soft warm-gray fill
      // offset toward the light's far side, so blocks appear grounded.
      map.addLayer({
        id: "rooms-shadow", type: "fill", source: "rooms",
        paint: { "fill-color": "#9c937f", "fill-opacity": 0.18, "fill-translate": [6, 7], "fill-translate-anchor": "map" },
      });
      map.addLayer({
        id: "rooms-3d", type: "fill-extrusion", source: "rooms",
        paint: {
          "fill-extrusion-color": colorExpr,
          "fill-extrusion-height": ["get", "height"],
          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": 1,
          // MapLibre supports vertical-gradient (top→bottom shading); AO is
          // Mapbox-only, so we fake grounding with the shadow fill above.
          "fill-extrusion-vertical-gradient": true,
        },
      });

      // Route ribbon: a thick rounded bright-blue band with a darker edge and
      // large white chevrons inside it (LEAP-style). Widths interpolate with
      // zoom so the ribbon stays proportionally chunky as you zoom in.
      const haloWidth: any = ["interpolate", ["linear"], ["zoom"], 16, 12, 19, 22, 22, 40];
      const lineWidth: any = ["interpolate", ["linear"], ["zoom"], 16, 8, 19, 16, 22, 30];
      map.addSource("route", { type: "geojson", data: routeFC });
      map.addLayer({
        id: "route-halo", type: "line", source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ROUTE_DARK, "line-width": haloWidth },
      });
      map.addLayer({
        id: "route-line", type: "line", source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ROUTE_COLOR, "line-width": lineWidth },
      });
      // Large white direction chevrons sitting inside the ribbon.
      if (!map.hasImage("route-arrow")) {
        map.addImage("route-arrow", makeChevronImage(), { pixelRatio: 2 });
      }
      map.addLayer({
        id: "route-arrows", type: "symbol", source: "route",
        layout: {
          "symbol-placement": "line",
          "symbol-spacing": ["interpolate", ["linear"], ["zoom"], 16, 34, 20, 70] as any,
          "icon-image": "route-arrow",
          "icon-size": ["interpolate", ["linear"], ["zoom"], 16, 0.5, 20, 1.1] as any,
          "icon-rotation-alignment": "map",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
        paint: { "icon-opacity": 1 },
      });

      // Click to select a room
      map.on("click", "rooms-3d", (e) => {
        const f = e.features?.[0];
        const id = f?.properties?.id as string | undefined;
        if (id) onBlockClickRef.current?.(id);
      });
      // Hover highlight: recolor the block under the cursor via feature-state.
      let hoveredId: string | number | null = null;
      const clearHover = () => {
        if (hoveredId !== null) {
          map.setFeatureState({ source: "rooms", id: hoveredId }, { hover: false });
          hoveredId = null;
        }
      };
      map.on("mousemove", "rooms-3d", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const f = e.features?.[0];
        if (!f || f.id === undefined) return;
        if (hoveredId !== null && hoveredId !== f.id) {
          map.setFeatureState({ source: "rooms", id: hoveredId }, { hover: false });
        }
        hoveredId = f.id;
        map.setFeatureState({ source: "rooms", id: hoveredId }, { hover: true });
      });
      map.on("mouseleave", "rooms-3d", () => {
        map.getCanvas().style.cursor = "";
        clearHover();
      });

      readyRef.current = true;
      setReady(true);
      map.resize();

      // Compute the "whole floor" zoom once; we zoom IN from it onto the scan point.
      const cam = map.cameraForBounds(floorBounds, { padding: 24 });
      const fitZoom = (cam?.zoom as number) ?? 18;
      fitZoomRef.current = fitZoom;
      floorCamRef.current = {
        center: toLngLat(floorWidth / 2, floorHeight / 2),
        zoom: fitZoom + 0.35,
      };

      doInitialFrame(fitZoom);
      emitProjection();
    });

    // Frame onto the QR scan point (origin) at a close zoom, falling back to the
    // whole-floor view if we don't know the origin yet.
    const doInitialFrame = (fitZoom: number) => {
      if (didInitialFrameRef.current) return;
      const o = originRef.current;
      const closeZoom = fitZoom + 1.7; // zoom in to show the area around "you are here"
      if (o) {
        didInitialFrameRef.current = true;
        map.jumpTo({ center: toLngLat(o.x, o.y), zoom: closeZoom, pitch: 50, bearing: 0 });
      } else {
        // origin not loaded yet → show the floor; the effect below will re-frame.
        map.jumpTo({ center: toLngLat(floorWidth / 2, floorHeight / 2), zoom: fitZoom + 0.35, pitch: 50, bearing: 0 });
      }
    };
    initialFrameFnRef.current = doInitialFrame;

    let lastAzimuth = NaN;
    let lastEmit = 0;
    const emitProjection = (force = false) => {
      const cb = onProjectionRef.current;
      if (!cb) return;
      // Raw map bearing (radians). The compass combines this with the building's
      // northOffset to point its needle at true north.
      const azimuth = (map.getBearing() * Math.PI) / 180;
      // The only consumer (the compass) reads `azimuth`, which changes on rotate
      // — never on pan/zoom. Skip the re-render unless the bearing actually moved,
      // and cap rotation updates to ~10fps so the page never thrashes the map.
      if (!force) {
        if (Math.abs(azimuth - lastAzimuth) < 0.0015) return;
        const now = performance.now();
        if (now - lastEmit < 100) return;
        lastEmit = now;
      }
      lastAzimuth = azimuth;
      cb({ azimuth, destScreen: null });
    };
    map.on("rotate", emitProjection);
    map.on("moveend", () => emitProjection(true));

    return () => {
      readyRef.current = false;
      mapRef.current = null;
      try { map.stop(); } catch { /* noop */ }
      try { map.remove(); } catch { /* noop */ }
    };

  }, []); // init once

  // ── Frame onto the QR scan point once origin is known (post-load) ──────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || didInitialFrameRef.current) return;
    if (!origin) return;
    initialFrameFnRef.current?.(fitZoomRef.current);
  }, [origin, ready]);

  // ── Push data updates ──────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    (map.getSource("rooms") as maplibregl.GeoJSONSource | undefined)?.setData(roomsFC as any);
  }, [roomsFC, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    (map.getSource("route") as maplibregl.GeoJSONSource | undefined)?.setData(routeFC as any);
  }, [routeFC, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    (map.getSource("corridors") as maplibregl.GeoJSONSource | undefined)?.setData(corridorsFC as any);
  }, [corridorsFC, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    (map.getSource("floor") as maplibregl.GeoJSONSource | undefined)?.setData(floorFC as any);
  }, [floorFC, ready]);

  // Recolor on selection/destination change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !map.getLayer("rooms-3d")) return;
    map.setPaintProperty("rooms-3d", "fill-extrusion-color", colorExpr);
  }, [colorExpr, ready]);

  // ── Markers: zone pills + amenity badges + logos + room labels ─────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    labelMarkersRef.current.forEach((m) => m.remove());
    labelMarkersRef.current = [];

    const real = stores.filter((s) => !isOpenSpace(s.category) && s.polygon.length >= 3);
    const centroid = (s: StoreData) => ({
      x: s.polygon.reduce((a, p) => a + p.x, 0) / s.polygon.length,
      y: s.polygon.reduce((a, p) => a + p.y, 0) / s.polygon.length,
    });
    const addMarker = (lngLat: [number, number], el: HTMLElement) => {
      labelMarkersRef.current.push(new maplibregl.Marker({ element: el }).setLngLat(lngLat).addTo(map));
    };

    // 1) ZONE PILLS — one big colored pill at the centroid of each zone group
    const zoneGroups = new Map<string, { en: string; ar: string; color: string; xs: number[]; ys: number[] }>();
    for (const s of real) {
      if (!s.zone) continue;
      const g = zoneGroups.get(s.zone) ?? { en: s.zone, ar: s.zoneAr || s.zone, color: s.color, xs: [], ys: [] };
      const c = centroid(s);
      g.xs.push(c.x); g.ys.push(c.y);
      zoneGroups.set(s.zone, g);
    }
    for (const g of zoneGroups.values()) {
      const mx = g.xs.reduce((a, v) => a + v, 0) / g.xs.length;
      const my = g.ys.reduce((a, v) => a + v, 0) / g.ys.length;
      const el = document.createElement("div");
      el.dataset.kind = "zone";
      el.style.cssText = "pointer-events:none;transform:translate(-50%,-50%);white-space:nowrap;font-weight:800;font-size:13px;letter-spacing:0.04em;color:#fff;padding:6px 16px;border-radius:9999px;border:2px solid rgba(255,255,255,0.92);box-shadow:0 6px 16px rgba(15,23,42,0.32),0 1px 0 rgba(255,255,255,0.4) inset;text-transform:uppercase;text-shadow:0 1px 2px rgba(0,0,0,0.25)";
      el.style.background = g.color;
      el.textContent = locale === "ar" ? g.ar : g.en;
      addMarker(toLngLat(mx, my), el);
    }

    // 2) PER-STORE markers
    for (const s of real) {
      const c = centroid(s);
      const ll = toLngLat(c.x, c.y);
      const isDest = s.id === destinationId;
      const isSel = s.id === selectedId;
      const name = locale === "ar" ? s.nameAr : s.name;

      // Highlighted (destination / selected) → bold colored pill, always on top
      if (isDest || isSel) {
        const el = document.createElement("div");
        el.dataset.kind = "highlight";
        el.style.cssText = "pointer-events:none;transform:translate(-50%,-50%);white-space:nowrap;font-weight:800;font-size:12px;color:#fff;border:2px solid #fff;border-radius:9999px;padding:3px 10px;box-shadow:0 4px 10px rgba(0,0,0,0.28)";
        el.style.background = isDest ? "#7c3aed" : "#ec4899";
        el.textContent = `${categoryGlyph(s.category)}  ${name}`;
        addMarker(ll, el);
        continue;
      }

      // Logo badge (mall stores etc.)
      if (s.logoUrl) {
        const el = document.createElement("div");
        el.dataset.kind = "logo";
        el.style.cssText = "pointer-events:none;transform:translate(-50%,-50%);background:#fff;border-radius:9999px;padding:3px 8px;box-shadow:0 2px 6px rgba(0,0,0,0.2);display:flex;align-items:center;gap:4px;max-width:120px";
        const img = document.createElement("img");
        img.src = s.logoUrl;
        img.style.cssText = "height:18px;width:auto;object-fit:contain";
        img.onerror = () => { el.textContent = name; };
        el.appendChild(img);
        addMarker(ll, el);
        continue;
      }

      // Amenity → colored icon badge
      const am = amenityBadge(s);
      if (am) {
        const el = document.createElement("div");
        el.dataset.kind = "amenity";
        el.style.cssText = "pointer-events:none;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:2px";
        el.innerHTML = `
          <div style="width:26px;height:26px;border-radius:9999px;background:${am.bg};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;font-size:14px;line-height:1">${am.icon}</div>
          <div style="font-size:10px;font-weight:700;color:#0f172a;text-shadow:0 1px 0 #fff,0 0 3px rgba(255,255,255,0.9);max-width:90px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</div>`;
        addMarker(ll, el);
        continue;
      }

      // Plain room label
      const el = document.createElement("div");
      el.dataset.kind = "room";
      el.style.cssText = "pointer-events:none;transform:translate(-50%,-50%);white-space:nowrap;font-weight:700;font-size:12px;color:#0f172a;text-shadow:0 1px 0 #fff,0 0 4px rgba(255,255,255,0.9);text-align:center";
      el.textContent = name;
      addMarker(ll, el);
    }

    // 3) Zoom-based LOD: show room labels when zoomed in (the default view), and
    //    swap to zone pills only when zoomed out to the whole floor.
    const applyLod = () => {
      const fz = fitZoomRef.current;
      const z = map.getZoom();
      const showRooms = z >= fz + 0.8;   // default close view is fz+1.7 → rooms visible
      const showZones = z < fz + 1.3;    // zoomed out → zone pills carry the map
      for (const m of labelMarkersRef.current) {
        const el = m.getElement();
        const kind = el.dataset.kind;
        if (kind === "room" || kind === "logo") el.style.display = showRooms ? "" : "none";
        else if (kind === "zone") el.style.display = showZones ? "" : "none";
        // amenity + highlight always visible
      }
    };
    applyLod();
    // Re-run on zoom AND after the camera settles (the initial jump fires moveend
    // once fitZoom is known) so labels aren't stuck hidden at first paint.
    map.on("zoom", applyLod);
    map.on("moveend", applyLod);
    return () => { map.off("zoom", applyLod); map.off("moveend", applyLod); };
  }, [stores, destinationId, selectedId, locale, toLngLat, ready]);

  // ── "You are here" marker (pulsing dot + heading wedge) ────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    youMarkerRef.current?.remove();
    youMarkerRef.current = null;
    if (!origin) return;

    const el = document.createElement("div");
    el.style.width = "26px";
    el.style.height = "26px";
    el.style.position = "relative";
    el.innerHTML = `
      <div style="position:absolute;inset:0;border-radius:9999px;background:rgba(56,189,248,0.35);animation:wainpulse 1.6s ease-out infinite"></div>
      <div style="position:absolute;inset:5px;border-radius:9999px;background:#0ea5e9;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>
      ${heading !== null ? `<div style="position:absolute;left:50%;top:50%;width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:14px solid #0ea5e9;transform:translate(-50%,-22px) rotate(${(heading * 180) / Math.PI}deg);transform-origin:50% 22px"></div>` : ""}
    `;
    const marker = new maplibregl.Marker({ element: el })
      .setLngLat(toLngLat(origin.x, origin.y))
      .addTo(map);
    youMarkerRef.current = marker;
  }, [origin, heading, toLngLat, ready]);

  // Bounds covering the whole route (origin → destination), for auto-framing.
  const routeBounds = useMemo(() => {
    if (routeSteps.length < 2) return null;
    const b = new maplibregl.LngLatBounds();
    routeSteps.forEach((s) => b.extend(toLngLat(s.x, s.y)));
    if (origin) b.extend(toLngLat(origin.x, origin.y));
    return b;
  }, [routeSteps, origin, toLngLat]);

  // ── When a route appears, frame the whole path (LEAP-style) ────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !routeBounds) return;
    map.fitBounds(routeBounds, {
      padding: { top: 170, bottom: 120, left: 70, right: 70 },
      pitch: 50,
      duration: 700,
    });
  }, [routeBounds]);

  // ── Focus follow (only when no route is active) ────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !focus || routeBounds) return;
    map.easeTo({ center: toLngLat(focus.x, focus.y), duration: 600 });
  }, [focus, toLngLat, routeBounds]);

  // (Initial-azimuth bearing rotation intentionally omitted — the route
  //  fitBounds below already frames the path, and running both animations at
  //  once triggers MapLibre's _onEaseFrame race. `initialAzimuth` is accepted
  //  for API compatibility but not applied.)
  void initialAzimuth;

  // ── Imperative handle ──────────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    recenter: () => {
      const map = mapRef.current;
      if (!map) return;
      if (routeBounds) {
        map.fitBounds(routeBounds, { padding: { top: 170, bottom: 120, left: 70, right: 70 }, pitch: 50, duration: 600 });
      } else if (focus) {
        map.easeTo({ center: toLngLat(focus.x, focus.y), zoom: fitZoomRef.current + 1.7, pitch: 50, duration: 600 });
      } else if (floorCamRef.current) {
        map.easeTo({ center: floorCamRef.current.center, zoom: floorCamRef.current.zoom, pitch: 50, duration: 600 });
      } else {
        map.fitBounds(floorBounds, { padding: 24, pitch: 50, duration: 600 });
      }
    },
    tiltedView: () => { mapRef.current?.easeTo({ pitch: 50, duration: 400 }); },
    topView: () => { mapRef.current?.easeTo({ pitch: 0, duration: 400 }); },
    zoomIn: () => { mapRef.current?.zoomIn({ duration: 250 }); },
    zoomOut: () => { mapRef.current?.zoomOut({ duration: 250 }); },
  }), [floorBounds, routeBounds, focus, toLngLat]);

  return (
    <>
      <style>{`@keyframes wainpulse { 0% { transform: scale(0.6); opacity: 0.9; } 100% { transform: scale(2.4); opacity: 0; } }`}</style>
      <div ref={containerRef} className="w-full h-full" />
    </>
  );
});

export default BuildingMap;
