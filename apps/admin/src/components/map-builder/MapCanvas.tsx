"use client";
import { useRef, useCallback, useEffect, useState } from "react";
import type { ComponentType } from "react";
import {
  Stage as StageRaw,
  Layer as LayerRaw,
  Line as LineRaw,
  Circle as CircleRaw,
  Group as GroupRaw,
  Text as TextRaw,
  Image as KonvaImageRaw,
  Rect as RectRaw,
  Transformer as TransformerRaw,
} from "react-konva";

// react-konva@19's component types aren't valid JSX element types under React 19's
// stricter JSX checking (surfaces only in `next build`, not `next dev`). Re-cast to
// plain component types — runtime behaviour is unaffected.
const Stage = StageRaw as unknown as ComponentType<any>;
const Layer = LayerRaw as unknown as ComponentType<any>;
const Line = LineRaw as unknown as ComponentType<any>;
const Circle = CircleRaw as unknown as ComponentType<any>;
const Group = GroupRaw as unknown as ComponentType<any>;
const Text = TextRaw as unknown as ComponentType<any>;
const KonvaImage = KonvaImageRaw as unknown as ComponentType<any>;
const Rect = RectRaw as unknown as ComponentType<any>;
const Transformer = TransformerRaw as unknown as ComponentType<any>;
import useImage from "use-image";
import { useMapBuilderStore } from "@/store/map-builder";
import { findPreset } from "./shape-presets";
import { findAssetPreset } from "./asset-presets";
import { nanoid } from "./nanoid";
import { copyToClipboard, pasteFromClipboard } from "./clipboard";

interface Props {
  floorPlanUrl?: string;
  floorWidth: number;
  floorHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  onCreateQR?: (nodeId: string) => void;
}

const NODE_COLORS: Record<string, string> = {
  path: "#3b82f6",
  entrance: "#22c55e",
  elevator: "#f59e0b",
  stairs: "#ef4444",
  escalator: "#a855f7",
  qr: "#ec4899",
};

const LINE_SNAP_THRESHOLD = 18;
const LINE_SNAP_EXTENSION = 120;
const EDGE_ANGLE_STEP = Math.PI / 4;

type Point = { x: number; y: number };

