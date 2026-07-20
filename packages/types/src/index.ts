// ─── Geometry ────────────────────────────────────────────────────────────────

export interface Point2D {
  x: number;
  y: number;
}

export interface Polygon2D {
  points: Point2D[];
}

// ─── Building ────────────────────────────────────────────────────────────────

export interface Building {
  id: string;
  name: string;
  nameAr: string;
  address: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Floor ───────────────────────────────────────────────────────────────────

export interface Floor {
  id: string;
  buildingId: string;
  name: string;
  nameAr: string;
  level: number;
  width: number;
  height: number;
  floorPlanUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Store / Room ─────────────────────────────────────────────────────────────

export type StoreCategory =
  | "retail"
  | "food"
  | "services"
  | "medical"
  | "education"
  | "transit"
  | "restroom"
  | "restroom_male"
  | "restroom_female"
  | "elevator"
  | "stairs"
  | "escalator"
  | "entrance"
  | "parking"
  | "dining"
  | "open_area"
  | "corridor"
  | "garden"
  | "building_border"
  | "door"
  | "tree"
  | "other";

export interface Store {
  id: string;
  floorId: string;
  name: string;
  nameAr: string;
  category: StoreCategory;
  polygon: Point2D[];
  extrudeHeight: number;
  color: string;
  isSearchable: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Navigation Graph ─────────────────────────────────────────────────────────

export type NodeType = "path" | "entrance" | "elevator" | "stairs" | "escalator" | "qr";

export type AssetType =
  | "door"
  | "tree"
  | "elevator"
  | "stairs"
  | "escalator"
  | "reception"
  | "info"
  | "security"
  | "parking"
  | "dining"
  | "bench"
  | "planter"
  | "kiosk"
  | "atm"
  | "barrier"
  | "sign";

export interface Asset {
  id: string;
  floorId: string;
  type: AssetType;
  label: string;
  x: number;
  y: number;
  z: number;
  rotation: number;
  scale: number;
  color?: string | null;
  modelUrl?: string | null;
  navNodeId?: string | null;
}

export interface NavNode {
  id: string;
  floorId: string;
  x: number;
  y: number;
  z: number;
  type: NodeType;
  connectedFloorNodeId: string | null;
}

export interface NavEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  distance: number;
  isAccessible: boolean;
}

// ─── QR Point ─────────────────────────────────────────────────────────────────

export interface QRPoint {
  id: string;
  buildingId: string;
  floorId: string;
  nodeId: string;
  code: string;
  label: string;
  qrImageUrl: string | null;
  createdAt: string;
}

// ─── Routing ─────────────────────────────────────────────────────────────────

export interface RouteRequest {
  buildingId: string;
  fromNodeId: string;
  toStoreId: string;
  accessibleOnly?: boolean;
}

export interface RouteStep {
  nodeId: string;
  floorId: string;
  x: number;
  y: number;
  z: number;
  instruction?: string;
}

export interface RouteResult {
  steps: RouteStep[];
  totalDistance: number;
  estimatedMinutes: number;
  floors: string[];
}

// ─── API Response wrapper ─────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
}

export interface ApiError {
  success: false;
  message: string;
  statusCode: number;
}

// ─── Map Builder canvas types ─────────────────────────────────────────────────

export type DrawTool = "select" | "polygon" | "shape" | "asset" | "node" | "edge" | "qr" | "pan";

export interface CanvasStore {
  id: string;
  polygon: Point2D[];
  name: string;
  nameAr: string;
  category: StoreCategory;
  color: string;
  extrudeHeight: number;
  zone?: string;
  zoneAr?: string;
  logoUrl?: string;
  navNodeId?: string | null;
  /** M:N — the set of nav nodes this store is linked to. Source of truth
   *  in the admin; the legacy navNodeId field stays in sync as the first
   *  entry for backward compatibility. */
  navLinkNodeIds?: string[];
}

export interface CanvasAsset {
  id: string;
  type: AssetType;
  label?: string;
  x: number;
  y: number;
  z?: number;
  rotation: number;
  scale: number;
  color?: string | null;
  modelUrl?: string | null;
  navNodeId?: string | null;
}

export interface CanvasNode {
  id: string;
  x: number;
  y: number;
  type: NodeType;
  connectedFloorNodeId?: string | null;
}

export interface CanvasEdge {
  id: string;
  fromId: string;
  toId: string;
}

export interface CanvasState {
  stores: CanvasStore[];
  assets: CanvasAsset[];
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  qrPoints: Array<{ id: string; nodeId: string; label: string }>;
}
