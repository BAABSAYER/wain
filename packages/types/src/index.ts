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
  | "sign"
  | "chair"
  | "sofa"
  | "table"
  | "trashcan"
  | "floor_lamp"
  | "potted_plant"
  | "car"
  | "streetlight"
  | "bollard"
  | "bus_shelter"
  | "bike_rack"
  | "gate";

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

export type OutdoorFeatureType = "road" | "parking" | "sidewalk" | "landscape" | "crosswalk";

export interface CanvasOutdoorFeature {
  id: string;
  type: OutdoorFeatureType;
  label?: string;
  points: Point2D[];
  width: number;
  color?: string | null;
  lineColor?: string | null;
  laneCount: number;
  parkingAngle: number;
  stallWidth: number;
  stallDepth: number;
}

export type GeoBasemapStyle = "satellite" | "streets";

export interface FloorGeoreference {
  latitude: number;
  longitude: number;
  bearing: number;
  metersPerUnit: number;
  basemap: GeoBasemapStyle;
}

const EARTH_RADIUS_METERS = 6378137;

/** Convert floor-local coordinates to WGS84 around the floor centre. */
export function floorPointToLngLat(
  x: number,
  y: number,
  floorWidth: number,
  floorHeight: number,
  reference: FloorGeoreference,
): [number, number] {
  const theta = reference.bearing * Math.PI / 180;
  const dx = (x - floorWidth / 2) * reference.metersPerUnit;
  const dy = (y - floorHeight / 2) * reference.metersPerUnit;
  const east = dx * Math.cos(theta) - dy * Math.sin(theta);
  const north = -dx * Math.sin(theta) - dy * Math.cos(theta);
  const latRad = reference.latitude * Math.PI / 180;
  const latitude = reference.latitude + (north / EARTH_RADIUS_METERS) * 180 / Math.PI;
  const longitude = reference.longitude + (east / (EARTH_RADIUS_METERS * Math.cos(latRad))) * 180 / Math.PI;
  return [longitude, latitude];
}

/** Convert WGS84 coordinates back into the floor's local coordinate system. */
export function lngLatToFloorPoint(
  longitude: number,
  latitude: number,
  floorWidth: number,
  floorHeight: number,
  reference: FloorGeoreference,
): Point2D {
  const latRad = reference.latitude * Math.PI / 180;
  const east = (longitude - reference.longitude) * Math.PI / 180 * EARTH_RADIUS_METERS * Math.cos(latRad);
  const north = (latitude - reference.latitude) * Math.PI / 180 * EARTH_RADIUS_METERS;
  const theta = reference.bearing * Math.PI / 180;
  const dx = east * Math.cos(theta) - north * Math.sin(theta);
  const dy = -east * Math.sin(theta) - north * Math.cos(theta);
  return {
    x: floorWidth / 2 + dx / reference.metersPerUnit,
    y: floorHeight / 2 + dy / reference.metersPerUnit,
  };
}

export type DrawTool = "select" | "polygon" | "shape" | "asset" | "outdoor" | "node" | "edge" | "qr" | "pan";

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
  outdoorFeatures: CanvasOutdoorFeature[];
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  qrPoints: Array<{ id: string; nodeId: string; label: string }>;
}
