"use client";
import { useMemo, useState } from "react";
import { useMapBuilderStore } from "@/store/map-builder";

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
 * admin assign a shared zone (department) and optionally a shared color to all
 * of them in one shot. The underlying data model is unchanged — each room keeps
 * its own name, polygon, category, etc.; "group" = rooms with the same `zone`.
 */
export default function BulkEditPanel({ selectedIds }: Props) {
  const { stores, updateStore, clearExtraSelection, setSelected, pushSnapshot } = useMapBuilderStore();

  const selectedStores = useMemo(
    () => stores.filter((s) => selectedIds.includes(s.id)),
    [stores, selectedIds],
  );

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
      const patch: { zone?: string; zoneAr?: string; color?: string } = {};
      if (zone) patch.zone = zone;
      if (zoneAr) patch.zoneAr = zoneAr;
      if (applyColor) patch.color = color;
      if (Object.keys(patch).length > 0) updateStore(id, patch);
    }
  };

  const clearSelection = () => {
    clearExtraSelection();
    setSelected(null);
  };

  const canApply = !!zone || !!zoneAr || applyColor;

  return (
    <div className="p-4 flex flex-col gap-4">
      <div>
        <h3 className="font-semibold text-slate-900">Group {selectedIds.length} rooms</h3>
        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
          Assign a shared department / zone (and optional color) to every selected room.
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
