"use client";
import { useState } from "react";
import { useMapBuilderStore } from "@/store/map-builder";
import { nanoid } from "../nanoid";
import type { CanvasStore } from "@wain/types";
import {
  parseDxf,
  parseSvg,
  parseIfc,
  autoFitToFloor,
  detectFormat,
  type ParseResult,
} from "./parsers";

interface Props {
  floorWidth: number;
  floorHeight: number;
  onClose: () => void;
}

/**
 * Drop-zone modal that turns DXF / SVG / IFC into draft rooms on the canvas.
 * The user reviews a preview of what was extracted (room count + layer
 * breakdown), optionally limits which layers to import, then commits — the
 * rooms land in zustand as fresh nanoid-ided CanvasStore entries marked
 * dirty, so the next Save Map persists them.
 */
export default function CadImportModal({ floorWidth, floorHeight, onClose }: Props) {
  const { addPresetStore, pushSnapshot } = useMapBuilderStore();

  const [filename, setFilename] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [excludedLayers, setExcludedLayers] = useState<Set<string>>(new Set());
  const [autoFit, setAutoFit] = useState(true);

  const onFile = async (file: File) => {
    setError(null); setResult(null); setExcludedLayers(new Set());
    const fmt = detectFormat(file.name);
    if (!fmt) { setError("Unsupported file type. Use .dxf, .svg, or .ifc."); return; }
    setFilename(file.name);
    setBusy(true);
    try {
      let res: ParseResult;
      if (fmt === "dxf")      res = await parseDxf(await file.text());
      else if (fmt === "svg") res = parseSvg(await file.text());
      else                    res = await parseIfc(await file.arrayBuffer());
      setResult(res);
    } catch (e: any) {
      setError(e?.message ?? "Parse failed");
    } finally {
      setBusy(false);
    }
  };

  // Layer summary for the filter UI.
  const layerCounts = result
    ? Object.entries(
        result.rooms.reduce<Record<string, number>>((acc, r) => {
          const k = r.layer ?? "(no layer)";
          acc[k] = (acc[k] ?? 0) + 1;
          return acc;
        }, {}),
      ).sort((a, b) => b[1] - a[1])
    : [];

  const acceptCount = result
    ? result.rooms.filter((r) => !excludedLayers.has(r.layer ?? "(no layer)")).length
    : 0;

  const commit = () => {
    if (!result || acceptCount === 0) return;
    const fitted = autoFit
      ? autoFitToFloor(result, floorWidth, floorHeight)
      : result.rooms;
    const wanted = fitted.filter((r, i) => {
      const layer = result.rooms[i].layer ?? "(no layer)";
      return !excludedLayers.has(layer);
    });
    pushSnapshot();
    for (const r of wanted) {
      const newStore: CanvasStore = {
        id: nanoid(),
        name: r.name,
        nameAr: r.name,
        category: "other",
        color: "#cbd5e1",
        extrudeHeight: 5,
        polygon: r.polygon,
        zone: r.layer ?? undefined,
        zoneAr: r.layer ?? undefined,
      };
      addPresetStore(newStore);
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 flex flex-col gap-4 max-h-[85vh] overflow-y-auto">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Import from CAD / BIM</h3>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Drop a <b>.dxf</b>, <b>.svg</b>, or <b>.ifc</b> file. Closed rooms become
            draft polygons on the canvas; layers become zones. Tweak afterwards
            with the Word-style tools, then Save Map.
          </p>
        </div>

        <label
          className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-6 cursor-pointer transition-colors ${
            busy ? "border-slate-300 bg-slate-50" : "border-slate-300 hover:border-blue-400 hover:bg-blue-50/50"
          }`}
        >
          <input
            type="file"
            accept=".dxf,.svg,.ifc"
            className="hidden"
            disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
          />
          <span className="text-3xl">{busy ? "⏳" : "📐"}</span>
          <span className="text-sm font-medium text-slate-700">
            {busy ? `Parsing ${filename}…` : filename || "Choose a DXF, SVG, or IFC file"}
          </span>
          <span className="text-[11px] text-slate-400">
            IFC files load a WebAssembly parser on first use (~3 MB)
          </span>
        </label>

        {error && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}

        {result && (
          <>
            <div className="bg-slate-50 border border-slate-200 rounded p-3 text-xs text-slate-700 leading-relaxed">
              <div><b className="text-slate-900">{result.rooms.length}</b> room polygon{result.rooms.length === 1 ? "" : "s"} found</div>
              <div className="mt-0.5">
                Source extent:&nbsp;
                {(result.sourceBBox.maxX - result.sourceBBox.minX).toFixed(0)} ×{" "}
                {(result.sourceBBox.maxY - result.sourceBBox.minY).toFixed(0)}{" "}
                <span className="text-slate-400">({result.sourceUnits})</span>
              </div>
              {result.warnings.length > 0 && (
                <ul className="mt-1.5 text-amber-700 list-disc pl-4">
                  {result.warnings.slice(0, 3).map((w, i) => (<li key={i}>{w}</li>))}
                </ul>
              )}
            </div>

            {layerCounts.length > 1 && (
              <div>
                <p className="text-xs text-slate-500 font-medium mb-1.5">Layers / groups</p>
                <ul className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                  {layerCounts.map(([layer, count]) => {
                    const excluded = excludedLayers.has(layer);
                    return (
                      <li key={layer} className="flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer flex-1 min-w-0">
                          <input
                            type="checkbox"
                            checked={!excluded}
                            onChange={(e) => setExcludedLayers((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.delete(layer); else next.add(layer);
                              return next;
                            })}
                            className="w-3.5 h-3.5 rounded text-blue-500 focus:ring-blue-500"
                          />
                          <span className="truncate font-mono text-[11px]">{layer}</span>
                        </label>
                        <span className="text-[10px] text-slate-400">{count}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={autoFit}
                onChange={(e) => setAutoFit(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-blue-500 focus:ring-blue-500"
              />
              <span>Auto-scale &amp; centre to floor ({floorWidth} × {floorHeight}) — uncheck to keep source coords</span>
            </label>
          </>
        )}

        <div className="flex justify-end gap-2 mt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={commit}
            disabled={!result || acceptCount === 0 || busy}
            className="px-4 py-2 text-sm font-semibold bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg shadow-sm"
          >
            {result ? `Import ${acceptCount} room${acceptCount === 1 ? "" : "s"}` : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}
