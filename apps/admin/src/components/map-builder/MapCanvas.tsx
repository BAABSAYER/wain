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
import useImage from "use-image";
import { useMapBuilderStore } from "@/store/map-builder";
import { findPreset } from "./shape-presets";
import { nanoid } from "./nanoid";

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

export default function MapCanvas({
  floorPlanUrl, floorWidth, floorHeight, canvasWidth, canvasHeight, onCreateQR,
}: Props) {
  const [bgImage] = useImage(floorPlanUrl ?? "");
  const stageRef = useRef<any>(null);
  const [edgeStart, setEdgeStart] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const {
    tool, selectedId, selectedKind, stores, nodes, edges,
    activePolygon, activePreset,
    addPolygonPoint, commitPolygon, clearActivePolygon,
    addNode, addEdge, addPresetStore, setActivePreset,
    setSelected, setTool, updateStore,
  } = useMapBuilderStore();

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
    const clickedEmpty = e.target === stageRef.current || e.target.getClassName?.() === "Stage" || e.target.attrs?.id === "bg-rect";
    if (clickedEmpty && tool === "select") {
      setSelected(null);
      return;
    }
    if (!clickedEmpty) return;

    const pos = getStagePos();
    if (tool === "polygon") { addPolygonPoint(pos); return; }
    if (tool === "node")    { addNode({ id: nanoid(), x: pos.x, y: pos.y, type: "path" }); return; }
    if (tool === "shape" && activePreset) {
      const preset = findPreset(activePreset);
      if (!preset) return;
      addPresetStore({
        id: nanoid(),
        name: "New Room",
        nameAr: "غرفة جديدة",
        category: "other",
        color: "#cbd5e1",
        extrudeHeight: 5,
        polygon: preset.build(pos),
      });
      // Keep the preset selected so the user can drop several in a row.
      return;
    }
  }, [tool, activePreset, getStagePos, addPolygonPoint, addNode, addPresetStore, setSelected]);

  const handleStageDblClick = useCallback(() => {
    if (tool === "polygon" && activePolygon.length >= 3) {
      commitPolygon({
        id: nanoid(),
        name: "New Room",
        nameAr: "غرفة جديدة",
        category: "other",
        color: "#cbd5e1",
        extrudeHeight: 5,
      });
    }
  }, [tool, activePolygon, commitPolygon]);

  const handleNodeClick = useCallback((nodeId: string, e: any) => {
    e.cancelBubble = true;
    if (tool === "edge") {
      if (!edgeStart) setEdgeStart(nodeId);
      else if (edgeStart !== nodeId) { addEdge({ id: nanoid(), fromId: edgeStart, toId: nodeId }); setEdgeStart(null); }
      return;
    }
    if (tool === "qr") { onCreateQR?.(nodeId); return; }
    if (tool === "select") setSelected(nodeId, "node");
  }, [tool, edgeStart, addEdge, setSelected, onCreateQR]);

  const handleEdgeClick = useCallback((edgeId: string, e: any) => {
    e.cancelBubble = true;
    if (tool === "select") setSelected(edgeId, "edge");
  }, [tool, setSelected]);

  const handleStoreClick = useCallback((storeId: string, e: any) => {
    e.cancelBubble = true;
    if (tool === "select") setSelected(storeId, "store");
  }, [tool, setSelected]);

  const handleMouseMove = useCallback(() => {
    if (tool === "polygon" || (tool === "edge" && edgeStart)) {
      setMousePos(getStagePos());
    }
  }, [tool, edgeStart, getStagePos]);

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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        clearActivePolygon();
        setEdgeStart(null);
        setActivePreset(null);
        setSelected(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [clearActivePolygon, setSelected, setActivePreset]);

  const nodeById = (id: string) => nodes.find((n) => n.id === id);

  // ── Vertex drag handlers ────────────────────────────────────────────────
  const handleVertexDrag = useCallback((storeId: string, vertexIdx: number, e: any) => {
    const store = stores.find((s) => s.id === storeId);
    if (!store) return;
    const nx = e.target.x();
    const ny = e.target.y();
    const next = store.polygon.map((p, i) => (i === vertexIdx ? { x: nx, y: ny } : p));
    updateStore(storeId, { polygon: next });
  }, [stores, updateStore]);

  // ── Whole-shape drag: translate every vertex by the Line's offset ─────────
  const handleShapeDragEnd = useCallback((storeId: string, e: any) => {
    const store = stores.find((s) => s.id === storeId);
    if (!store) return;
    const dx = e.target.x();
    const dy = e.target.y();
    if (dx === 0 && dy === 0) return;
    const next = store.polygon.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    e.target.position({ x: 0, y: 0 }); // reset the Line node back to origin
    updateStore(storeId, { polygon: next });
  }, [stores, updateStore]);

  // Cursor handling for hover affordances (move on shape, resize on vertex)
  const setCursor = (cur: string) => {
    const container = stageRef.current?.container?.();
    if (container) container.style.cursor = cur;
  };

  return (
    <div className="flex-1 overflow-hidden bg-slate-100 relative" style={{ cursor: tool === "pan" ? "grab" : "crosshair" }}>
      {/* Status banners */}
      {tool === "edge" && edgeStart && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-amber-500 text-white text-xs px-3 py-1 rounded-full z-10 shadow">
          Click another node to connect — ESC to cancel
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
      {tool === "qr" && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-pink-500 text-white text-xs px-3 py-1 rounded-full z-10 shadow">
          Click a nav node to create a QR scan point
        </div>
      )}

      <Stage
        ref={stageRef}
        width={canvasWidth}
        height={canvasHeight}
        draggable={tool === "pan"}
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
            const isSel = selectedKind === "store" && selectedId === store.id;
            const canDragShape = tool === "select" && isSel;
            return (
              <Group key={store.id}>
                <Line
                  points={store.polygon.flatMap((p) => [p.x, p.y])}
                  closed
                  fill={`${store.color}cc`}
                  stroke={isSel ? "#2563eb" : "#475569"}
                  strokeWidth={isSel ? 2.5 : 1}
                  onClick={(e: any) => handleStoreClick(store.id, e)}
                  onTap={(e: any) => handleStoreClick(store.id, e)}
                  draggable={canDragShape}
                  onDragEnd={(e: any) => handleShapeDragEnd(store.id, e)}
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
              {activePolygon.map((p, i) => (
                <Circle key={i} x={p.x} y={p.y} radius={4} fill="#3b82f6" />
              ))}
            </>
          )}
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

          {nodes.map((node) => {
            const isSel = selectedKind === "node" && selectedId === node.id;
            const isEdgeStart = edgeStart === node.id;
            const baseColor = NODE_COLORS[node.type] ?? "#3b82f6";
            return (
              <Group key={node.id}>
                <Circle
                  x={node.x} y={node.y}
                  radius={isEdgeStart ? 11 : 8}
                  fill="#ffffff"
                  stroke={baseColor}
                  strokeWidth={3}
                  onClick={(e: any) => handleNodeClick(node.id, e)}
                  onTap={(e: any) => handleNodeClick(node.id, e)}
                  shadowBlur={isEdgeStart || isSel ? 10 : 0}
                  shadowColor={baseColor}
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
              </Group>
            );
          })}
        </Layer>

        {/* Vertex handles layer (top-most so they're always grabbable) */}
        <Layer>
          {tool === "select" && selectedKind === "store" && (() => {
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
                onDragMove={(e: any) => handleVertexDrag(store.id, idx, e)}
                onMouseEnter={() => setCursor("nwse-resize")}
                onMouseLeave={() => setCursor("crosshair")}
                onClick={(e: any) => { e.cancelBubble = true; }}
                onTap={(e: any) => { e.cancelBubble = true; }}
              />
            ));
          })()}
        </Layer>
      </Stage>
    </div>
  );
}
