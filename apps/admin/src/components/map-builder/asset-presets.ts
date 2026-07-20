import type { AssetType } from "@wain/types";

export interface AssetPreset {
  id: AssetType;
  label: string;
  color: string;
  defaultScale?: number;
}

export const ASSET_PRESETS: AssetPreset[] = [
  { id: "door", label: "Door", color: "#0f766e", defaultScale: 1 },
  { id: "tree", label: "Tree", color: "#16a34a", defaultScale: 1.2 },
  { id: "elevator", label: "Elevator", color: "#7c3aed" },
  { id: "stairs", label: "Stairs", color: "#16a34a" },
  { id: "escalator", label: "Escalator", color: "#0d9488" },
  { id: "reception", label: "Reception", color: "#0284c7" },
  { id: "info", label: "Info", color: "#0284c7" },
  { id: "security", label: "Security", color: "#475569" },
  { id: "parking", label: "Parking", color: "#2563eb" },
  { id: "dining", label: "Dining", color: "#d97706" },
  { id: "bench", label: "Bench", color: "#92400e" },
  { id: "planter", label: "Planter", color: "#15803d" },
  { id: "kiosk", label: "Kiosk", color: "#0891b2" },
  { id: "atm", label: "ATM", color: "#2563eb" },
  { id: "barrier", label: "Barrier", color: "#64748b" },
  { id: "sign", label: "Sign", color: "#334155" },
];

export function findAssetPreset(id: string | null): AssetPreset | null {
  if (!id) return null;
  return ASSET_PRESETS.find((preset) => preset.id === id) ?? null;
}
