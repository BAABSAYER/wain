"use client";
import type { DrawTool } from "@wain/types";
import Link from "next/link";
import { useMapBuilderStore } from "@/store/map-builder";
import { SHAPE_PRESETS } from "./shape-presets";
import { ASSET_PRESETS } from "./asset-presets";

const TOOLS: { id: DrawTool; label: string; icon: string; hint: string }[] = [
  { id: "select",  label: "Select",   icon: "↖", hint: "Click a shape, node, or edge to edit. Drag handles to resize." },
  { id: "pan",     label: "Pan",      icon: "✋", hint: "Drag to move around the canvas" },
  { id: "polygon", label: "Free Draw",icon: "⬡", hint: "Click to add corners, double-click to close" },
  { id: "shape",   label: "Shape",    icon: "⬜", hint: "Pick a preset shape, then click the canvas to drop it" },
  { id: "asset",   label: "Asset",    icon: "3D", hint: "Pick a 3D asset, then click the canvas to place it" },
  { id: "node",    label: "Node",     icon: "●", hint: "Click to drop a nav node. Near an existing line, it snaps onto that line." },
  { id: "edge",    label: "Edge",     icon: "—", hint: "Click two nodes to connect them" },
  { id: "qr",      label: "QR",       icon: "▣", hint: "Click a nav node to create a QR scan point" },
];

interface Props {
  onSave: () => void;
  isSaving: boolean;
  isDirty: boolean;
  buildingHref?: string;
}

export default function Toolbar({ onSave, isSaving, isDirty, buildingHref }: Props) {
  const { tool, setTool, activePreset, setActivePreset, activeAssetPreset, setActiveAssetPreset } = useMapBuilderStore();
  const current = TOOLS.find((t) => t.id === tool);

  return (
    <div className="relative flex items-center gap-3 px-4 h-14 bg-white border-b border-slate-200 shrink-0 shadow-sm">
      {buildingHref ? (
        <Link href={buildingHref} className="text-blue-500 hover:text-blue-700 text-sm font-medium">
          ← Back
        </Link>
      ) : null}
      <span className="text-blue-600 font-bold text-base mr-2">Wain Map Builder</span>

      <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            title={t.hint}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              tool === t.id
                ? "bg-blue-500 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-white"
            }`}
          >
            <span className="mr-1">{t.icon}</span>
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {current?.hint && (
        <span className="hidden md:inline text-xs text-slate-500 ml-2 truncate">{current.hint}</span>
      )}

      <div className="ml-auto flex items-center gap-3">
        {isDirty && <span className="text-xs text-amber-600 font-medium">● Unsaved changes</span>}
        <button
          onClick={onSave}
          disabled={isSaving || !isDirty}
          className="px-4 py-1.5 bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-medium shadow-sm transition-colors"
        >
          {isSaving ? "Saving…" : "Save Map"}
        </button>
      </div>

      {/* Preset popover — visible only when Shape tool is active */}
      {tool === "shape" && (
        <div className="absolute top-full left-0 right-0 z-20 bg-white border-b border-slate-200 shadow-md px-4 py-3 flex items-center gap-3 overflow-x-auto">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex-shrink-0">
            Pick a preset:
          </span>
          {SHAPE_PRESETS.map((preset) => {
            const active = activePreset === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => setActivePreset(active ? null : preset.id)}
                title={preset.label}
                className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-blue-500 border-blue-500 text-white shadow-sm"
                    : "bg-white border-slate-200 text-slate-700 hover:border-blue-300 hover:bg-blue-50"
                }`}
              >
                <span className="text-lg leading-none">{preset.icon}</span>
                <span>{preset.label}</span>
              </button>
            );
          })}
          {activePreset && (
            <span className="ml-auto flex-shrink-0 text-xs text-blue-700 font-medium animate-pulse">
              → Click the canvas to drop
            </span>
          )}
        </div>
      )}

      {tool === "asset" && (
        <div className="absolute top-full left-0 right-0 z-20 bg-white border-b border-slate-200 shadow-md px-4 py-3 flex items-center gap-3 overflow-x-auto">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex-shrink-0">
            Pick an asset:
          </span>
          {ASSET_PRESETS.map((preset) => {
            const active = activeAssetPreset === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => setActiveAssetPreset(active ? null : preset.id)}
                title={preset.label}
                className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-blue-500 border-blue-500 text-white shadow-sm"
                    : "bg-white border-slate-200 text-slate-700 hover:border-blue-300 hover:bg-blue-50"
                }`}
              >
                <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: preset.color }} />
                <span>{preset.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
