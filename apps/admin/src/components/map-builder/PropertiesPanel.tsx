"use client";
import { useMapBuilderStore } from "@/store/map-builder";
import BulkEditPanel from "./BulkEditPanel";
import type { StoreCategory } from "@wain/types";

const CATEGORIES: StoreCategory[] = [
  "retail","food","services","medical","education",
  "transit","restroom","elevator","stairs","escalator","entrance","parking","other",
];

const NODE_TYPES = ["path", "entrance", "elevator", "stairs", "escalator", "qr"] as const;

const COLORS = [
  "#ffffff","#cbd5e1","#94a3b8","#64748b",
  "#60a5fa","#3b82f6","#0ea5e9","#06b6d4",
  "#34d399","#10b981","#22c55e","#84cc16",
  "#facc15","#f59e0b","#fb923c","#f87171",
  "#ef4444","#ec4899","#f472b6","#a78bfa",
];

export default function PropertiesPanel() {
  const {
    selectedId, selectedKind, extraSelectedIds, stores, nodes, edges,
    updateStore, removeStore, updateNode, removeNode, removeEdge,
    enterLinkMode, toggleStoreNavLink, setStoreNavLinks, linkModeStoreId,
  } = useMapBuilderStore();

  // 2+ rooms selected → switch the panel to bulk-group mode.
  if (selectedKind === "store" && extraSelectedIds.length > 0 && selectedId) {
    return <BulkEditPanel selectedIds={[selectedId, ...extraSelectedIds]} />;
  }

  if (!selectedId) {
    return (
      <div className="p-4 text-slate-400 text-sm">
        <p>Select an element to edit its properties.</p>
        <ul className="mt-3 text-xs text-slate-400 space-y-1 leading-relaxed">
          <li>• Click a <b className="text-slate-600">room</b> to rename or recolor it.</li>
          <li>• <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px]">Shift</kbd> + click rooms to <b className="text-slate-600">group</b> them into a department.</li>
          <li>• Click a <b className="text-slate-600">node</b> to change its type.</li>
          <li>• Click an <b className="text-slate-600">edge</b> (line between nodes) to remove it.</li>
        </ul>
      </div>
    );
  }

  const store = selectedKind === "store" ? stores.find((s) => s.id === selectedId) : null;
  const node  = selectedKind === "node"  ? nodes.find((n) => n.id === selectedId)  : null;
  const edge  = selectedKind === "edge"  ? edges.find((e) => e.id === selectedId)  : null;

  if (store) {
    return (
      <div className="p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">Room / Store</h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{store.polygon.length} pts</span>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500 font-medium">Name (EN)</span>
          <input
            className="bg-white border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded px-3 py-1.5 text-sm text-slate-900 outline-none"
            value={store.name}
            onChange={(e) => updateStore(store.id, { name: e.target.value })}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500 font-medium">Name (AR)</span>
          <input
            dir="rtl"
            className="bg-white border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded px-3 py-1.5 text-sm text-slate-900 outline-none"
            value={store.nameAr}
            onChange={(e) => updateStore(store.id, { nameAr: e.target.value })}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500 font-medium">Category</span>
          <select
            className="bg-white border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded px-3 py-1.5 text-sm text-slate-900 outline-none"
            value={store.category}
            onChange={(e) => updateStore(store.id, { category: e.target.value as StoreCategory })}
          >
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500 font-medium">Height (m)</span>
          <input
            type="number"
            min={1} max={20}
            className="bg-white border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded px-3 py-1.5 text-sm text-slate-900 outline-none"
            value={store.extrudeHeight}
            onChange={(e) => updateStore(store.id, { extrudeHeight: Number(e.target.value) })}
          />
        </label>

        <div className="border-t border-slate-100 pt-3 mt-1">
          <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-2">Wayfinding</p>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-medium">Zone / Department (EN)</span>
            <input
              className="bg-white border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded px-3 py-1.5 text-sm text-slate-900 outline-none"
              placeholder="e.g. Cardiac Care"
              value={store.zone ?? ""}
              onChange={(e) => updateStore(store.id, { zone: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 mt-2">
            <span className="text-xs text-slate-500 font-medium">Zone (AR)</span>
            <input
              dir="rtl"
              className="bg-white border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded px-3 py-1.5 text-sm text-slate-900 outline-none"
              placeholder="مثال: العناية القلبية"
              value={store.zoneAr ?? ""}
              onChange={(e) => updateStore(store.id, { zoneAr: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 mt-2">
            <span className="text-xs text-slate-500 font-medium">Logo</span>
            <input
              className="bg-white border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded px-3 py-1.5 text-sm text-slate-900 outline-none font-mono text-xs"
              placeholder="https://…/logo.png  (or upload below)"
              value={store.logoUrl ?? ""}
              onChange={(e) => updateStore(store.id, { logoUrl: e.target.value })}
            />
            <div className="flex items-center gap-2 mt-1">
              <label className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded text-xs font-medium text-slate-700 cursor-pointer">
                Upload image
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const reader = new FileReader();
                    reader.onload = () => updateStore(store.id, { logoUrl: reader.result as string });
                    reader.readAsDataURL(f);
                  }}
                />
              </label>
              {store.logoUrl && (
                <button
                  onClick={() => updateStore(store.id, { logoUrl: "" })}
                  className="px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                >Remove</button>
              )}
            </div>
            {store.logoUrl && (
              <img src={store.logoUrl} alt="logo preview" className="mt-1 h-10 w-auto object-contain self-start border border-slate-100 rounded bg-slate-50 p-1" />
            )}
          </label>
        </div>

        {/* Routing: must be linked to at least one nav node to be reachable via Directions */}
        <div className="border-t border-slate-100 pt-3 mt-1">
          <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-2">Routing</p>
          {(() => {
            const linkedIds: string[] = store.navLinkNodeIds && store.navLinkNodeIds.length > 0
              ? store.navLinkNodeIds
              : (store.navNodeId ? [store.navNodeId] : []);
            const linkedNodes = linkedIds
              .map((id) => nodes.find((n) => n.id === id))
              .filter((n): n is NonNullable<typeof n> => !!n);
            const isLinking = linkModeStoreId === store.id;

            const linkNearest = () => {
              if (!store.polygon.length || nodes.length === 0) return;
              const cx = store.polygon.reduce((a, p) => a + p.x, 0) / store.polygon.length;
              const cy = store.polygon.reduce((a, p) => a + p.y, 0) / store.polygon.length;
              let best: typeof nodes[number] | null = null, bestD = Infinity;
              for (const n of nodes) {
                const d = (n.x - cx) ** 2 + (n.y - cy) ** 2;
                if (d < bestD) { bestD = d; best = n; }
              }
              if (best) toggleStoreNavLink(store.id, best.id);
            };

            return (
              <>
                {linkedNodes.length > 0 ? (
                  <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2.5 py-1.5">
                    ✓ Linked to {linkedNodes.length} nav node{linkedNodes.length === 1 ? "" : "s"} — routes pick the closest entrance.
                  </div>
                ) : (
                  <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
                    ⚠ Not linked to a nav node — visitors can&apos;t route here.
                    {nodes.length === 0 && (
                      <span className="block mt-1 text-amber-700">
                        Place nodes with the Node tool first, then come back here.
                      </span>
                    )}
                  </div>
                )}

                {linkedNodes.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1">
                    {linkedNodes.map((n) => (
                      <li key={n.id} className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded px-2 py-1 text-xs">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                          <span className="text-slate-700 truncate">
                            {n.type} <span className="text-slate-400">({Math.round(n.x)}, {Math.round(n.y)})</span>
                          </span>
                        </span>
                        <button
                          onClick={() => toggleStoreNavLink(store.id, n.id)}
                          className="w-5 h-5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center text-sm leading-none flex-shrink-0"
                          title="Unlink this node"
                          aria-label="Unlink this node"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="grid grid-cols-2 gap-2 mt-2">
                  <button
                    onClick={() => enterLinkMode(store.id)}
                    disabled={nodes.length === 0 || isLinking}
                    className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:bg-blue-200 disabled:cursor-not-allowed text-white rounded text-sm font-medium shadow-sm"
                  >
                    {isLinking ? "Link mode active…" : (linkedNodes.length > 0 ? "Add / remove" : "+ Link nodes")}
                  </button>
                  <button
                    onClick={linkNearest}
                    disabled={nodes.length === 0}
                    className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 disabled:opacity-40 border border-blue-200 rounded text-sm text-blue-700 font-medium"
                    title="Link the closest unlinked node"
                  >
                    Add nearest
                  </button>
                </div>
                {linkedNodes.length > 0 && (
                  <button
                    onClick={() => setStoreNavLinks(store.id, [])}
                    className="mt-2 w-full px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-xs text-slate-600 font-medium"
                  >
                    Unlink all
                  </button>
                )}
                <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                  In link mode, click nav nodes on the canvas to add or remove them. Esc to exit. Saving persists the change.
                </p>
              </>
            );
          })()}
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-500 font-medium">Color</span>
          <div className="grid grid-cols-5 gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => updateStore(store.id, { color: c })}
                className={`w-8 h-8 rounded-md border-2 transition-transform ${
                  store.color === c ? "border-blue-500 scale-110" : "border-slate-200 hover:border-slate-400"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <button
          onClick={() => removeStore(store.id)}
          className="mt-2 px-3 py-1.5 bg-red-50 hover:bg-red-100 border border-red-200 rounded text-sm text-red-700 font-medium"
        >
          Delete Room
        </button>
      </div>
    );
  }

  if (node) {
    return (
      <div className="p-4 flex flex-col gap-4">
        <h3 className="font-semibold text-slate-900">Nav Node</h3>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500 font-medium">Type</span>
          <select
            className="bg-white border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded px-3 py-1.5 text-sm text-slate-900 outline-none"
            value={node.type}
            onChange={(e) => updateNode(node.id, { type: e.target.value as typeof node.type })}
          >
            {NODE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-medium">X</span>
            <input
              type="number"
              className="bg-white border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded px-3 py-1.5 text-sm text-slate-900 outline-none"
              value={Math.round(node.x)}
              onChange={(e) => updateNode(node.id, { x: Number(e.target.value) })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-medium">Y</span>
            <input
              type="number"
              className="bg-white border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded px-3 py-1.5 text-sm text-slate-900 outline-none"
              value={Math.round(node.y)}
              onChange={(e) => updateNode(node.id, { y: Number(e.target.value) })}
            />
          </label>
        </div>

        <p className="text-xs text-slate-400">
          ID: <span className="font-mono break-all">{node.id}</span>
        </p>

        <button
          onClick={() => removeNode(node.id)}
          className="mt-2 px-3 py-1.5 bg-red-50 hover:bg-red-100 border border-red-200 rounded text-sm text-red-700 font-medium"
        >
          Delete Node
        </button>
      </div>
    );
  }

  if (edge) {
    const from = nodes.find((n) => n.id === edge.fromId);
    const to = nodes.find((n) => n.id === edge.toId);
    const dist = from && to
      ? Math.round(Math.sqrt((from.x - to.x) ** 2 + (from.y - to.y) ** 2))
      : "—";
    return (
      <div className="p-4 flex flex-col gap-4">
        <h3 className="font-semibold text-slate-900">Edge</h3>
        <div className="text-sm text-slate-700 space-y-1">
          <p>
            <span className="text-slate-500 text-xs uppercase tracking-wider">From</span><br />
            <span className="font-mono text-xs">{edge.fromId}</span>
            {from && <span className="text-slate-400 text-xs"> · ({Math.round(from.x)}, {Math.round(from.y)})</span>}
          </p>
          <p>
            <span className="text-slate-500 text-xs uppercase tracking-wider">To</span><br />
            <span className="font-mono text-xs">{edge.toId}</span>
            {to && <span className="text-slate-400 text-xs"> · ({Math.round(to.x)}, {Math.round(to.y)})</span>}
          </p>
          <p>
            <span className="text-slate-500 text-xs uppercase tracking-wider">Distance</span>{" "}
            <span className="font-medium">{dist}</span>
          </p>
        </div>

        <button
          onClick={() => removeEdge(edge.id)}
          className="mt-2 px-3 py-1.5 bg-red-50 hover:bg-red-100 border border-red-200 rounded text-sm text-red-700 font-medium"
        >
          Delete Edge
        </button>
      </div>
    );
  }

  return null;
}
