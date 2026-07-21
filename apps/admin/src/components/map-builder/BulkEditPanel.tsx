"use client";
import { useMemo, useState } from "react";
import { useMapBuilderStore } from "@/store/map-builder";
import type { StoreCategory } from "@wain/types";

const CATEGORIES: StoreCategory[] = [
  "retail", "food", "services", "medical", "education",
  "transit", "restroom", "restroom_male", "restroom_female",
  "elevator", "stairs", "escalator", "entrance", "parking", "dining",
  "open_area", "corridor", "garden", "building_border", "door", "tree", "other",
];

interface AABB {
  id: string;
  polygon: { x: number; y: number }[];
  minX: number; maxX: number;
  minY: number; maxY: number;
  midX: number; midY: number;
}

const COLORS = [
  "#ffffff","#cbd5e1","#94a3b8","#64748b",
  "#60a5fa","#3b82f6","#0ea5e9","#06b6d4",
  "#34d399","#10b981","#22c55e","#84cc16",
  "#facc15","#f59e0b","#fb923c","#f87171",
  "#ef4444","#ec4899","#f472b6","#a78bfa",
];

interface Props {
  selectedIds: string[];
}

/**
 * Shown when 2+ rooms are selected (primary + shift-clicked extras). Lets the
 * admin assign a shared zone, room type, and optionally a shared color to all
 * of them in one shot. The underlying data model is unchanged — each room keeps
 * its own name, polygon, category, etc.; "group" = rooms with the same `zone`.
 */