export default function MapCanvas({
  floorPlanUrl, floorWidth, floorHeight, canvasWidth, canvasHeight, onCreateQR,
}: Props) {
  const [bgImage] = useImage(floorPlanUrl ?? "");
  const stageRef = useRef<any>(null);
  // Word-style resize handles (the 8-handle box) attach to the selected room's
  // Line via a Konva Transformer. We keep a ref per store so the Transformer
  // can re-attach when the selection changes without rebuilding the layer.
  const lineRefs = useRef<Record<string, any>>({});
  const assetRefs = useRef<Record<string, any>>({});
  const transformerRef = useRef<any>(null);
  const assetTransformerRef = useRef<any>(null);
  const [edgeStart, setEdgeStart] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isSpacePanning, setIsSpacePanning] = useState(false);
  const [isStageDragging, setIsStageDragging] = useState(false);

  const {
    tool, selectedId, selectedKind, extraSelectedIds, stores, assets, nodes, edges,
    activePolygon, activePreset, activeAssetPreset,
    addPolygonPoint, commitPolygon, clearActivePolygon,
    addNode, addEdge, addPresetStore, setActivePreset,
    addAsset, updateAsset, removeAsset,
    setSelected, setTool, updateStore, updateNode,
    removeStore, removeNode, removeEdge,
    toggleExtraSelection, selectAllStores,
    bringStoreToFront, sendStoreToBack,
    pushSnapshot, undo, redo,
    gridSnap, setGridSnap,
    linkModeStoreId, exitLinkMode, toggleStoreNavLink,
  } = useMapBuilderStore();

  // Snap a single value (or 2D point) to the nearest grid step. No-op when
  // grid-snap is off so dragging stays smooth/free.
  const snap = useCallback((v: number) => (gridSnap ? Math.round(v / 10) * 10 : v), [gridSnap]);

  const snapToGrid = useCallback((pt: Point): Point => ({
    x: snap(pt.x),
    y: snap(pt.y),
  }), [snap]);

  const snapToNavLine = useCallback((pt: Point, ignoreNodeId?: string): Point => {
    let best: { point: Point; distance: number } | null = null;

    for (const edge of edges) {
      if (ignoreNodeId && (edge.fromId === ignoreNodeId || edge.toId === ignoreNodeId)) continue;
      const from = nodes.find((n) => n.id === edge.fromId);
      const to = nodes.find((n) => n.id === edge.toId);
      if (!from || !to) continue;

      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq === 0) continue;

      const len = Math.sqrt(lenSq);
      const extensionT = LINE_SNAP_EXTENSION / len;
      const rawT = ((pt.x - from.x) * dx + (pt.y - from.y) * dy) / lenSq;
      const t = Math.max(-extensionT, Math.min(1 + extensionT, rawT));
      const projected = { x: from.x + t * dx, y: from.y + t * dy };
      const distance = Math.hypot(pt.x - projected.x, pt.y - projected.y);

      if (distance <= LINE_SNAP_THRESHOLD && (!best || distance < best.distance)) {
        best = { point: projected, distance };
      }
    }

    return best ? snapToGrid(best.point) : snapToGrid(pt);
  }, [edges, nodes, snapToGrid]);

  // Keep corridor segments on clean 45-degree bearings. This removes small
  // left/right placement errors while still allowing diagonal floor plans.
  const snapEdgePoint = useCallback((pt: Point, fromNodeId: string): Point => {
    const from = nodes.find((node) => node.id === fromNodeId);
    if (!from) return snapToGrid(pt);

    const dx = pt.x - from.x;
    const dy = pt.y - from.y;
    const rawDistance = Math.hypot(dx, dy);
    if (rawDistance === 0) return { x: from.x, y: from.y };

    const angle = Math.round(Math.atan2(dy, dx) / EDGE_ANGLE_STEP) * EDGE_ANGLE_STEP;
    const distance = gridSnap ? Math.round(rawDistance / 10) * 10 : rawDistance;
    return {
      x: from.x + Math.cos(angle) * distance,
      y: from.y + Math.sin(angle) * distance,
    };
  }, [nodes, gridSnap, snapToGrid]);

  const getStoreLinkedNodeIds = useCallback((store: typeof stores[number]) => {
    return store.navLinkNodeIds && store.navLinkNodeIds.length > 0
      ? store.navLinkNodeIds
      : (store.navNodeId ? [store.navNodeId] : []);
  }, []);

  const selectedStore = selectedKind === "store" && selectedId
    ? stores.find((s) => s.id === selectedId) ?? null
    : null;
  const selectedStoreLinkedNodeIds = selectedStore ? getStoreLinkedNodeIds(selectedStore) : [];
  const selectedNodeLinkedStoreIds = selectedKind === "node" && selectedId
    ? stores
        .filter((store) => getStoreLinkedNodeIds(store).includes(selectedId))
        .map((store) => store.id)
    : [];
  const highlightedNodeIds = new Set(selectedStoreLinkedNodeIds);
  const highlightedStoreIds = new Set(selectedNodeLinkedStoreIds);

  // Right-click context menu state. Anchored at screen coords from the event.
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; storeId: string } | null>(null);
  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

  // Center the floor in the viewport on initial mount
  useEffect(() => {
    if (!stageRef.current) return;
    const stage = stageRef.current;
    const scaleX = canvasWidth / floorWidth;
    const scaleY = canvasHeight / floorHeight;
    const scale = Math.min(scaleX, scaleY) * 0.9;
    stage.scale({ x: scale, y: scale });
    stage.position({
      x: (canvasWidth - floorWidth * scale) / 2,
      y: (canvasHeight - floorHeight * scale) / 2,
    });
    stage.batchDraw();

  }, [floorWidth, floorHeight]); // intentional, run only on dim change

  const getStagePos = useCallback(() => {
    const stage = stageRef.current;
    const pos = stage.getPointerPosition();
    const scale = stage.scaleX();
    return {
      x: (pos.x - stage.x()) / scale,
      y: (pos.y - stage.y()) / scale,
    };
  }, []);

  const handleStageClick = useCallback((e: any) => {
    if (isSpacePanning) return;
    const clickedEmpty = e.target === stageRef.current || e.target.getClassName?.() === "Stage" || e.target.attrs?.id === "bg-rect";
    if (tool === "select") {
      if (clickedEmpty) setSelected(null);
      return;
    }

    const raw = getStagePos();
    const pos = tool === "node" ? snapToNavLine(raw) : snapToGrid(raw);
    if (tool === "polygon") { pushSnapshot(); addPolygonPoint(pos); return; }
    if (tool === "node")    { pushSnapshot(); addNode({ id: nanoid(), x: pos.x, y: pos.y, type: "path" }); return; }
    if (tool === "edge") {
      const newId = nanoid();
      const edgePos = edgeStart ? snapEdgePoint(raw, edgeStart) : snapToGrid(raw);
      const startNode = edgeStart ? nodes.find((node) => node.id === edgeStart) : null;
      if (startNode && Math.hypot(edgePos.x - startNode.x, edgePos.y - startNode.y) < 1) return;

      pushSnapshot();
      addNode({ id: newId, x: edgePos.x, y: edgePos.y, type: "path" });
      if (edgeStart) addEdge({ id: nanoid(), fromId: edgeStart, toId: newId });
      setEdgeStart(newId);
      return;
    }
    if (tool === "asset" && activeAssetPreset) {
      const preset = findAssetPreset(activeAssetPreset);
      if (!preset) return;
      pushSnapshot();
      addAsset({
        id: nanoid(),
        type: preset.type,
        label: preset.label,
        x: pos.x,
        y: pos.y,
        z: 0,
        rotation: 0,
        scale: preset.defaultScale ?? 1,
        color: preset.color,
        modelUrl: preset.modelUrl ?? null,
      });
      return;
    }
    if (tool === "shape" && activePreset) {
      const preset = findPreset(activePreset);
      if (!preset) return;
      pushSnapshot();
      addPresetStore({
        id: nanoid(),
        name: preset.label,
        nameAr: "غرفة جديدة",
        category: (preset.category ?? "other") as any,
        color: preset.color ?? "#cbd5e1",
        extrudeHeight: preset.extrudeHeight ?? 5,
        polygon: preset.build(pos),
      });
      // Keep the preset selected so the user can drop several in a row.
      return;
    }
  }, [isSpacePanning, tool, activePreset, activeAssetPreset, edgeStart, nodes, getStagePos, addPolygonPoint, addNode, addEdge, addAsset, addPresetStore, setSelected, pushSnapshot, snapToGrid, snapToNavLine, snapEdgePoint]);

  const closeActivePolygon = useCallback(() => {
    if (activePolygon.length >= 3) {
      pushSnapshot();
      commitPolygon({
        id: nanoid(),
        name: "New Room",
        nameAr: "غرفة جديدة",
        category: "other",
        color: "#cbd5e1",
        extrudeHeight: 5,
      });
    }
  }, [activePolygon, commitPolygon, pushSnapshot]);

  const handleStageDblClick = useCallback(() => {
    if (isSpacePanning || tool !== "polygon") return;
    closeActivePolygon();
  }, [isSpacePanning, tool, closeActivePolygon]);

  const handleNodeClick = useCallback((nodeId: string, e: any) => {
    if (isSpacePanning) {
      e.cancelBubble = true;
      return;
    }
    // Link mode wins over every other tool: clicking a node toggles its
    // membership in the active store's link list. Stays in link mode until
    // the user presses Esc or hits the toolbar button again.
    if (linkModeStoreId) {
      e.cancelBubble = true;
      pushSnapshot();
      toggleStoreNavLink(linkModeStoreId, nodeId);
      return;
    }
    if (tool === "edge") {
      e.cancelBubble = true;
      if (!edgeStart) setEdgeStart(nodeId);
      else if (edgeStart === nodeId) setEdgeStart(null);
      else if (edgeStart !== nodeId) {
        pushSnapshot();
        addEdge({ id: nanoid(), fromId: edgeStart, toId: nodeId });
        setEdgeStart(null);
      }
      return;
    }
    if (tool === "qr") { e.cancelBubble = true; onCreateQR?.(nodeId); return; }
    if (tool === "select") { e.cancelBubble = true; setSelected(nodeId, "node"); }
  }, [isSpacePanning, tool, edgeStart, addEdge, setSelected, onCreateQR, pushSnapshot, linkModeStoreId, toggleStoreNavLink]);

  const handleEdgeClick = useCallback((edgeId: string, e: any) => {
    if (isSpacePanning) {
      e.cancelBubble = true;
      return;
    }
    if (tool === "select") {
      e.cancelBubble = true;
      setSelected(edgeId, "edge");
    }
  }, [isSpacePanning, tool, setSelected]);

  const handleNodeDragMove = useCallback((nodeId: string, e: any) => {
    const pos = snapToNavLine({ x: e.target.x(), y: e.target.y() }, nodeId);
    e.target.position(pos);
    updateNode(nodeId, pos);
  }, [snapToNavLine, updateNode]);

  const handleStoreClick = useCallback((storeId: string, e: any) => {
    if (isSpacePanning) {
      e.cancelBubble = true;
      return;
    }
    if (tool !== "select") return;
    e.cancelBubble = true;
    // Shift-click adds (or removes) the room from a multi-room selection so
    // several can be grouped at once via the bulk-edit panel.
    if (e.evt?.shiftKey) toggleExtraSelection(storeId);
    else setSelected(storeId, "store");
  }, [isSpacePanning, tool, setSelected, toggleExtraSelection]);

  const handleMouseMove = useCallback(() => {
    if (isSpacePanning) return;
    if (tool === "polygon") setMousePos(getStagePos());
    if (tool === "edge" && edgeStart) setMousePos(snapEdgePoint(getStagePos(), edgeStart));
  }, [isSpacePanning, tool, edgeStart, getStagePos, snapEdgePoint]);

  // Wheel zoom (anchored at pointer)
  const handleWheel = useCallback((e: any) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    const mousePt = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newScale = Math.min(Math.max(oldScale * (1 + direction * 0.1), 0.05), 8);
    stage.scale({ x: newScale, y: newScale });
    stage.position({
      x: pointer.x - mousePt.x * newScale,
      y: pointer.y - mousePt.y * newScale,
    });
  }, []);

  // Holding Space temporarily turns the current tool into a hand tool. The
  // drawing state stays intact, so a long polygon can continue after panning.
  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      return !!element && (
        element.tagName === "INPUT"
        || element.tagName === "TEXTAREA"
        || element.isContentEditable
      );
    };
    const stopSpacePan = () => {
      setIsSpacePanning(false);
      setIsStageDragging(false);
    };
    const handleSpaceDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || isTypingTarget(e.target)) return;
      e.preventDefault();
      if (!e.repeat) setIsSpacePanning(true);
    };
    const handleSpaceUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      stopSpacePan();
    };

    window.addEventListener("keydown", handleSpaceDown);
    window.addEventListener("keyup", handleSpaceUp);
    window.addEventListener("blur", stopSpacePan);
    return () => {
      window.removeEventListener("keydown", handleSpaceDown);
      window.removeEventListener("keyup", handleSpaceUp);
      window.removeEventListener("blur", stopSpacePan);
    };
  }, []);

  // ── Keyboard shortcuts (Word / Canva-style) ─────────────────────────────
  // Esc clears, Ctrl+Z/Y undo/redo, Ctrl+D duplicates, Ctrl+A selects every
  // room on the floor, Delete/Backspace removes the selection, Arrows nudge
  // (Shift = 10×). Skipped while typing in inputs so PropertiesPanel forms
  // behave normally. Every discrete action pushes a history snapshot first
  // so undo restores the pre-action state.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || (tgt as HTMLElement).isContentEditable)) return;

      // Esc — cancel any in-progress drawing and clear selection
      if (e.key === "Escape") {
        clearActivePolygon();
        setEdgeStart(null);
        setActivePreset(null);
        setSelected(null);
        setCtxMenu(null);
        exitLinkMode();
        return;
      }

      const mod = e.ctrlKey || e.metaKey;

      // Ctrl/Cmd+Z — undo; Ctrl/Cmd+Shift+Z (or Ctrl+Y) — redo
      if (mod && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if (mod && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        redo();
        return;
      }

      const selectedIds = (selectedKind === "store" && selectedId)
        ? [selectedId, ...extraSelectedIds]
        : [];

      // Ctrl/Cmd+A — select every room on the floor
      if (mod && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        selectAllStores(stores.map((s) => s.id));
        return;
      }

      // Ctrl/Cmd+C — copy selected rooms to a cross-floor clipboard
      if (mod && (e.key === "c" || e.key === "C")) {
        if (selectedIds.length > 0) {
          e.preventDefault();
          copyToClipboard(stores.filter((s) => selectedIds.includes(s.id)));
        }
        return;
      }

      // Ctrl/Cmd+V — paste clipboard onto THIS floor (new ids, 20u offset)
      if (mod && (e.key === "v" || e.key === "V")) {
        const items = pasteFromClipboard();
        if (items.length === 0) return;
        e.preventDefault();
        pushSnapshot();
        const newIds: string[] = [];
        for (const item of items) {
          const newId = nanoid();
          addPresetStore({
            ...item,
            id: newId,
            name: `${item.name} (copy)`,
            polygon: item.polygon.map((p) => ({ x: p.x + 20, y: p.y + 20 })),
            navNodeId: undefined,
          });
          newIds.push(newId);
        }
        if (newIds.length > 0) selectAllStores(newIds);
        return;
      }

      // Ctrl/Cmd+D — duplicate selection (rooms or single node)
      if (mod && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        const OFFSET = 20;
        if (selectedIds.length > 0) {
          pushSnapshot();
          const newIds: string[] = [];
          for (const id of selectedIds) {
            const src = stores.find((s) => s.id === id);
            if (!src) continue;
            const newId = nanoid();
            addPresetStore({
              ...src,
              id: newId,
              name: `${src.name} (copy)`,
              polygon: src.polygon.map((p) => ({ x: p.x + OFFSET, y: p.y + OFFSET })),
              navNodeId: undefined,
            });
            newIds.push(newId);
          }
          if (newIds.length > 0) selectAllStores(newIds);
        } else if (selectedKind === "node" && selectedId) {
          const src = nodes.find((n) => n.id === selectedId);
          if (src) {
            pushSnapshot();
            const newId = nanoid();
            addNode({ ...src, id: newId, x: src.x + OFFSET, y: src.y + OFFSET });
            setSelected(newId, "node");
          }
        }
        return;
      }

      // Delete / Backspace — remove primary + every extra (rooms), or the
      // selected node / edge.
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedIds.length > 0) {
          e.preventDefault();
          pushSnapshot();
          for (const id of selectedIds) removeStore(id);
        } else if (selectedKind === "node" && selectedId) {
          e.preventDefault();
          pushSnapshot();
          removeNode(selectedId);
        } else if (selectedKind === "asset" && selectedId) {
          e.preventDefault();
          pushSnapshot();
          removeAsset(selectedId);
        } else if (selectedKind === "edge" && selectedId) {
          e.preventDefault();
          pushSnapshot();
          removeEdge(selectedId);
        }
        return;
      }

      // Arrow keys — nudge by 1u; Shift = 10u. Snapshot once per discrete
      // press; held-key autorepeat would push many snapshots — we accept that
      // (capped at 50 entries, oldest drops off).
      if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
        const delta = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -delta : e.key === "ArrowRight" ? delta : 0;
        const dy = e.key === "ArrowUp"   ? -delta : e.key === "ArrowDown"  ? delta : 0;
        if (selectedIds.length > 0) {
          e.preventDefault();
          if (!e.repeat) pushSnapshot();
          for (const id of selectedIds) {
            const s = stores.find((ss) => ss.id === id);
            if (!s) continue;
            updateStore(id, { polygon: s.polygon.map((p) => ({ x: p.x + dx, y: p.y + dy })) });
          }
        } else if (selectedKind === "node" && selectedId) {
          const n = nodes.find((nn) => nn.id === selectedId);
          if (n) {
            e.preventDefault();
            if (!e.repeat) pushSnapshot();
            updateNode(selectedId, { x: n.x + dx, y: n.y + dy });
          }
        } else if (selectedKind === "asset" && selectedId) {
          const asset = assets.find((a) => a.id === selectedId);
          if (asset) {
            e.preventDefault();
            if (!e.repeat) pushSnapshot();
            updateAsset(selectedId, { x: asset.x + dx, y: asset.y + dy });
          }
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    clearActivePolygon, setSelected, setActivePreset,
    selectedId, selectedKind, extraSelectedIds, stores, assets, nodes,
    addPresetStore, addNode, selectAllStores,
    removeStore, removeAsset, removeNode, removeEdge,
    updateStore, updateAsset, updateNode,
    pushSnapshot, undo, redo,
  ]);

  // ── Grid-snap toggle button (top-right overlay) ────────────────────────
  const gridSnapToggle = (
    <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 bg-white border border-slate-200 rounded-full shadow-sm px-2.5 py-1">
      <input
        id="grid-snap"
        type="checkbox"
        checked={gridSnap}
        onChange={(e) => setGridSnap(e.target.checked)}
        className="w-3.5 h-3.5 rounded text-blue-500 focus:ring-blue-500"
      />
      <label htmlFor="grid-snap" className="text-xs font-medium text-slate-600 cursor-pointer select-none">
        Snap to grid (10u)
      </label>
    </div>
  );

  const nodeById = (id: string) => nodes.find((n) => n.id === id);

  // ── Transformer (Word-style 8-handle resize box) ────────────────────────
  // Attach the Transformer to the currently-primary-selected room's Line so
  // the user can scale it: corners scale both axes, mid-edge handles scale
  // a single axis. Hide when nothing is selected or when multi-selecting
  // (bulk-edit mode is for properties, not shape transforms).
  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;
    const isSingleStoreSelection =
      !isSpacePanning && selectedKind === "store" && !!selectedId && extraSelectedIds.length === 0;
    const ln = isSingleStoreSelection ? lineRefs.current[selectedId!] : null;
    tr.nodes(ln ? [ln] : []);
    tr.getLayer()?.batchDraw();
  }, [isSpacePanning, selectedId, selectedKind, extraSelectedIds, stores]);

  useEffect(() => {
    const tr = assetTransformerRef.current;
    if (!tr) return;
    const group = !isSpacePanning && selectedKind === "asset" && selectedId
      ? assetRefs.current[selectedId]
      : null;
    tr.nodes(group ? [group] : []);
    tr.getLayer()?.batchDraw();
  }, [isSpacePanning, selectedId, selectedKind, assets]);

  // Convert the Line's transient scale/rotation/translation back into polygon
  // points. The DB stores final polygon vertices, so rotation is baked into the
  // geometry instead of saved as a separate field.
  const handleStoreTransformEnd = useCallback((storeId: string, e: any) => {
    const node = e.target;
    const transform = node.getTransform().copy();
    node.scaleX(1);
    node.scaleY(1);
    node.rotation(0);
    node.x(0);
    node.y(0);
    const store = stores.find((s) => s.id === storeId);
    if (!store) return;
    const next = store.polygon.map((p) => {
      const transformed = transform.point(p);
      return { x: snap(transformed.x), y: snap(transformed.y) };
    });
    updateStore(storeId, { polygon: next });
  }, [stores, updateStore, snap]);

  // ── Vertex drag handlers ────────────────────────────────────────────────
  const handleVertexDrag = useCallback((storeId: string, vertexIdx: number, e: any) => {
    const store = stores.find((s) => s.id === storeId);
    if (!store) return;
    const nx = snap(e.target.x());
    const ny = snap(e.target.y());
    const next = store.polygon.map((p, i) => (i === vertexIdx ? { x: nx, y: ny } : p));
    updateStore(storeId, { polygon: next });
  }, [stores, updateStore, snap]);

  // ── Whole-shape drag: translate every vertex by the Line's offset ─────────
  const handleShapeDragEnd = useCallback((storeId: string, e: any) => {
    const store = stores.find((s) => s.id === storeId);
    if (!store) return;
    const dx = snap(e.target.x());
    const dy = snap(e.target.y());
    if (dx === 0 && dy === 0) {
      e.target.position({ x: 0, y: 0 });
      return;
    }
    const next = store.polygon.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    e.target.position({ x: 0, y: 0 }); // reset the Line node back to origin
    updateStore(storeId, { polygon: next });
  }, [stores, updateStore, snap]);

  const handleAssetDragEnd = useCallback((assetId: string, e: any) => {
    updateAsset(assetId, { x: snap(e.target.x()), y: snap(e.target.y()) });
  }, [updateAsset, snap]);

  const handleAssetTransformEnd = useCallback((assetId: string, e: any) => {
    const node = e.target;
    const asset = assets.find((item) => item.id === assetId);
    if (!asset) return;
    const transformScale = Math.max(Math.abs(node.scaleX()), Math.abs(node.scaleY()));
    const nextScale = Math.max(0.25, Math.min((asset.scale || 1) * transformScale, 8));
    const rotation = ((node.rotation() % 360) + 360) % 360;
    node.scale({ x: 1, y: 1 });
    updateAsset(assetId, {
      x: snap(node.x()),
      y: snap(node.y()),
      rotation,
      scale: Number(nextScale.toFixed(2)),
    });
  }, [assets, updateAsset, snap]);

  // Cursor handling for hover affordances (move on shape, resize on vertex)
  const setCursor = (cur: string) => {
    const container = stageRef.current?.container?.();
    if (container) container.style.cursor = cur;
  };

  useEffect(() => {
    const container = stageRef.current?.container?.();
    if (container) {
      container.style.cursor = tool === "pan" || isSpacePanning
        ? (isStageDragging ? "grabbing" : "grab")
        : "crosshair";
    }
  }, [tool, isSpacePanning, isStageDragging]);

  // Duplicate a single room with an offset — shared by Ctrl+D and the menu.
  const duplicateStore = useCallback((id: string) => {
    const src = stores.find((s) => s.id === id);
    if (!src) return null;
    const newId = nanoid();
    addPresetStore({
      ...src,
      id: newId,
      name: `${src.name} (copy)`,
      polygon: src.polygon.map((p) => ({ x: p.x + 20, y: p.y + 20 })),
      navNodeId: undefined,
    });
    return newId;
  }, [stores, addPresetStore]);

  return (
    <div
      className="flex-1 overflow-hidden bg-slate-100 relative"
      style={{ cursor: tool === "pan" || isSpacePanning ? (isStageDragging ? "grabbing" : "grab") : "crosshair" }}
      onContextMenu={(e) => { e.preventDefault(); }}
    >
      {gridSnapToggle}
      {/* Status banners */}
      {tool === "edge" && edgeStart && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-amber-500 text-white text-xs px-3 py-1 rounded-full z-10 shadow">
          Click to add a straight segment and corner. Click the active node or press ESC to finish.
        </div>
      )}
      {tool === "polygon" && activePolygon.length > 0 && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-xs px-3 py-1 rounded-full z-10 shadow">
          {activePolygon.length} points — double-click to close polygon — ESC to cancel
        </div>
      )}
      {tool === "shape" && !activePreset && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-slate-700 text-white text-xs px-3 py-1 rounded-full z-10 shadow">
          Pick a preset from the toolbar above
        </div>
      )}
      {tool === "shape" && activePreset && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-xs px-3 py-1 rounded-full z-10 shadow">
          Click anywhere on the floor to drop the shape — ESC to cancel
        </div>
      )}
      {tool === "asset" && !activeAssetPreset && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-slate-700 text-white text-xs px-3 py-1 rounded-full z-10 shadow">
          Pick a 3D asset from the toolbar above
        </div>
      )}
      {tool === "asset" && activeAssetPreset && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-xs px-3 py-1 rounded-full z-10 shadow">
          Click anywhere on the floor to place the asset
        </div>
      )}
      {tool === "qr" && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-pink-500 text-white text-xs px-3 py-1 rounded-full z-10 shadow">
          Click a nav node to create a QR scan point
        </div>
      )}
      {linkModeStoreId && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-emerald-500 text-white text-xs px-3 py-1 rounded-full shadow">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          Link mode — click nav nodes to add/remove. Esc when done.
          <button
            onClick={exitLinkMode}
            className="ml-1 px-2 py-0.5 bg-white/20 hover:bg-white/30 rounded text-[10px] font-semibold"
          >
            Done
          </button>
        </div>
      )}

      <Stage
        ref={stageRef}
        width={canvasWidth}
        height={canvasHeight}
        draggable={tool === "pan" || isSpacePanning}
        onDragStart={(e: any) => {
          if (e.target === stageRef.current) setIsStageDragging(true);
        }}
        onDragEnd={(e: any) => {
          if (e.target === stageRef.current) setIsStageDragging(false);
        }}
        onClick={handleStageClick}
        onDblClick={handleStageDblClick}
        onMouseMove={handleMouseMove}
        onWheel={handleWheel}
      >
        {/* Background floor surface */}
        <Layer>
          <Rect id="bg-rect" x={0} y={0} width={floorWidth} height={floorHeight} fill="#ffffff" stroke="#cbd5e1" strokeWidth={1} />
          {Array.from({ length: Math.floor(floorWidth / 100) + 1 }).map((_, i) => (
            <Line key={`gx-${i}`} points={[i * 100, 0, i * 100, floorHeight]} stroke="#f1f5f9" strokeWidth={1} listening={false} />
          ))}
          {Array.from({ length: Math.floor(floorHeight / 100) + 1 }).map((_, i) => (
            <Line key={`gy-${i}`} points={[0, i * 100, floorWidth, i * 100]} stroke="#f1f5f9" strokeWidth={1} listening={false} />
          ))}
          {bgImage && (
            <KonvaImage image={bgImage} opacity={0.4} x={0} y={0} width={floorWidth} height={floorHeight} listening={false} />
          )}
        </Layer>

        {/* Rooms layer */}
        <Layer>
          {stores.map((store) => {
            const isPrimary = selectedKind === "store" && selectedId === store.id;
            const isExtra = selectedKind === "store" && extraSelectedIds.includes(store.id);
            const isBoundHighlight = highlightedStoreIds.has(store.id);
            const isSel = isPrimary || isExtra;
            // Whole-shape drag only the primary so multi-select stays a
            // batch-edit gesture — moving a group at once is a separate feature.
            const canDragShape = tool === "select" && isPrimary && !isSpacePanning;
            return (
              <Group key={store.id}>
                <Line
                  ref={(node: any) => {
                    if (node) lineRefs.current[store.id] = node;
                    else delete lineRefs.current[store.id];
                  }}
                  points={store.polygon.flatMap((p) => [p.x, p.y])}
                  closed
                  fill={isBoundHighlight ? "#fef3c7cc" : `${store.color}cc`}
                  stroke={isSel ? "#2563eb" : isBoundHighlight ? "#f59e0b" : "#475569"}
                  strokeWidth={isSel ? 2.5 : isBoundHighlight ? 3 : 1}
                  shadowBlur={isBoundHighlight ? 12 : 0}
                  shadowColor="#f59e0b"
                  onClick={(e: any) => handleStoreClick(store.id, e)}
                  onTap={(e: any) => handleStoreClick(store.id, e)}
                  onMouseDown={(e: any) => {
                    // Right-click → context menu (no selection change)
                    if (e.evt?.button === 2 && tool === "select" && !isSpacePanning) {
                      e.cancelBubble = true;
                      e.evt.preventDefault?.();
                      if (!isPrimary) setSelected(store.id, "store");
                      setCtxMenu({ x: e.evt.clientX, y: e.evt.clientY, storeId: store.id });
                    }
                  }}
                  draggable={canDragShape}
                  onDragStart={() => { pushSnapshot(); }}
                  onDragEnd={(e: any) => handleShapeDragEnd(store.id, e)}
                  onTransformStart={() => { pushSnapshot(); }}
                  onTransformEnd={(e: any) => handleStoreTransformEnd(store.id, e)}
                  onMouseEnter={() => canDragShape && setCursor("move")}
                  onMouseLeave={() => canDragShape && setCursor("crosshair")}
                />
                {store.polygon.length > 0 && (
                  <Text
                    x={store.polygon.reduce((s, p) => s + p.x, 0) / store.polygon.length - 60}
                    y={store.polygon.reduce((s, p) => s + p.y, 0) / store.polygon.length - 7}
                    text={store.name}
                    fontSize={12}
                    fontStyle="600"
                    fill="#0f172a"
                    width={120}
                    align="center"
                    listening={false}
                  />
                )}
              </Group>
            );
          })}

          {/* Active polygon being drawn */}
          {activePolygon.length > 0 && (
            <>
              <Line
                points={[...activePolygon.flatMap((p) => [p.x, p.y]), mousePos.x, mousePos.y]}
                stroke="#3b82f6"
                strokeWidth={1.5}
                dash={[6, 3]}
              />
              {activePolygon.map((p, i) => {
                const isClosePoint = i === 0 && activePolygon.length >= 3;
                return (
                  <Circle
                    key={i}
                    x={p.x}
                    y={p.y}
                    radius={isClosePoint ? 7 : 4}
                    fill="#3b82f6"
                    stroke={isClosePoint ? "#ffffff" : undefined}
                    strokeWidth={isClosePoint ? 2 : 0}
                    hitStrokeWidth={isClosePoint ? 10 : 0}
                    onClick={isClosePoint ? (e: any) => {
                      if (isSpacePanning) return;
                      e.cancelBubble = true;
                      closeActivePolygon();
                    } : undefined}
                    onTap={isClosePoint ? (e: any) => {
                      if (isSpacePanning) return;
                      e.cancelBubble = true;
                      closeActivePolygon();
                    } : undefined}
                    onMouseEnter={isClosePoint && !isSpacePanning ? () => setCursor("pointer") : undefined}
                    onMouseLeave={isClosePoint && !isSpacePanning ? () => setCursor("crosshair") : undefined}
                  />
                );
              })}
            </>
          )}
        </Layer>

        {/* Physical assets layer */}
        <Layer>
          {assets.map((asset) => {
            const isSel = selectedKind === "asset" && selectedId === asset.id;
            const size = 38 * (asset.scale || 1);
            const color = asset.color || "#64748b";
            return (
              <Group
                key={asset.id}
                ref={(node: any) => {
                  if (node) assetRefs.current[asset.id] = node;
                  else delete assetRefs.current[asset.id];
                }}
                x={asset.x}
                y={asset.y}
                rotation={asset.rotation}
                draggable={tool === "select" && !isSpacePanning}
                onDragStart={() => { pushSnapshot(); }}
                onDragEnd={(e: any) => handleAssetDragEnd(asset.id, e)}
                onTransformStart={() => { pushSnapshot(); }}
                onTransformEnd={(e: any) => handleAssetTransformEnd(asset.id, e)}
                onClick={(e: any) => {
                  if (isSpacePanning || tool === "select") e.cancelBubble = true;
                  if (!isSpacePanning && tool === "select") setSelected(asset.id, "asset");
                }}
                onTap={(e: any) => {
                  if (isSpacePanning || tool === "select") e.cancelBubble = true;
                  if (!isSpacePanning && tool === "select") setSelected(asset.id, "asset");
                }}
                onMouseEnter={() => tool === "select" && !isSpacePanning && setCursor("move")}
                onMouseLeave={() => tool === "select" && !isSpacePanning && setCursor("crosshair")}
              >
                {asset.type === "tree" ? (
                  <>
                    <Rect x={-size * 0.07} y={size * 0.06} width={size * 0.14} height={size * 0.48} fill="#92400e" cornerRadius={2} />
                    <Circle x={-size * 0.08} y={-size * 0.08} radius={size * 0.34} fill={color} stroke={isSel ? "#2563eb" : "#ffffff"} strokeWidth={isSel ? 3 : 1.5} />
                    <Circle x={size * 0.16} y={size * 0.04} radius={size * 0.26} fill="#86efac" opacity={0.9} />
                  </>
                ) : asset.type === "planter" ? (
                  <>
                    <Rect x={-size * 0.48} y={-size * 0.08} width={size * 0.96} height={size * 0.36} fill="#a16207" stroke={isSel ? "#2563eb" : "#ffffff"} strokeWidth={isSel ? 3 : 1.5} cornerRadius={4} />
                    <Circle x={-size * 0.18} y={-size * 0.18} radius={size * 0.22} fill={color} />
                    <Circle x={size * 0.08} y={-size * 0.2} radius={size * 0.24} fill="#22c55e" />
                    <Circle x={size * 0.26} y={-size * 0.12} radius={size * 0.18} fill="#15803d" />
                  </>
                ) : asset.type === "door" ? (
                  <Line
                    points={[0, -size * 0.55, size * 0.42, -size * 0.08, size * 0.16, -size * 0.08, size * 0.16, size * 0.55, -size * 0.16, size * 0.55, -size * 0.16, -size * 0.08, -size * 0.42, -size * 0.08]}
                    closed
                    fill="#6b7280"
                    stroke={isSel ? "#2563eb" : "#ffffff"}
                    strokeWidth={isSel ? 3 : 1.5}
                  />
                ) : asset.type === "sign" ? (
                  <>
                    <Rect x={-size * 0.06} y={-size * 0.12} width={size * 0.12} height={size * 0.64} fill="#475569" />
                    <Line points={[-size * 0.5, -size * 0.38, size * 0.28, -size * 0.38, size * 0.5, -size * 0.18, size * 0.28, size * 0.02, -size * 0.5, size * 0.02]} closed fill={color} stroke={isSel ? "#2563eb" : "#ffffff"} strokeWidth={isSel ? 3 : 1.5} />
                  </>
                ) : asset.type === "stairs" ? (
                  <>
                    {[0, 1, 2, 3].map((i) => (
                      <Rect key={i} x={-size * 0.5 + i * size * 0.18} y={size * 0.22 - i * size * 0.16} width={size * 0.56} height={size * 0.14} fill={color} stroke={isSel && i === 0 ? "#2563eb" : "#ffffff"} strokeWidth={isSel && i === 0 ? 3 : 1} cornerRadius={1} />
                    ))}
                  </>
                ) : asset.type === "escalator" ? (
                  <>
                    <Line points={[-size * 0.52, size * 0.24, size * 0.48, -size * 0.26]} stroke={color} strokeWidth={size * 0.22} lineCap="round" />
                    <Line points={[-size * 0.4, size * 0.08, size * 0.38, -size * 0.32]} stroke="#e2e8f0" strokeWidth={size * 0.06} lineCap="round" />
                    {isSel && <Circle x={0} y={0} radius={size * 0.58} stroke="#2563eb" strokeWidth={2} dash={[4, 3]} />}
                  </>
                ) : asset.type === "elevator" ? (
                  <>
                    <Rect x={-size * 0.38} y={-size * 0.52} width={size * 0.76} height={size * 1.04} fill="#e2e8f0" stroke={isSel ? "#2563eb" : color} strokeWidth={isSel ? 3 : 2} cornerRadius={3} />
                    <Line points={[0, -size * 0.48, 0, size * 0.48]} stroke="#94a3b8" strokeWidth={2} />
                    <Line points={[-size * 0.2, -size * 0.18, -size * 0.04, -size * 0.36, size * 0.12, -size * 0.18]} closed fill={color} />
                    <Line points={[-size * 0.2, size * 0.18, -size * 0.04, size * 0.36, size * 0.12, size * 0.18]} closed fill={color} />
                  </>
                ) : asset.type === "reception" ? (
                  <>
                    <Rect x={-size * 0.55} y={-size * 0.1} width={size * 1.1} height={size * 0.45} fill={color} stroke={isSel ? "#2563eb" : "#ffffff"} strokeWidth={isSel ? 3 : 1.5} cornerRadius={5} />
                    <Rect x={-size * 0.25} y={-size * 0.42} width={size * 0.5} height={size * 0.28} fill="#f8fafc" stroke={color} strokeWidth={2} cornerRadius={2} />
                  </>
                ) : asset.type === "info" ? (
                  <>
                    <Rect x={-size * 0.08} y={-size * 0.05} width={size * 0.16} height={size * 0.58} fill={color} />
                    <Rect x={-size * 0.34} y={-size * 0.48} width={size * 0.68} height={size * 0.38} fill="#f8fafc" stroke={isSel ? "#2563eb" : color} strokeWidth={isSel ? 3 : 2} cornerRadius={5} />
                    <Rect x={-size * 0.38} y={size * 0.5} width={size * 0.76} height={size * 0.1} fill="#64748b" cornerRadius={4} />
                  </>
                ) : asset.type === "security" ? (
                  <>
                    <Line points={[-size * 0.42, -size * 0.35, size * 0.42, -size * 0.35, size * 0.5, size * 0.42, -size * 0.5, size * 0.42]} closed fill={color} stroke={isSel ? "#2563eb" : "#ffffff"} strokeWidth={isSel ? 3 : 1.5} />
                    <Rect x={-size * 0.22} y={-size * 0.22} width={size * 0.44} height={size * 0.28} fill="#dbeafe" cornerRadius={2} />
                    <Rect x={-size * 0.14} y={-size * 0.48} width={size * 0.28} height={size * 0.16} fill="#334155" cornerRadius={5} />
                  </>
                ) : asset.type === "parking" ? (
                  <>
                    <Rect x={-size * 0.08} y={-size * 0.02} width={size * 0.16} height={size * 0.6} fill="#475569" />
                    <Rect x={-size * 0.42} y={-size * 0.5} width={size * 0.84} height={size * 0.42} fill={color} stroke={isSel ? "#2563eb" : "#ffffff"} strokeWidth={isSel ? 3 : 1.5} cornerRadius={4} />
                    <Rect x={-size * 0.22} y={-size * 0.38} width={size * 0.44} height={size * 0.18} fill="#eff6ff" cornerRadius={6} />
                  </>
                ) : asset.type === "dining" ? (
                  <>
                    <Circle x={0} y={0} radius={size * 0.3} fill={color} stroke={isSel ? "#2563eb" : "#ffffff"} strokeWidth={isSel ? 3 : 1.5} />
                    <Rect x={-size * 0.6} y={-size * 0.14} width={size * 0.18} height={size * 0.32} fill="#94a3b8" cornerRadius={4} />
                    <Rect x={size * 0.42} y={-size * 0.14} width={size * 0.18} height={size * 0.32} fill="#94a3b8" cornerRadius={4} />
                  </>
                ) : asset.type === "bench" ? (
                  <>
                    <Rect x={-size * 0.58} y={-size * 0.22} width={size * 1.16} height={size * 0.18} fill={color} stroke={isSel ? "#2563eb" : "#ffffff"} strokeWidth={isSel ? 3 : 1.5} cornerRadius={2} />
                    <Rect x={-size * 0.48} y={size * 0.04} width={size * 0.96} height={size * 0.18} fill={color} cornerRadius={2} />
                    <Rect x={-size * 0.36} y={size * 0.18} width={size * 0.08} height={size * 0.2} fill="#475569" />
                    <Rect x={size * 0.28} y={size * 0.18} width={size * 0.08} height={size * 0.2} fill="#475569" />
                  </>
                ) : asset.type === "chair" ? (
                  <>
                    <Rect x={-size * 0.32} y={-size * 0.28} width={size * 0.64} height={size * 0.64} fill={color} stroke={isSel ? "#2563eb" : "#ffffff"} strokeWidth={isSel ? 3 : 1.5} cornerRadius={4} />
                    <Rect x={-size * 0.38} y={-size * 0.5} width={size * 0.76} height={size * 0.18} fill="#334155" cornerRadius={3} />
                  </>
                ) : asset.type === "sofa" ? (
                  <>
                    <Rect x={-size * 0.62} y={-size * 0.34} width={size * 1.24} height={size * 0.72} fill={color} stroke={isSel ? "#2563eb" : "#ffffff"} strokeWidth={isSel ? 3 : 1.5} cornerRadius={7} />
                    <Rect x={-size * 0.54} y={-size * 0.42} width={size * 1.08} height={size * 0.16} fill="#334155" cornerRadius={3} />
                  </>
                ) : asset.type === "table" ? (
                  <Circle x={0} y={0} radius={size * 0.48} fill={color} stroke={isSel ? "#2563eb" : "#ffffff"} strokeWidth={isSel ? 3 : 1.5} />
                ) : asset.type === "trashcan" ? (
                  <>
                    <Circle x={0} y={0} radius={size * 0.34} fill={color} stroke={isSel ? "#2563eb" : "#ffffff"} strokeWidth={isSel ? 3 : 1.5} />
                    <Line points={[-size * 0.22, -size * 0.1, size * 0.22, -size * 0.1]} stroke="#cbd5e1" strokeWidth={2} />
                  </>
                ) : asset.type === "floor_lamp" ? (
                  <>
                    <Circle x={0} y={size * 0.3} radius={size * 0.2} fill="#475569" />
                    <Circle x={0} y={-size * 0.18} radius={size * 0.34} fill="#fde68a" stroke={isSel ? "#2563eb" : color} strokeWidth={isSel ? 3 : 1.5} />
                  </>
                ) : asset.type === "potted_plant" ? (
                  <>
                    <Circle x={0} y={size * 0.2} radius={size * 0.28} fill="#a16207" />
                    <Circle x={-size * 0.13} y={-size * 0.12} radius={size * 0.3} fill={color} stroke={isSel ? "#2563eb" : "#ffffff"} strokeWidth={isSel ? 3 : 1.5} />
                    <Circle x={size * 0.16} y={-size * 0.2} radius={size * 0.24} fill="#22c55e" />
                  </>
                ) : asset.type === "barrier" ? (
                  <>
                    <Line points={[-size * 0.58, 0, size * 0.58, -size * 0.2]} stroke={color} strokeWidth={size * 0.16} lineCap="round" />
                    <Rect x={-size * 0.48} y={-size * 0.12} width={size * 0.08} height={size * 0.5} fill="#334155" />
                    <Rect x={size * 0.4} y={-size * 0.22} width={size * 0.08} height={size * 0.5} fill="#334155" />
                    {isSel && <Circle x={0} y={0} radius={size * 0.62} stroke="#2563eb" strokeWidth={2} dash={[4, 3]} />}
                  </>
                ) : asset.type === "kiosk" || asset.type === "atm" ? (
                  <>
                    <Rect x={-size * 0.34} y={-size * 0.52} width={size * 0.68} height={size * 1.04} fill={color} stroke={isSel ? "#2563eb" : "#ffffff"} strokeWidth={isSel ? 3 : 1.5} cornerRadius={5} />
                    <Rect x={-size * 0.22} y={-size * 0.32} width={size * 0.44} height={size * 0.24} fill="#dbeafe" cornerRadius={2} />
                    <Rect x={-size * 0.18} y={size * 0.02} width={size * 0.36} height={size * 0.08} fill="#0f172a" cornerRadius={2} />
                  </>
                ) : (
                  <Line points={[-size * 0.42, -size * 0.35, size * 0.48, -size * 0.24, size * 0.34, size * 0.4, -size * 0.48, size * 0.28]} closed fill={color} stroke={isSel ? "#2563eb" : "#ffffff"} strokeWidth={isSel ? 3 : 1.5} />
                )}
              </Group>
            );
          })}
        </Layer>

        {/* Nav graph layer */}
        <Layer>
          {edges.map((edge) => {
            const from = nodeById(edge.fromId);
            const to = nodeById(edge.toId);
            if (!from || !to) return null;
            const isSel = selectedKind === "edge" && selectedId === edge.id;
            return (
              <Group key={edge.id}>
                {/* Wide invisible hit area for easier clicking */}
                <Line
                  points={[from.x, from.y, to.x, to.y]}
                  stroke="rgba(0,0,0,0.01)"
                  strokeWidth={12}
                  onClick={(e: any) => handleEdgeClick(edge.id, e)}
                  onTap={(e: any) => handleEdgeClick(edge.id, e)}
                />
                <Line
                  points={[from.x, from.y, to.x, to.y]}
                  stroke={isSel ? "#2563eb" : "#94a3b8"}
                  strokeWidth={isSel ? 3 : 1.5}
                  listening={false}
                />
              </Group>
            );
          })}

          {/* Preview edge while drawing */}
          {tool === "edge" && edgeStart && (() => {
            const from = nodeById(edgeStart);
            if (!from) return null;
            return (
              <Line
                points={[from.x, from.y, mousePos.x, mousePos.y]}
                stroke="#f59e0b"
                strokeWidth={2}
                dash={[6, 3]}
              />
            );
          })()}

          {(() => {
            // In link mode, compute which nodes are currently linked to the
            // active store so each one can get a green-ring outline.
            const activeStore = linkModeStoreId ? stores.find((s) => s.id === linkModeStoreId) : null;
            const linkedSet = new Set<string>(activeStore ? getStoreLinkedNodeIds(activeStore) : []);
            const centroid = activeStore && activeStore.polygon.length > 0
              ? {
                  x: activeStore.polygon.reduce((a, p) => a + p.x, 0) / activeStore.polygon.length,
                  y: activeStore.polygon.reduce((a, p) => a + p.y, 0) / activeStore.polygon.length,
                }
              : null;
            return (
              <>
                {/* Dashed connector lines (link mode only) */}
                {centroid && [...linkedSet].map((nodeId) => {
                  const n = nodes.find((nn) => nn.id === nodeId);
                  if (!n) return null;
                  return (
                    <Line
                      key={`link-${nodeId}`}
                      points={[centroid.x, centroid.y, n.x, n.y]}
                      stroke="#10b981"
                      strokeWidth={2}
                      dash={[8, 4]}
                      listening={false}
                    />
                  );
                })}
                {nodes.map((node) => {
                  const isSel = selectedKind === "node" && selectedId === node.id;
                  const isEdgeStart = edgeStart === node.id;
                  const isLinked = linkedSet.has(node.id);
                  const isBoundHighlight = highlightedNodeIds.has(node.id);
                  const baseColor = NODE_COLORS[node.type] ?? "#3b82f6";
                  return (
                    <Group key={node.id}>
                      <Circle
                        x={node.x} y={node.y}
                        radius={isEdgeStart || isBoundHighlight || (linkModeStoreId && !isLinked) ? 11 : 8}
                        fill="#ffffff"
                        stroke={isBoundHighlight ? "#f59e0b" : baseColor}
                        strokeWidth={isBoundHighlight ? 4 : 3}
                        draggable={tool === "select" && !isSpacePanning}
                        onDragStart={() => { pushSnapshot(); }}
                        onDragMove={(e: any) => handleNodeDragMove(node.id, e)}
                        onClick={(e: any) => handleNodeClick(node.id, e)}
                        onTap={(e: any) => handleNodeClick(node.id, e)}
                        onMouseEnter={() => tool === "select" && !isSpacePanning && setCursor("move")}
                        onMouseLeave={() => tool === "select" && !isSpacePanning && setCursor("crosshair")}
                        shadowBlur={isEdgeStart || isSel || isBoundHighlight || (linkModeStoreId ? 12 : 0)}
                        shadowColor={isLinked ? "#10b981" : isBoundHighlight ? "#f59e0b" : baseColor}
                      />
                      <Circle
                        x={node.x} y={node.y}
                        radius={4}
                        fill={baseColor}
                        listening={false}
                      />
                      {isSel && (
                        <Circle
                          x={node.x} y={node.y}
                          radius={14}
                          stroke="#2563eb"
                          strokeWidth={2}
                          dash={[3, 3]}
                          listening={false}
                        />
                      )}
                      {isLinked && (
                        <Circle
                          x={node.x} y={node.y}
                          radius={14}
                          stroke="#10b981"
                          strokeWidth={2.5}
                          listening={false}
                        />
                      )}
                      {isBoundHighlight && (
                        <Circle
                          x={node.x} y={node.y}
                          radius={17}
                          stroke="#f59e0b"
                          strokeWidth={3}
                          listening={false}
                        />
                      )}
                    </Group>
                  );
                })}
              </>
            );
          })()}
        </Layer>

        {/* Vertex handles layer (top-most so they're always grabbable) */}
        <Layer>
          {tool === "select" && !isSpacePanning && selectedKind === "store" && (() => {
            const store = stores.find((s) => s.id === selectedId);
            if (!store) return null;
            return store.polygon.map((p, idx) => (
              <Circle
                key={`vh-${store.id}-${idx}`}
                x={p.x}
                y={p.y}
                radius={7}
                fill="#ffffff"
                stroke="#2563eb"
                strokeWidth={2}
                shadowColor="#000"
                shadowBlur={3}
                shadowOpacity={0.18}
                draggable
                onDragStart={() => { pushSnapshot(); }}
                onDragMove={(e: any) => handleVertexDrag(store.id, idx, e)}
                onMouseEnter={() => setCursor("nwse-resize")}
                onMouseLeave={() => setCursor("crosshair")}
                onClick={(e: any) => { e.cancelBubble = true; }}
                onTap={(e: any) => { e.cancelBubble = true; }}
              />
            ));
          })()}
          {/* Word-style 8-handle scale box. Attaches to the selected room's
              Line via the effect above. Corners scale both axes, mid-edge
              handles scale a single axis. Hidden during multi-select. */}
          <Transformer
            ref={transformerRef}
            rotateEnabled
            rotationSnaps={[0, 15, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330, 345]}
            rotationSnapTolerance={5}
            keepRatio={false}
            enabledAnchors={[
              "top-left", "top-center", "top-right",
              "middle-left", "middle-right",
              "bottom-left", "bottom-center", "bottom-right",
            ]}
            boundBoxFunc={(_oldBox: any, newBox: any) => {
              // Refuse degenerate sizes — keeps the polygon from collapsing
              // through zero (which would also flip orientation).
              if (newBox.width < 10 || newBox.height < 10) return _oldBox;
              return newBox;
            }}
            anchorSize={10}
            anchorStroke="#2563eb"
            anchorFill="#ffffff"
            anchorStrokeWidth={2}
            borderStroke="#2563eb"
            borderDash={[6, 4]}
          />
          <Transformer
            ref={assetTransformerRef}
            rotateEnabled
            keepRatio
            centeredScaling
            rotationSnaps={[0, 15, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330, 345]}
            rotationSnapTolerance={5}
            enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
            boundBoxFunc={(_oldBox: any, newBox: any) => {
              if (Math.abs(newBox.width) < 12 || Math.abs(newBox.height) < 12) return _oldBox;
              return newBox;
            }}
            anchorSize={10}
            anchorStroke="#0f766e"
            anchorFill="#ffffff"
            anchorStrokeWidth={2}
            borderStroke="#0f766e"
            borderDash={[5, 4]}
          />
        </Layer>
      </Stage>

      {ctxMenu && (
        <>
          {/* Click-catcher: closes the menu on any click outside. */}
          <div className="fixed inset-0 z-40" onMouseDown={closeCtxMenu} onContextMenu={(e) => { e.preventDefault(); closeCtxMenu(); }} />
          <ul
            className="fixed z-50 bg-white border border-slate-200 rounded-lg shadow-xl py-1 text-sm min-w-[180px] select-none"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <li>
              <button
                onClick={() => { pushSnapshot(); duplicateStore(ctxMenu.storeId); closeCtxMenu(); }}
                className="w-full text-left px-3 py-1.5 hover:bg-slate-100 text-slate-700 flex items-center justify-between gap-3"
              >
                <span>Duplicate</span>
                <span className="text-xs text-slate-400">Ctrl+D</span>
              </button>
            </li>
            <li>
              <button
                onClick={() => { pushSnapshot(); bringStoreToFront(ctxMenu.storeId); closeCtxMenu(); }}
                className="w-full text-left px-3 py-1.5 hover:bg-slate-100 text-slate-700"
              >
                Bring to Front
              </button>
            </li>
            <li>
              <button
                onClick={() => { pushSnapshot(); sendStoreToBack(ctxMenu.storeId); closeCtxMenu(); }}
                className="w-full text-left px-3 py-1.5 hover:bg-slate-100 text-slate-700"
              >
                Send to Back
              </button>
            </li>
            <li className="my-1 border-t border-slate-100" />
            <li>
              <button
                onClick={() => { pushSnapshot(); removeStore(ctxMenu.storeId); closeCtxMenu(); }}
                className="w-full text-left px-3 py-1.5 hover:bg-red-50 text-red-600 flex items-center justify-between gap-3"
              >
                <span>Delete</span>
                <span className="text-xs text-red-300">Del</span>
              </button>
            </li>
          </ul>
        </>
      )}
    </div>
  );
}
