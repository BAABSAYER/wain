import type { AssetType } from "@wain/types";

export type AssetPresetGroup = "symbol" | "furniture";

export interface AssetPreset {
  id: string;
  type: AssetType;
  label: string;
  group: AssetPresetGroup;
  color: string;
  defaultScale?: number;
  modelUrl?: string;
}

export const ASSET_PRESETS: AssetPreset[] = [
  { id: "symbol-direction", type: "door", label: "Direction Arrow", group: "symbol", color: "#6b7280" },
  { id: "symbol-stairs", type: "stairs", label: "Stairs Symbol", group: "symbol", color: "#16a34a" },
  { id: "symbol-escalator", type: "escalator", label: "Escalator Symbol", group: "symbol", color: "#0d9488" },
  { id: "symbol-reception", type: "reception", label: "Reception Symbol", group: "symbol", color: "#0284c7" },
  { id: "symbol-security", type: "security", label: "Security Symbol", group: "symbol", color: "#475569" },
  { id: "symbol-bench", type: "bench", label: "Bench Symbol", group: "symbol", color: "#92400e" },

  { id: "object-tree", type: "tree", label: "Tree", group: "furniture", color: "#16a34a", defaultScale: 1.2, modelUrl: "/models/map-assets/tree.glb" },
  { id: "object-elevator", type: "elevator", label: "Elevator", group: "furniture", color: "#7c3aed", modelUrl: "/models/map-assets/elevator.glb" },
  { id: "object-staircase", type: "stairs", label: "Staircase", group: "furniture", color: "#16a34a", modelUrl: "/models/map-assets/stairs.glb" },
  { id: "object-escalator", type: "escalator", label: "Escalator", group: "furniture", color: "#0d9488", modelUrl: "/models/map-assets/escalator.glb" },
  { id: "object-reception-desk", type: "reception", label: "Reception Desk", group: "furniture", color: "#0284c7", modelUrl: "/models/map-assets/reception.glb" },
  { id: "object-security-desk", type: "security", label: "Security Desk", group: "furniture", color: "#475569", modelUrl: "/models/map-assets/security.glb" },
  { id: "object-info", type: "info", label: "Information Sign", group: "furniture", color: "#0284c7", modelUrl: "/models/map-assets/info.glb" },
  { id: "object-parking", type: "parking", label: "Parking Sign", group: "furniture", color: "#2563eb", modelUrl: "/models/map-assets/parking.glb" },
  { id: "object-dining", type: "dining", label: "Dining Set", group: "furniture", color: "#d97706", modelUrl: "/models/map-assets/dining.glb" },
  { id: "object-planter", type: "planter", label: "Planter", group: "furniture", color: "#15803d", modelUrl: "/models/map-assets/planter.glb" },
  { id: "object-kiosk", type: "kiosk", label: "Kiosk", group: "furniture", color: "#0891b2", modelUrl: "/models/map-assets/kiosk.glb" },
  { id: "object-atm", type: "atm", label: "ATM", group: "furniture", color: "#2563eb", modelUrl: "/models/map-assets/atm.glb" },
  { id: "object-barrier", type: "barrier", label: "Barrier", group: "furniture", color: "#64748b", modelUrl: "/models/map-assets/barrier.glb" },
  { id: "object-sign", type: "sign", label: "Directional Sign", group: "furniture", color: "#334155", modelUrl: "/models/map-assets/sign.glb" },

  { id: "bench-classic", type: "bench", label: "Bench - Classic", group: "furniture", color: "#92400e", modelUrl: "/models/map-assets/bench.glb" },
  { id: "bench-cushion", type: "bench", label: "Bench - Cushion", group: "furniture", color: "#92400e", modelUrl: "/models/map-assets/bench-cushion.glb" },
  { id: "bench-low", type: "bench", label: "Bench - Low", group: "furniture", color: "#92400e", modelUrl: "/models/map-assets/bench-low.glb" },
  { id: "chair-modern", type: "chair", label: "Chair - Modern", group: "furniture", color: "#475569", modelUrl: "/models/map-assets/chair.glb" },
  { id: "chair-classic", type: "chair", label: "Chair - Classic", group: "furniture", color: "#475569", modelUrl: "/models/map-assets/chair-classic.glb" },
  { id: "chair-lounge", type: "chair", label: "Chair - Lounge", group: "furniture", color: "#475569", defaultScale: 1.15, modelUrl: "/models/map-assets/chair-lounge.glb" },
  { id: "sofa-standard", type: "sofa", label: "Sofa - Standard", group: "furniture", color: "#64748b", defaultScale: 1.2, modelUrl: "/models/map-assets/sofa.glb" },
  { id: "sofa-long", type: "sofa", label: "Sofa - Long", group: "furniture", color: "#64748b", defaultScale: 1.2, modelUrl: "/models/map-assets/sofa-long.glb" },
  { id: "sofa-design", type: "sofa", label: "Sofa - Design", group: "furniture", color: "#64748b", defaultScale: 1.2, modelUrl: "/models/map-assets/sofa-design.glb" },
  { id: "table-round", type: "table", label: "Table - Round", group: "furniture", color: "#92400e", modelUrl: "/models/map-assets/table.glb" },
  { id: "table-square", type: "table", label: "Table - Square", group: "furniture", color: "#92400e", modelUrl: "/models/map-assets/table-square.glb" },
  { id: "table-coffee", type: "table", label: "Table - Coffee", group: "furniture", color: "#92400e", modelUrl: "/models/map-assets/table-coffee.glb" },
  { id: "trash-bin", type: "trashcan", label: "Trash Bin", group: "furniture", color: "#475569", modelUrl: "/models/map-assets/trashcan.glb" },
  { id: "lamp-round", type: "floor_lamp", label: "Floor Lamp - Round", group: "furniture", color: "#64748b", modelUrl: "/models/map-assets/floor-lamp.glb" },
  { id: "lamp-square", type: "floor_lamp", label: "Floor Lamp - Square", group: "furniture", color: "#64748b", modelUrl: "/models/map-assets/floor-lamp-square.glb" },
  { id: "plant-tall", type: "potted_plant", label: "Potted Plant - Tall", group: "furniture", color: "#15803d", modelUrl: "/models/map-assets/potted-plant.glb" },
  { id: "plant-small", type: "potted_plant", label: "Potted Plant - Small", group: "furniture", color: "#15803d", modelUrl: "/models/map-assets/potted-plant-small.glb" },
];

export function findAssetPreset(id: string | null): AssetPreset | null {
  if (!id) return null;
  return ASSET_PRESETS.find((preset) => preset.id === id) ?? null;
}

export function findAssetPresetForAsset(type: string, modelUrl?: string | null): AssetPreset | null {
  const exact = ASSET_PRESETS.find((preset) => preset.type === type && (preset.modelUrl ?? null) === (modelUrl ?? null));
  return exact ?? ASSET_PRESETS.find((preset) => preset.type === type) ?? null;
}