export default function BulkEditPanel({ selectedIds }: Props) {
  const { stores, updateStore, clearExtraSelection, setSelected, pushSnapshot } = useMapBuilderStore();

  const selectedStores = useMemo(
    () => stores.filter((s) => selectedIds.includes(s.id)),
    [stores, selectedIds],
  );

  // Axis-aligned bounding box for each selected room — used by the align /
  // distribute tools below.
  const aabbs: AABB[] = useMemo(() => selectedStores.map((s) => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of s.polygon) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return {
      id: s.id, polygon: s.polygon,
      minX, maxX, minY, maxY,
      midX: (minX + maxX) / 2, midY: (minY + maxY) / 2,
    };
  }), [selectedStores]);

  const shift = (b: AABB, dx: number, dy: number) => {
    if (dx === 0 && dy === 0) return;
    updateStore(b.id, { polygon: b.polygon.map((p) => ({ x: p.x + dx, y: p.y + dy })) });
  };

  // ── Align / distribute actions ──────────────────────────────────────────
  const alignLeft   = () => { pushSnapshot(); const t = Math.min(...aabbs.map((b) => b.minX)); for (const b of aabbs) shift(b, t - b.minX, 0); };
  const alignRight  = () => { pushSnapshot(); const t = Math.max(...aabbs.map((b) => b.maxX)); for (const b of aabbs) shift(b, t - b.maxX, 0); };
  const alignCenterH= () => { pushSnapshot(); const t = aabbs.reduce((s, b) => s + b.midX, 0) / aabbs.length; for (const b of aabbs) shift(b, t - b.midX, 0); };
  const alignTop    = () => { pushSnapshot(); const t = Math.min(...aabbs.map((b) => b.minY)); for (const b of aabbs) shift(b, 0, t - b.minY); };
  const alignBottom = () => { pushSnapshot(); const t = Math.max(...aabbs.map((b) => b.maxY)); for (const b of aabbs) shift(b, 0, t - b.maxY); };
  const alignMiddleV= () => { pushSnapshot(); const t = aabbs.reduce((s, b) => s + b.midY, 0) / aabbs.length; for (const b of aabbs) shift(b, 0, t - b.midY); };
  const distributeH = () => {
    if (aabbs.length < 3) return;
    pushSnapshot();
    const sorted = [...aabbs].sort((a, b) => a.midX - b.midX);
    const first = sorted[0].midX, last = sorted[sorted.length - 1].midX;
    const step = (last - first) / (sorted.length - 1);
    for (let i = 1; i < sorted.length - 1; i++) shift(sorted[i], (first + i * step) - sorted[i].midX, 0);
  };
  const distributeV = () => {
    if (aabbs.length < 3) return;
    pushSnapshot();
    const sorted = [...aabbs].sort((a, b) => a.midY - b.midY);
    const first = sorted[0].midY, last = sorted[sorted.length - 1].midY;
    const step = (last - first) / (sorted.length - 1);
    for (let i = 1; i < sorted.length - 1; i++) shift(sorted[i], 0, (first + i * step) - sorted[i].midY);
  };

  // Read current state of the selection to decide what to prefill.
  const uniqueZones = useMemo(
    () => [...new Set(selectedStores.map((s) => s.zone ?? ""))],
    [selectedStores],
  );
  const uniqueZonesAr = useMemo(
    () => [...new Set(selectedStores.map((s) => s.zoneAr ?? ""))],
    [selectedStores],
  );
  const sharedZone   = uniqueZones.length === 1   ? uniqueZones[0]   : "";
  const sharedZoneAr = uniqueZonesAr.length === 1 ? uniqueZonesAr[0] : "";

  // All distinct zones that already exist on this floor — quick chips so the
  // admin can extend a group instead of retyping the department name.
  const existingZones = useMemo(() => {
    const set = new Set<string>();
    for (const s of stores) if (s.zone) set.add(s.zone);
    return [...set];
  }, [stores]);

  const [zone, setZone] = useState(sharedZone);
  const [zoneAr, setZoneAr] = useState(sharedZoneAr);
  const [applyCategory, setApplyCategory] = useState(false);
  const [category, setCategory] = useState<StoreCategory>(selectedStores[0]?.category ?? "other");
  const [applyColor, setApplyColor] = useState(false);
  const [color, setColor] = useState<string>(selectedStores[0]?.color ?? COLORS[0]);

  const pickExisting = (z: string) => {
    setZone(z);
    // Try to fill the AR field too if any existing store has both translations.
    const match = stores.find((s) => s.zone === z && s.zoneAr);
    if (match?.zoneAr) setZoneAr(match.zoneAr);
  };

  const apply = () => {
    pushSnapshot();
    for (const id of selectedIds) {
      const patch: { zone?: string; zoneAr?: string; category?: StoreCategory; color?: string } = {};
      if (zone) patch.zone = zone;
      if (zoneAr) patch.zoneAr = zoneAr;
      if (applyCategory) patch.category = category;
      if (applyColor) patch.color = color;
      if (Object.keys(patch).length > 0) updateStore(id, patch);
    }
  };

  const clearSelection = () => {
    clearExtraSelection();
    setSelected(null);
  };

  const canApply = !!zone || !!zoneAr || applyCategory || applyColor;

  return (
    <div className="p-4 flex flex-col gap-4">
      <div>
        <h3 className="font-semibold text-slate-900">Group {selectedIds.length} rooms</h3>
        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
          Assign a shared zone, room type, or color to every selected room.
          Each room keeps its own name, number, and polygon.
        </p>
      </div>

      {/* Selection summary */}
      <div className="bg-slate-50 border border-slate-200 rounded p-2 text-xs text-slate-600 leading-relaxed">
        <p><b className="text-slate-900">{selectedIds.length}</b> rooms selected</p>
        {uniqueZones.length > 1 && (
          <p className="mt-1">
            Current zones: {uniqueZones.map((z) => z || "(none)").join(" · ")}
          </p>
        )}
      </div>

      {/* Align / distribute (Canva-style) */}
      <div>
        <p className="text-xs text-slate-500 font-medium mb-1.5">Arrange</p>
        <div className="grid grid-cols-3 gap-1 mb-1.5">
          <button onClick={alignLeft}    title="Align left edges"     className="px-2 py-1.5 text-xs bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700">⫷ Left</button>
          <button onClick={alignCenterH} title="Center horizontally"  className="px-2 py-1.5 text-xs bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700">⊕ Center</button>
          <button onClick={alignRight}   title="Align right edges"    className="px-2 py-1.5 text-xs bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700">Right ⫸</button>
          <button onClick={alignTop}     title="Align top edges"      className="px-2 py-1.5 text-xs bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700">⫶ Top</button>
          <button onClick={alignMiddleV} title="Center vertically"    className="px-2 py-1.5 text-xs bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700">⊕ Middle</button>
          <button onClick={alignBottom}  title="Align bottom edges"   className="px-2 py-1.5 text-xs bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700">Bottom ⫶</button>
        </div>
        <div className="grid grid-cols-2 gap-1">
          <button
            onClick={distributeH}
            disabled={aabbs.length < 3}
            title="Distribute horizontally (needs 3+ rooms)"
            className="px-2 py-1.5 text-xs bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-200 rounded text-slate-700"
          >↔ Distribute</button>
          <button
            onClick={distributeV}
            disabled={aabbs.length < 3}
            title="Distribute vertically (needs 3+ rooms)"
            className="px-2 py-1.5 text-xs bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-200 rounded text-slate-700"
          >↕ Distribute</button>
        </div>
      </div>

      {/* Existing-zone quick picks */}
      {existingZones.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 font-medium mb-1.5">Use existing zone</p>
          <div className="flex flex-wrap gap-1.5">
            {existingZones.map((z) => (
              <button
                key={z}
                onClick={() => pickExisting(z)}
                className={`px-2.5 py-1 border rounded text-xs ${
                  zone === z
                    ? "bg-blue-500 border-blue-500 text-white"
                    : "bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700"
                }`}
              >
                {z}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-xs text-slate-500 font-medium">Department / Zone (EN)</span>
        <input
          className="bg-white border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded px-3 py-1.5 text-sm text-slate-900 outline-none"
          placeholder="e.g. Cardiology"
          value={zone}
          onChange={(e) => setZone(e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-slate-500 font-medium">Department / Zone (AR)</span>
        <input
          dir="rtl"
          className="bg-white border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded px-3 py-1.5 text-sm text-slate-900 outline-none"
          placeholder="مثال: قسم القلب"
          value={zoneAr}
          onChange={(e) => setZoneAr(e.target.value)}
        />
      </label>

      <div className="border-t border-slate-100 pt-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={applyCategory}
            onChange={(e) => setApplyCategory(e.target.checked)}
            className="w-4 h-4 rounded text-blue-500 focus:ring-blue-500"
          />
          <span className="text-xs text-slate-700 font-medium">Apply a shared room type</span>
        </label>
        {applyCategory && (
          <select
            className="mt-2 w-full bg-white border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded px-3 py-1.5 text-sm text-slate-900 outline-none"
            value={category}
            onChange={(e) => setCategory(e.target.value as StoreCategory)}
          >
            {CATEGORIES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        )}
      </div>

      {/* Shared group color (optional) */}
      <div className="border-t border-slate-100 pt-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={applyColor}
            onChange={(e) => setApplyColor(e.target.checked)}
            className="w-4 h-4 rounded text-blue-500 focus:ring-blue-500"
          />
          <span className="text-xs text-slate-700 font-medium">Apply a shared group color</span>
        </label>

        {applyColor && (
          <div className="mt-2 grid grid-cols-5 gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-md border-2 transition-transform ${
                  color === c ? "border-blue-500 scale-110" : "border-slate-200 hover:border-slate-400"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 mt-1">
        <button
          onClick={apply}
          disabled={!canApply}
          className="px-3 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded text-sm font-semibold"
        >
          Apply to {selectedIds.length} rooms
        </button>
        <button
          onClick={clearSelection}
          className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700"
        >
          Clear selection
        </button>
      </div>

      <p className="text-[11px] text-slate-400 leading-relaxed">
        💡 Hold <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px]">Shift</kbd>{" "}
        and click rooms on the map to add or remove them from the selection.
      </p>
    </div>
  );
}
