"use client";
import { useRef, useEffect, useState, useImperativeHandle, forwardRef, useMemo } from "react";
import maplibregl from "maplibre-gl";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import "maplibre-gl/dist/maplibre-gl.css";
import { isOpenSpace, isFlatMapArea, isBoundaryArea, isPointAsset, categoryGlyph, categoryVisual } from "@/lib/category-icons";

// ─── Types (mirror BuildingScene so the page can swap engines freely) ─────────

interface StoreData {
  id: string;
  name: string;
  nameAr: string;
  polygon: Array<{ x: number; y: number }>;
  extrudeHeight: number;
  color: string;
  category: string;
  zone?: string | null;
  zoneAr?: string | null;
  logoUrl?: string | null;
}

interface AssetData {
  id: string;
  type: string;
  label?: string | null;
  x: number;
  y: number;
  z?: number | null;
  rotation?: number | null;
  scale?: number | null;
  color?: string | null;
  modelUrl?: string | null;
  navNodeId?: string | null;
}

// Amenity categories → badge icon + color (wayfinding highlights)
function amenityBadge(s: StoreData): { icon: string; bg: string } | null {
  switch (s.category) {
    case "restroom":  return { icon: "🚻", bg: "#6366f1" };
    case "elevator":  return { icon: "🛗", bg: "#f59e0b" };
    case "stairs":    return { icon: "🪜", bg: "#16a34a" };
    case "escalator": return { icon: "⇅", bg: "#0d9488" };
    case "entrance":  return { icon: "🚪", bg: "#10b981" };
    case "parking":   return { icon: "🅿", bg: "#0ea5e9" };
    case "services":
      if (/prayer|مصل/i.test(`${s.name} ${s.nameAr}`)) return { icon: "🕌", bg: "#22c55e" };
      if (/info|reception|استقبال|معلومات/i.test(`${s.name} ${s.nameAr}`)) return { icon: "ⓘ", bg: "#0284c7" };
      return null;
    default: return null;
  }
}

const LANDMARK_CATEGORIES = new Set(["restroom", "restroom_male", "restroom_female", "elevator", "stairs", "escalator", "entrance", "parking", "dining", "services"]);

function categoryMarker(s: StoreData): { icon: string; bg: string } | null {
  if (!LANDMARK_CATEGORIES.has(s.category)) return null;
  const visual = categoryVisual(s.category);
  return { icon: visual.glyph, bg: visual.accent };
}

function restroomTiles(category: string): string | null {
  const femaleTile = `
    <div style="width:24px;height:28px;border-radius:4px;background:#db2777;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 4px rgba(15,23,42,0.22)">
      <svg viewBox="0 0 24 28" width="18" height="22" aria-hidden="true">
        <circle cx="12" cy="5" r="3" fill="#fff"/>
        <path d="M12 9 L6.5 19 H9 L8 25 H10.2 L11.2 19 H12.8 L13.8 25 H16 L15 19 H17.5 Z" fill="#fff"/>
        <path d="M7 11 L5.5 17 M17 11 L18.5 17" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
      </svg>
    </div>`;
  const maleTile = `
    <div style="width:24px;height:28px;border-radius:4px;background:#2563eb;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 4px rgba(15,23,42,0.22)">
      <svg viewBox="0 0 24 28" width="18" height="22" aria-hidden="true">
        <circle cx="12" cy="5" r="3" fill="#fff"/>
        <rect x="8" y="9" width="8" height="10" rx="2" fill="#fff"/>
        <path d="M8 12 L5.5 18 M16 12 L18.5 18 M10 19 L10 25 M14 19 L14 25" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
      </svg>
    </div>`;
  if (category === "restroom_female") return femaleTile;
  if (category === "restroom_male") return maleTile;
  if (category === "restroom") return `${femaleTile}${maleTile}`;
  return null;
}

interface RouteStep { nodeId: string; floorId: string; x: number; y: number; z: number; }
interface NavLine { a: { x: number; y: number }; b: { x: number; y: number }; }

function storeCentroid(store: StoreData): { x: number; y: number } {
  return {
    x: store.polygon.reduce((sum, point) => sum + point.x, 0) / store.polygon.length,
    y: store.polygon.reduce((sum, point) => sum + point.y, 0) / store.polygon.length,
  };
}

export interface SceneProjectionInfo {
  azimuth: number;
  destScreen: { x: number; y: number; inView: boolean } | null;
}

interface Props {
  stores: StoreData[];
  assets?: AssetData[];
  routeSteps: RouteStep[];
  destinationId: string | null;
  selectedId: string | null;
  /** When set, blocks of this category are tinted (filter highlights, never hides). */
  highlightCategory?: string | null;
  floorWidth: number;
  floorHeight: number;
  origin: { x: number; y: number } | null;
  focus: { x: number; y: number } | null;
  heading: number | null;
  initialAzimuth: number | null;
  locale?: "en" | "ar";
  /** Walkable corridor segments (nav-graph edges) — drawn as arrowed paths. */
  navEdges?: NavLine[];
  onProjection?: (info: SceneProjectionInfo) => void;
  onBlockClick?: (storeId: string) => void;
}

export interface BuildingMapHandle {
  recenter: () => void;
  topView: () => void;
  tiltedView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

// ─── LEAP palette ─────────────────────────────────────────────────────────────
const BACKGROUND = "#f0e9da";   // cream outside
const FLOOR_COLOR = "#fbf8f3";  // warm off-white interior
const DEFAULT_BLOCK_COLOR = "#eef1f6"; // fallback when a block has no color set
const HOVER_COLOR = "#93c5fd";         // light blue highlight on hover
// Reserved system color for the category-filter highlight. Chosen so it is NOT
// in the admin's room-color palette (`apps/admin/src/components/map-builder/
// PropertiesPanel.tsx` COLORS / `BulkEditPanel.tsx` COLORS) — that way no room
// can ever share the highlight color and the filter stays unambiguous.
const CATEGORY_HIGHLIGHT_COLOR = "#fbbf24";
const DEST_COLOR = "#7c3aed";
const SELECTED_COLOR = "#ec4899";
const ROUTE_COLOR = "#4f9df8";  // bright royal-blue ribbon (LEAP)
const ROUTE_DARK = "#2563eb";   // darker blue edge/halo

// Floor units → local geographic coords. We center the floor at [0,0] and treat
// each floor unit as a small number of metres, then convert metres → degrees.
const METERS_PER_UNIT = 0.12;
const DEG_PER_M_LNG = 1 / 111320;
const DEG_PER_M_LAT = 1 / 110540;

function makeToLngLat(w: number, h: number) {
  return (x: number, y: number): [number, number] => {
    const mx = (x - w / 2) * METERS_PER_UNIT;
    const my = (h / 2 - y) * METERS_PER_UNIT; // flip y (page down → lat up)
    return [mx * DEG_PER_M_LNG, my * DEG_PER_M_LAT];
  };
}

function heightMeters(s: StoreData): number {
  if (isFlatMapArea(s.category) || isPointAsset(s.category)) return 0;
  const h = Number.isFinite(s.extrudeHeight) ? s.extrudeHeight : 4;
  return Math.max(0, h) * 2.2;
}

/** A small chevron arrow (pointing +x) for symbol layers. */
function makeArrowImage(fill = "#2563eb", stroke = "#ffffff"): { width: number; height: number; data: Uint8Array } {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  // chevron pointing to the right
  ctx.beginPath();
  ctx.moveTo(9, 6);
  ctx.lineTo(24, 16);
  ctx.lineTo(9, 26);
  ctx.lineTo(14, 16);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const img = ctx.getImageData(0, 0, size, size);
  return { width: size, height: size, data: new Uint8Array(img.data.buffer) };
}

/** A bold white ">" chevron (stroke, rounded) pointing +x — for the route ribbon. */
function makeChevronImage(): { width: number; height: number; data: Uint8Array } {
  const size = 40;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(14, 9);
  ctx.lineTo(29, 20);
  ctx.lineTo(14, 31);
  ctx.stroke();
  const img = ctx.getImageData(0, 0, size, size);
  return { width: size, height: size, data: new Uint8Array(img.data.buffer) };
}

/** Light floor texture so large empty plans do not read as a flat white slab. */
function makeFloorPatternImage(): { width: number; height: number; data: Uint8Array } {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(176, 163, 137, 0.34)";
  ctx.lineWidth = 1;
  for (let x = 0.5; x <= size; x += 16) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }
  for (let y = 0.5; y <= size; y += 16) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255, 255, 255, 0.58)";
  ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
  const img = ctx.getImageData(0, 0, size, size);
  return { width: size, height: size, data: new Uint8Array(img.data.buffer) };
}

interface AssetModelPreset {
  url: string;
  footprintMeters: number;
  yaw?: number;
}

const ASSET_MODEL_PRESETS: Record<string, AssetModelPreset> = {
  tree: { url: "/models/map-assets/tree.glb", footprintMeters: 3.6 },
  elevator: { url: "/models/map-assets/elevator.glb", footprintMeters: 2.4 },
  stairs: { url: "/models/map-assets/stairs.glb", footprintMeters: 3.2 },
  escalator: { url: "/models/map-assets/escalator.glb", footprintMeters: 3.4 },
  reception: { url: "/models/map-assets/reception.glb", footprintMeters: 3.2 },
  info: { url: "/models/map-assets/info.glb", footprintMeters: 1.4 },
  security: { url: "/models/map-assets/security.glb", footprintMeters: 2.8 },
  parking: { url: "/models/map-assets/parking.glb", footprintMeters: 2.2 },
  dining: { url: "/models/map-assets/dining.glb", footprintMeters: 2.4 },
  bench: { url: "/models/map-assets/bench.glb", footprintMeters: 2.2 },
  planter: { url: "/models/map-assets/planter.glb", footprintMeters: 1.5 },
  kiosk: { url: "/models/map-assets/kiosk.glb", footprintMeters: 1.8 },
  atm: { url: "/models/map-assets/atm.glb", footprintMeters: 1.4 },
  barrier: { url: "/models/map-assets/barrier.glb", footprintMeters: 2.6 },
  sign: { url: "/models/map-assets/sign.glb", footprintMeters: 2.2 },
  chair: { url: "/models/map-assets/chair.glb", footprintMeters: 0.8 },
  sofa: { url: "/models/map-assets/sofa.glb", footprintMeters: 2.2 },
  table: { url: "/models/map-assets/table.glb", footprintMeters: 1.4 },
  trashcan: { url: "/models/map-assets/trashcan.glb", footprintMeters: 0.65 },
  floor_lamp: { url: "/models/map-assets/floor-lamp.glb", footprintMeters: 0.65 },
  potted_plant: { url: "/models/map-assets/potted-plant.glb", footprintMeters: 0.9 },
};

const assetModelLoader = new GLTFLoader();
const assetModelCache = new Map<string, Promise<THREE.Object3D>>();

function loadAssetModel(url: string) {
  const cached = assetModelCache.get(url);
  if (cached) return cached;

  const request = assetModelLoader.loadAsync(url).then(({ scene }) => {
    scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(scene);
    if (bounds.isEmpty()) throw new Error(`Asset model has no visible geometry: ${url}`);

    const center = bounds.getCenter(new THREE.Vector3());
    scene.position.set(-center.x, -bounds.min.y, -center.z);
    scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = false;
    });
    return scene;
  });

  assetModelCache.set(url, request);
  return request;
}

const MAP_SYMBOL_TYPES = new Set(["door", "stairs", "escalator", "reception", "security", "bench"]);

function symbolMaterial(color: string) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.08 });
}

function addSymbolBox(
  group: THREE.Group,
  size: [number, number, number],
  position: [number, number, number],
  color: string,
  rotationY = 0,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), symbolMaterial(color));
  mesh.position.set(...position);
  mesh.rotation.y = rotationY;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
}

function addDoorArrow(group: THREE.Group) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.9);
  shape.lineTo(0.55, 0.25);
  shape.lineTo(0.2, 0.25);
  shape.lineTo(0.2, -0.9);
  shape.lineTo(-0.2, -0.9);
  shape.lineTo(-0.2, 0.25);
  shape.lineTo(-0.55, 0.25);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.08,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.025,
    bevelThickness: 0.025,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();

  const arrow = new THREE.Mesh(geometry, symbolMaterial("#6b7280"));
  arrow.position.y = 0.025;
  arrow.castShadow = true;
  arrow.receiveShadow = true;
  group.add(arrow);
}

function addSecuritySymbol(group: THREE.Group) {
  const shape = new THREE.Shape();
  shape.moveTo(-0.62, -0.45);
  shape.lineTo(0.62, -0.45);
  shape.lineTo(0.48, 0.45);
  shape.lineTo(-0.48, 0.45);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  const body = new THREE.Mesh(geometry, symbolMaterial("#475569"));
  body.position.y = 0.02;
  group.add(body);
  addSymbolBox(group, [0.48, 0.08, 0.36], [0, 0.13, -0.04], "#ffffff");
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 20), symbolMaterial("#475569"));
  knob.position.set(0, 0.08, -0.67);
  group.add(knob);
}

function createMapSymbol(asset: AssetData) {
  const symbol = new THREE.Group();
  switch (asset.type) {
    case "door":
      addDoorArrow(symbol);
      break;
    case "stairs":
      for (let i = 0; i < 4; i += 1) {
        addSymbolBox(symbol, [0.72, 0.08, 0.22], [-0.42 + i * 0.28, 0.04, 0.42 - i * 0.28], "#16a34a");
      }
      break;
    case "escalator":
      addSymbolBox(symbol, [1.65, 0.1, 0.3], [0, 0.05, 0], "#0d9488", -0.5);
      break;
    case "reception":
      addSymbolBox(symbol, [1.55, 0.16, 0.65], [0, 0.08, 0.18], "#0284c7");
      addSymbolBox(symbol, [0.74, 0.11, 0.48], [0, 0.075, -0.46], "#0284c7");
      addSymbolBox(symbol, [0.56, 0.13, 0.3], [0, 0.13, -0.46], "#ffffff");
      break;
    case "security":
      addSecuritySymbol(symbol);
      break;
    case "bench":
      addSymbolBox(symbol, [1.55, 0.13, 0.28], [0, 0.22, -0.18], "#92400e");
      addSymbolBox(symbol, [1.35, 0.13, 0.34], [0, 0.1, 0.2], "#a16207");
      addSymbolBox(symbol, [0.11, 0.26, 0.11], [-0.48, 0.13, 0.35], "#475569");
      addSymbolBox(symbol, [0.11, 0.26, 0.11], [0.48, 0.13, 0.35], "#475569");
      break;
  }

  const holder = new THREE.Group();
  const requestedScale = Math.max(0.25, Math.min(asset.scale ?? 1, 8));
  symbol.scale.setScalar(requestedScale);
  holder.rotation.y = -((asset.rotation ?? 0) * Math.PI) / 180;
  holder.add(symbol);
  return holder;
}

async function createLoadedAssetObject(asset: AssetData) {
  if ((!asset.modelUrl && MAP_SYMBOL_TYPES.has(asset.type)) || asset.type === "door") {
    return createMapSymbol(asset);
  }

  const preset = ASSET_MODEL_PRESETS[asset.type] ?? ASSET_MODEL_PRESETS.sign;
  const source = await loadAssetModel(asset.modelUrl || preset.url);
  const model = source.clone(true);
  model.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const horizontalSize = Math.max(size.x, size.z, 0.001);
  const requestedScale = Math.max(0.25, Math.min(asset.scale ?? 1, 8));
  const fittedScale = (preset.footprintMeters / horizontalSize) * requestedScale;
  model.scale.setScalar(fittedScale);

  const holder = new THREE.Group();
  holder.rotation.y = -(((asset.rotation ?? 0) + (preset.yaw ?? 0)) * Math.PI) / 180;
  holder.add(model);
  return holder;
}

function createThreeAssetLayer(
  getAssets: () => AssetData[],
  getToLngLat: () => (x: number, y: number) => [number, number],
): maplibregl.CustomLayerInterface & { rebuild: () => void } {
  let map: maplibregl.Map | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.Camera | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  let root: THREE.Group | null = null;
  let sceneTransform = new THREE.Matrix4();
  let rebuildVersion = 0;

  const rebuild = () => {
    if (!scene || !root) return;
    const version = ++rebuildVersion;
    root.clear();
    const toLngLatLocal = getToLngLat();
    const anchorLngLat = toLngLatLocal(0, 0);
    const anchor = maplibregl.MercatorCoordinate.fromLngLat(
      { lng: anchorLngLat[0], lat: anchorLngLat[1] },
      0,
    );
    const meterScale = anchor.meterInMercatorCoordinateUnits();
    sceneTransform = new THREE.Matrix4()
      .makeTranslation(anchor.x, anchor.y, anchor.z)
      .scale(new THREE.Vector3(meterScale, -meterScale, meterScale))
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));

    for (const asset of getAssets()) {
      void createLoadedAssetObject(asset).then((object) => {
        if (!root || version !== rebuildVersion) return;
        object.position.set(
          asset.x * METERS_PER_UNIT,
          (asset.z ?? 0) * METERS_PER_UNIT,
          asset.y * METERS_PER_UNIT,
        );
        root.add(object);
        map?.triggerRepaint();
      }).catch((error) => {
        console.warn(`Could not load 3D asset ${asset.id}`, error);
      });
    }
    map?.triggerRepaint();
  };

  return {
    id: "three-assets",
    type: "custom",
    renderingMode: "3d",
    rebuild,
    onAdd(nextMap, gl) {
      map = nextMap;
      scene = new THREE.Scene();
      camera = new THREE.Camera();
      root = new THREE.Group();
      scene.add(root);
      scene.add(new THREE.AmbientLight(0xffffff, 1.15));
      const sun = new THREE.DirectionalLight(0xffffff, 1.8);
      sun.position.set(0.5, -1, 1.8);
      scene.add(sun);
      renderer = new THREE.WebGLRenderer({
        canvas: nextMap.getCanvas(),
        context: gl as WebGLRenderingContext,
        antialias: true,
      });
      renderer.autoClear = false;
      rebuild();
    },
    render(_gl, options) {
      if (!renderer || !scene || !camera) return;
      const projectionMatrix = options.defaultProjectionData?.mainMatrix;
      if (!projectionMatrix) return;
      camera.projectionMatrix = new THREE.Matrix4()
        .fromArray(projectionMatrix)
        .multiply(sceneTransform);
      renderer.resetState();
      renderer.render(scene, camera);
    },
    onRemove() {
      root?.clear();
      scene = null;
      camera = null;
      renderer = null;
      root = null;
      map = null;
    },
  };
}

const BuildingMap = forwardRef<BuildingMapHandle, Props>(function BuildingMap(
  { stores, assets = [], routeSteps, destinationId, selectedId, highlightCategory = null, floorWidth, floorHeight,
    origin, focus, heading, initialAzimuth, locale = "en", navEdges = [], onProjection, onBlockClick },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const youMarkerRef = useRef<maplibregl.Marker | null>(null);
  const labelMarkersRef = useRef<maplibregl.Marker[]>([]);
  const assetsRef = useRef<AssetData[]>(assets);
  const toLngLatRef = useRef<(x: number, y: number) => [number, number]>(() => [0, 0]);
  const threeAssetLayerRef = useRef<(maplibregl.CustomLayerInterface & { rebuild: () => void }) | null>(null);
  const readyRef = useRef(false);
  const lastRouteCameraKeyRef = useRef<string | null>(null);
  // `ready` STATE (not just the ref) so data/marker effects re-run once the map
  // finishes loading — refs don't trigger re-renders, which left labels unbuilt
  // until the first click changed a prop.
  const [ready, setReady] = useState(false);
  const floorCamRef = useRef<{ center: [number, number]; zoom: number } | null>(null);
  const originRef = useRef(origin);
  const didInitialFrameRef = useRef(false);
  const initialFrameFnRef = useRef<((fitZoom: number) => void) | null>(null);
  const fitZoomRef = useRef(18);
  originRef.current = origin;

  const toLngLat = useMemo(() => makeToLngLat(floorWidth, floorHeight), [floorWidth, floorHeight]);
  assetsRef.current = assets;
  toLngLatRef.current = toLngLat;

  // Keep latest callbacks/data in refs so the map's persistent listeners stay current
  const onProjectionRef = useRef(onProjection);
  const onBlockClickRef = useRef(onBlockClick);
  const destLngLatRef = useRef<[number, number] | null>(null);
  onProjectionRef.current = onProjection;
  onBlockClickRef.current = onBlockClick;

  const destinationPoint = useMemo(() => {
    if (routeSteps.length < 2 || !destinationId) return null;
    const destination = stores.find((store) => store.id === destinationId);
    return destination?.polygon.length ? storeCentroid(destination) : null;
  }, [routeSteps.length, destinationId, stores]);

  const routePoints = useMemo(() => {
    const points = routeSteps.map((step) => ({ x: step.x, y: step.y }));
    if (destinationPoint) points.push(destinationPoint);
    return points;
  }, [routeSteps, destinationPoint]);

  const routeEndPoint = routePoints[routePoints.length - 1] ?? null;
  destLngLatRef.current = routePoints.length >= 2 && routeEndPoint
    ? toLngLat(routeEndPoint.x, routeEndPoint.y)
    : null;

  // Bounds of the whole floor (for fitBounds / recenter)
  const floorBounds = useMemo(() => {
    const sw = toLngLat(0, floorHeight);
    const ne = toLngLat(floorWidth, 0);
    return new maplibregl.LngLatBounds(sw, ne);
  }, [toLngLat, floorWidth, floorHeight]);

  // ── GeoJSON builders ───────────────────────────────────────────────────────
  const roomsFC = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: stores
      .filter((s) => !isFlatMapArea(s.category) && !isPointAsset(s.category) && s.polygon.length >= 3)
      .map((s) => {
        const ring = s.polygon.map((p) => toLngLat(p.x, p.y));
        ring.push(ring[0]); // close
        const visual = categoryVisual(s.category);
        return {
          type: "Feature" as const,
          id: s.id,
          properties: {
            id: s.id, name: s.name, nameAr: s.nameAr,
            category: s.category, color: s.color || "#ffffff",
            accent: visual.accent,
            categoryFill: visual.fill,
            height: heightMeters(s),
          },
          geometry: { type: "Polygon" as const, coordinates: [ring] },
        };
      }),
  }), [stores, toLngLat]);

  const areasFC = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: stores
      .filter((s) => (isFlatMapArea(s.category) || isPointAsset(s.category)) && !isBoundaryArea(s.category) && s.polygon.length >= 3)
      .map((s) => {
        const ring = s.polygon.map((p) => toLngLat(p.x, p.y));
        ring.push(ring[0]);
        const visual = categoryVisual(s.category);
        return {
          type: "Feature" as const,
          id: s.id,
          properties: {
            id: s.id,
            name: s.name,
            nameAr: s.nameAr,
            category: s.category,
            fill: s.color || visual.fill,
            accent: visual.accent,
          },
          geometry: { type: "Polygon" as const, coordinates: [ring] },
        };
      }),
  }), [stores, toLngLat]);

  const boundariesFC = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: stores
      .filter((s) => isBoundaryArea(s.category) && s.polygon.length >= 3)
      .map((s) => {
        const ring = s.polygon.map((p) => toLngLat(p.x, p.y));
        ring.push(ring[0]);
        return {
          type: "Feature" as const,
          id: s.id,
          properties: { id: s.id, color: s.color || "#334155" },
          geometry: { type: "Polygon" as const, coordinates: [ring] },
        };
      }),
  }), [stores, toLngLat]);

  const routeFC = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: routePoints.length >= 2 ? [{
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "LineString" as const,
        coordinates: routePoints.map((point) => toLngLat(point.x, point.y)),
      },
    }] : [],
  }), [routePoints, toLngLat]);

  const corridorsFC = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: navEdges.map((e, i) => ({
      type: "Feature" as const,
      id: i,
      properties: {},
      geometry: {
        type: "LineString" as const,
        coordinates: [toLngLat(e.a.x, e.a.y), toLngLat(e.b.x, e.b.y)],
      },
    })),
  }), [navEdges, toLngLat]);

  const floorFC = useMemo(() => {
    const ring = [
      toLngLat(0, 0), toLngLat(floorWidth, 0),
      toLngLat(floorWidth, floorHeight), toLngLat(0, floorHeight), toLngLat(0, 0),
    ];
    return {
      type: "FeatureCollection" as const,
      features: [{ type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [ring] } }],
    };
  }, [toLngLat, floorWidth, floorHeight]);

  // Per-block colour comes from the admin's stored `color` field on each store;
  // system states override it in priority order:
  //   destination → selected → category filter → hover → block's own color.
  // The string fallback at the end of `coalesce` covers blocks that never had
  // a color set (older data) so the expression always resolves to a valid hex.
  const colorExpr = useMemo(() => ([
    "case",
    ["==", ["get", "id"], destinationId ?? "__none__"], DEST_COLOR,
    ["==", ["get", "id"], selectedId ?? "__none__"], SELECTED_COLOR,
    ["==", ["get", "category"], highlightCategory ?? "__none__"], CATEGORY_HIGHLIGHT_COLOR,
    ["boolean", ["feature-state", "hover"], false], HOVER_COLOR,
    ["==", ["coalesce", ["get", "color"], "#ffffff"], "#ffffff"], ["get", "categoryFill"],
    ["coalesce", ["get", "color"], DEFAULT_BLOCK_COLOR],
  ] as any), [destinationId, selectedId, highlightCategory]);

  const outlineColorExpr = useMemo(() => ([
    "case",
    ["==", ["get", "id"], destinationId ?? "__none__"], DEST_COLOR,
    ["==", ["get", "id"], selectedId ?? "__none__"], SELECTED_COLOR,
    ["boolean", ["feature-state", "hover"], false], ROUTE_DARK,
    ["coalesce", ["get", "accent"], "#94a3b8"],
  ] as any), [destinationId, selectedId]);

  const outlineWidthExpr = useMemo(() => ([
    "case",
    ["==", ["get", "id"], destinationId ?? "__none__"], 3.4,
    0,
  ] as any), [destinationId]);

  // ── Initialise the map once ────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: "bg", type: "background", paint: { "background-color": BACKGROUND } }],
      },
      center: toLngLat(floorWidth / 2, floorHeight / 2),
      zoom: 18,
      pitch: 50,
      bearing: 0,
      attributionControl: false,
      dragRotate: true,
      pitchWithRotate: true,
      maxPitch: 70,
      canvasContextAttributes: { antialias: true },
    });
    mapRef.current = map;

    map.on("load", () => {
      // Soft, even light so white blocks read clean (bright tops, gentle gray
      // sides) rather than harsh — matches the LEAP look.
      try {
        map.setLight({ anchor: "viewport", color: "#ffffff", intensity: 0.35, position: [1.5, 200, 50] });
      } catch { /* older style spec — ignore */ }

      // Floor surface + subtle border so the building reads on the cream backdrop
      map.addSource("floor", { type: "geojson", data: floorFC });
      map.addLayer({
        id: "floor-fill", type: "fill", source: "floor",
        paint: { "fill-color": FLOOR_COLOR },
      });
      if (!map.hasImage("floor-tile")) {
        map.addImage("floor-tile", makeFloorPatternImage(), { pixelRatio: 2 });
      }
      map.addLayer({
        id: "floor-pattern", type: "fill", source: "floor",
        paint: { "fill-pattern": "floor-tile", "fill-opacity": 0.2 },
      });
      map.addSource("areas", { type: "geojson", data: areasFC, promoteId: "id" });
      map.addLayer({
        id: "areas-fill", type: "fill", source: "areas",
        paint: { "fill-color": ["coalesce", ["get", "fill"], "#f8fafc"], "fill-opacity": 0.52 },
      });
      map.addLayer({
        id: "areas-outline", type: "line", source: "areas",
        paint: { "line-color": ["coalesce", ["get", "accent"], "#94a3b8"], "line-width": 1.2, "line-opacity": 0.5 },
      });
      map.addSource("boundaries", { type: "geojson", data: boundariesFC, promoteId: "id" });
      map.addLayer({
        id: "building-boundary", type: "line", source: "boundaries",
        paint: {
          "line-color": ["coalesce", ["get", "color"], "#334155"],
          "line-width": ["interpolate", ["linear"], ["zoom"], 16, 2, 20, 5],
          "line-opacity": 0.9,
          "line-dasharray": [2, 1],
        },
      });
      map.addLayer({
        id: "floor-outline", type: "line", source: "floor",
        paint: { "line-color": "#e4dcca", "line-width": 4 },
      });

      // Optional corridor network overlay. Normal navigation leaves this empty
      // so only the calculated route ribbon is shown.
      if (!map.hasImage("corridor-arrow")) {
        map.addImage("corridor-arrow", makeArrowImage(), { pixelRatio: 2 });
      }
      map.addSource("corridors", { type: "geojson", data: corridorsFC });
      map.addLayer({
        id: "corridor-line", type: "line", source: "corridors",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#9aa6b2", "line-width": 5, "line-opacity": 0.45 },
      });
      map.addLayer({
        id: "corridor-arrows", type: "symbol", source: "corridors",
        layout: {
          "symbol-placement": "line",
          "symbol-spacing": 55,
          "icon-image": "corridor-arrow",
          "icon-size": 0.55,
          "icon-rotation-alignment": "map",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
        paint: { "icon-opacity": 0.6 },
      });

      // Rooms (3D extrusion)
      map.addSource("rooms", { type: "geojson", data: roomsFC, promoteId: "id" });
      // Subtle contact shadow: each room's footprint as a soft warm-gray fill
      // offset toward the light's far side, so blocks appear grounded.
      map.addLayer({
        id: "rooms-shadow", type: "fill", source: "rooms",
        paint: { "fill-color": "#9c937f", "fill-opacity": 0.18, "fill-translate": [6, 7], "fill-translate-anchor": "map" },
      });
      map.addLayer({
        id: "rooms-3d", type: "fill-extrusion", source: "rooms",
        paint: {
          "fill-extrusion-color": colorExpr,
          "fill-extrusion-height": ["get", "height"],
          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": 1,
          // MapLibre supports vertical-gradient (top→bottom shading); AO is
          // Mapbox-only, so we fake grounding with the shadow fill above.
          "fill-extrusion-vertical-gradient": true,
        },
      });
      map.addLayer({
        id: "rooms-outline", type: "line", source: "rooms",
        paint: {
          "line-color": outlineColorExpr,
          "line-width": outlineWidthExpr,
          "line-opacity": 0.72,
        },
      });

      const assetLayer = createThreeAssetLayer(
        () => assetsRef.current,
        () => toLngLatRef.current,
      );
      threeAssetLayerRef.current = assetLayer;
      map.addLayer(assetLayer);

      // Route ribbon: a thick rounded bright-blue band with a darker edge and
      // large white chevrons inside it (LEAP-style). Widths interpolate with
      // zoom so the ribbon stays proportionally chunky as you zoom in.
      const haloWidth: any = ["interpolate", ["linear"], ["zoom"], 16, 12, 19, 22, 22, 40];
      const lineWidth: any = ["interpolate", ["linear"], ["zoom"], 16, 8, 19, 16, 22, 30];
      map.addSource("route", { type: "geojson", data: routeFC });
      map.addLayer({
        id: "route-halo", type: "line", source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ROUTE_DARK, "line-width": haloWidth },
      });
      map.addLayer({
        id: "route-line", type: "line", source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ROUTE_COLOR, "line-width": lineWidth },
      });
      // Large white direction chevrons sitting inside the ribbon.
      if (!map.hasImage("route-arrow")) {
        map.addImage("route-arrow", makeChevronImage(), { pixelRatio: 2 });
      }
      map.addLayer({
        id: "route-arrows", type: "symbol", source: "route",
        layout: {
          "symbol-placement": "line",
          "symbol-spacing": ["interpolate", ["linear"], ["zoom"], 16, 34, 20, 70] as any,
          "icon-image": "route-arrow",
          "icon-size": ["interpolate", ["linear"], ["zoom"], 16, 0.5, 20, 1.1] as any,
          "icon-rotation-alignment": "map",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
        paint: { "icon-opacity": 1 },
      });

      // Click to select a room
      map.on("click", "rooms-3d", (e) => {
        const f = e.features?.[0];
        const id = f?.properties?.id as string | undefined;
        if (id) onBlockClickRef.current?.(id);
      });
      // Hover highlight: recolor the block under the cursor via feature-state.
      let hoveredId: string | number | null = null;
      const clearHover = () => {
        if (hoveredId !== null) {
          map.setFeatureState({ source: "rooms", id: hoveredId }, { hover: false });
          hoveredId = null;
        }
      };
      map.on("mousemove", "rooms-3d", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const f = e.features?.[0];
        if (!f || f.id === undefined) return;
        if (hoveredId !== null && hoveredId !== f.id) {
          map.setFeatureState({ source: "rooms", id: hoveredId }, { hover: false });
        }
        hoveredId = f.id;
        map.setFeatureState({ source: "rooms", id: hoveredId }, { hover: true });
      });
      map.on("mouseleave", "rooms-3d", () => {
        map.getCanvas().style.cursor = "";
        clearHover();
      });

      readyRef.current = true;
      setReady(true);
      map.resize();

      // Compute the "whole floor" zoom once; we zoom IN from it onto the scan point.
      const cam = map.cameraForBounds(floorBounds, { padding: 24 });
      const fitZoom = (cam?.zoom as number) ?? 18;
      fitZoomRef.current = fitZoom;
      floorCamRef.current = {
        center: toLngLat(floorWidth / 2, floorHeight / 2),
        zoom: fitZoom + 0.35,
      };

      doInitialFrame(fitZoom);
      emitProjection();
    });

    // Frame onto the QR scan point (origin) at a close zoom, falling back to the
    // whole-floor view if we don't know the origin yet.
    const doInitialFrame = (fitZoom: number) => {
      if (didInitialFrameRef.current) return;
      const o = originRef.current;
      const closeZoom = fitZoom + 1.7; // zoom in to show the area around "you are here"
      if (o) {
        didInitialFrameRef.current = true;
        map.jumpTo({ center: toLngLat(o.x, o.y), zoom: closeZoom, pitch: 50, bearing: 0 });
      } else {
        // origin not loaded yet → show the floor; the effect below will re-frame.
        map.jumpTo({ center: toLngLat(floorWidth / 2, floorHeight / 2), zoom: fitZoom + 0.35, pitch: 50, bearing: 0 });
      }
    };
    initialFrameFnRef.current = doInitialFrame;

    let lastAzimuth = NaN;
    let lastEmit = 0;
    const emitProjection = (force = false) => {
      const cb = onProjectionRef.current;
      if (!cb) return;
      // Raw map bearing (radians). The compass combines this with the building's
      // northOffset to point its needle at true north.
      const azimuth = (map.getBearing() * Math.PI) / 180;
      // The only consumer (the compass) reads `azimuth`, which changes on rotate
      // — never on pan/zoom. Skip the re-render unless the bearing actually moved,
      // and cap rotation updates to ~10fps so the page never thrashes the map.
      if (!force) {
        if (Math.abs(azimuth - lastAzimuth) < 0.0015) return;
        const now = performance.now();
        if (now - lastEmit < 100) return;
        lastEmit = now;
      }
      lastAzimuth = azimuth;
      cb({ azimuth, destScreen: null });
    };
    map.on("rotate", emitProjection);
    map.on("moveend", () => emitProjection(true));

    return () => {
      readyRef.current = false;
      threeAssetLayerRef.current = null;
      mapRef.current = null;
      try { map.stop(); } catch { /* noop */ }
      try { map.remove(); } catch { /* noop */ }
    };

  }, []); // init once

  // ── Frame onto the QR scan point once origin is known (post-load) ──────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || didInitialFrameRef.current) return;
    if (!origin) return;
    initialFrameFnRef.current?.(fitZoomRef.current);
  }, [origin, ready]);

  // ── Push data updates ──────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    (map.getSource("rooms") as maplibregl.GeoJSONSource | undefined)?.setData(roomsFC as any);
  }, [roomsFC, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    (map.getSource("route") as maplibregl.GeoJSONSource | undefined)?.setData(routeFC as any);
  }, [routeFC, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    (map.getSource("corridors") as maplibregl.GeoJSONSource | undefined)?.setData(corridorsFC as any);
  }, [corridorsFC, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    (map.getSource("floor") as maplibregl.GeoJSONSource | undefined)?.setData(floorFC as any);
  }, [floorFC, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    (map.getSource("areas") as maplibregl.GeoJSONSource | undefined)?.setData(areasFC as any);
  }, [areasFC, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    (map.getSource("boundaries") as maplibregl.GeoJSONSource | undefined)?.setData(boundariesFC as any);
  }, [boundariesFC, ready]);

  useEffect(() => {
    if (!readyRef.current) return;
    threeAssetLayerRef.current?.rebuild();
  }, [assets, toLngLat, ready]);

  // Recolor on selection/destination change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !map.getLayer("rooms-3d")) return;
    map.setPaintProperty("rooms-3d", "fill-extrusion-color", colorExpr);
    if (map.getLayer("rooms-outline")) {
      map.setPaintProperty("rooms-outline", "line-color", outlineColorExpr);
      map.setPaintProperty("rooms-outline", "line-width", outlineWidthExpr);
    }
  }, [colorExpr, outlineColorExpr, outlineWidthExpr, ready]);

  // ── Markers: zone pills + amenity badges + logos + room labels ─────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    labelMarkersRef.current.forEach((m) => m.remove());
    labelMarkersRef.current = [];

    const real = stores.filter((s) =>
      s.polygon.length >= 3 &&
      !isBoundaryArea(s.category) &&
      (!isOpenSpace(s.category) || LANDMARK_CATEGORIES.has(s.category)),
    );
    const addMarker = (lngLat: [number, number], el: HTMLElement) => {
      labelMarkersRef.current.push(new maplibregl.Marker({ element: el }).setLngLat(lngLat).addTo(map));
    };

    // 1) ZONE PILLS — one big colored pill at the centroid of each zone group
    const zoneGroups = new Map<string, { en: string; ar: string; color: string; xs: number[]; ys: number[] }>();
    for (const s of real) {
      if (!s.zone) continue;
      const g = zoneGroups.get(s.zone) ?? { en: s.zone, ar: s.zoneAr || s.zone, color: s.color, xs: [], ys: [] };
      const c = storeCentroid(s);
      g.xs.push(c.x); g.ys.push(c.y);
      zoneGroups.set(s.zone, g);
    }
    for (const g of zoneGroups.values()) {
      const mx = g.xs.reduce((a, v) => a + v, 0) / g.xs.length;
      const my = g.ys.reduce((a, v) => a + v, 0) / g.ys.length;
      const el = document.createElement("div");
      el.dataset.kind = "zone";
      el.style.cssText = "pointer-events:none;transform:translate(-50%,-50%);white-space:nowrap;font-weight:800;font-size:13px;letter-spacing:0.04em;color:#fff;padding:6px 16px;border-radius:9999px;border:2px solid rgba(255,255,255,0.92);box-shadow:0 6px 16px rgba(15,23,42,0.32),0 1px 0 rgba(255,255,255,0.4) inset;text-transform:uppercase;text-shadow:0 1px 2px rgba(0,0,0,0.25)";
      el.style.background = g.color;
      el.textContent = locale === "ar" ? g.ar : g.en;
      addMarker(toLngLat(mx, my), el);
    }

    // 2) PER-STORE markers
    for (const s of real) {
      const c = storeCentroid(s);
      const ll = toLngLat(c.x, c.y);
      const isDest = s.id === destinationId;
      const isSel = s.id === selectedId;
      const name = locale === "ar" ? s.nameAr : s.name;

      // Highlighted (destination / selected) → bold colored pill, always on top
      if (isDest || isSel) {
        const el = document.createElement("div");
        el.dataset.kind = "highlight";
        el.style.cssText = "pointer-events:none;transform:translate(-50%,-50%);white-space:nowrap;font-weight:800;font-size:12px;color:#fff;border:2px solid #fff;border-radius:9999px;padding:3px 10px;box-shadow:0 4px 10px rgba(0,0,0,0.28)";
        el.style.background = isDest ? "#7c3aed" : "#ec4899";
        el.textContent = `${categoryGlyph(s.category)}  ${name}`;
        addMarker(ll, el);
        continue;
      }

      // Logo badge (mall stores etc.)
      if (s.logoUrl) {
        const el = document.createElement("div");
        el.dataset.kind = "logo";
        el.style.cssText = "pointer-events:none;transform:translate(-50%,-50%);background:#fff;border-radius:9999px;padding:3px 8px;box-shadow:0 2px 6px rgba(0,0,0,0.2);display:flex;align-items:center;gap:4px;max-width:120px";
        const img = document.createElement("img");
        img.src = s.logoUrl;
        img.style.cssText = "height:18px;width:auto;object-fit:contain";
        img.onerror = () => { el.textContent = name; };
        el.appendChild(img);
        addMarker(ll, el);
        continue;
      }

      // Amenity → colored icon badge
      const am = categoryMarker(s);
      if (am) {
        const el = document.createElement("div");
        el.dataset.kind = "amenity";
        const restroomIcon = restroomTiles(s.category);
        if (restroomIcon) {
          el.style.cssText = "pointer-events:none;transform:translate(-50%,-50%);display:flex;align-items:center;gap:3px;padding:3px;background:rgba(255,255,255,0.82);border-radius:6px;border:1px solid rgba(255,255,255,0.9);box-shadow:0 3px 8px rgba(15,23,42,0.22)";
          el.innerHTML = restroomIcon;
        } else {
          el.style.cssText = "pointer-events:none;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:2px";
          el.innerHTML = `
            <div style="width:26px;height:26px;border-radius:9999px;background:${am.bg};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;font-size:14px;line-height:1">${am.icon}</div>
            <div style="font-size:10px;font-weight:700;color:#0f172a;text-shadow:0 1px 0 #fff,0 0 3px rgba(255,255,255,0.9);max-width:90px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</div>`;
        }
        addMarker(ll, el);
        continue;
      }

      // Plain room label
      const el = document.createElement("div");
      el.dataset.kind = "room";
      el.style.cssText = "pointer-events:none;transform:translate(-50%,-50%);white-space:nowrap;font-weight:700;font-size:12px;color:#0f172a;text-shadow:0 1px 0 #fff,0 0 4px rgba(255,255,255,0.9);text-align:center";
      el.textContent = name;
      addMarker(ll, el);
    }

    // 3) Zoom-based LOD: show room labels when zoomed in (the default view), and
    //    swap to zone pills only when zoomed out to the whole floor.
    const applyLod = () => {
      const fz = fitZoomRef.current;
      const z = map.getZoom();
      const routeActive = routeSteps.length >= 2;
      const showRooms = z >= fz + 0.8;   // default close view is fz+1.7 → rooms visible
      const showZones = z < fz + 1.3;    // zoomed out → zone pills carry the map
      for (const m of labelMarkersRef.current) {
        const el = m.getElement();
        const kind = el.dataset.kind;
        if (kind === "room" || kind === "logo") el.style.display = !routeActive && showRooms ? "" : "none";
        else if (kind === "zone") el.style.display = showZones ? "" : "none";
        // amenity + highlight always visible
      }
    };
    applyLod();
    // Re-run on zoom AND after the camera settles (the initial jump fires moveend
    // once fitZoom is known) so labels aren't stuck hidden at first paint.
    map.on("zoom", applyLod);
    map.on("moveend", applyLod);
    return () => { map.off("zoom", applyLod); map.off("moveend", applyLod); };
  }, [stores, routeSteps.length, destinationId, selectedId, locale, toLngLat, ready]);

  // ── "You are here" marker (pulsing dot + heading wedge) ────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    youMarkerRef.current?.remove();
    youMarkerRef.current = null;
    if (!origin) return;

    const el = document.createElement("div");
    el.style.width = "26px";
    el.style.height = "26px";
    el.style.position = "relative";
    el.innerHTML = `
      <div style="position:absolute;inset:0;border-radius:9999px;background:rgba(56,189,248,0.35);animation:wainpulse 1.6s ease-out infinite"></div>
      <div style="position:absolute;inset:5px;border-radius:9999px;background:#0ea5e9;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>
      ${heading !== null ? `<div style="position:absolute;left:50%;top:50%;width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:14px solid #0ea5e9;transform:translate(-50%,-22px) rotate(${(heading * 180) / Math.PI}deg);transform-origin:50% 22px"></div>` : ""}
    `;
    const marker = new maplibregl.Marker({ element: el })
      .setLngLat(toLngLat(origin.x, origin.y))
      .addTo(map);
    youMarkerRef.current = marker;
  }, [origin, heading, toLngLat, ready]);

  // Bounds covering the whole route (origin → destination), for auto-framing.
  const routeBounds = useMemo(() => {
    if (routeSteps.length < 2) return null;
    const b = new maplibregl.LngLatBounds();
    routeSteps.forEach((s) => b.extend(toLngLat(s.x, s.y)));
    if (destinationPoint) b.extend(toLngLat(destinationPoint.x, destinationPoint.y));
    if (origin) b.extend(toLngLat(origin.x, origin.y));
    return b;
  }, [routeSteps, destinationPoint, origin, toLngLat]);

  const routeCamera = useMemo(() => {
    if (routeSteps.length < 2) return null;
    const first = origin ?? routeSteps[0];
    const last = routeSteps[routeSteps.length - 1];
    return {
      key: `${routeSteps[0].nodeId}:${last.nodeId}:${routeSteps.length}:${first.x}:${first.y}`,
      center: toLngLat(first.x, first.y),
    };
  }, [routeSteps, origin, toLngLat]);

  // ── When a route appears, start at the scan point in top view ──────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!routeCamera) {
      lastRouteCameraKeyRef.current = null;
      return;
    }
    if (!map || !readyRef.current) return;
    if (lastRouteCameraKeyRef.current === routeCamera.key) return;
    lastRouteCameraKeyRef.current = routeCamera.key;
    map.easeTo({
      center: routeCamera.center,
      zoom: Math.max(map.getZoom(), fitZoomRef.current + 1.8),
      pitch: 0,
      bearing: 0,
      duration: 700,
    });
  }, [routeCamera]);

  // ── Focus follow (only when no route is active) ────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !focus || routeBounds) return;
    map.easeTo({ center: toLngLat(focus.x, focus.y), duration: 600 });
  }, [focus, toLngLat, routeBounds]);

  // (Initial-azimuth bearing rotation intentionally omitted — the route
  //  fitBounds below already frames the path, and running both animations at
  //  once triggers MapLibre's _onEaseFrame race. `initialAzimuth` is accepted
  //  for API compatibility but not applied.)
  void initialAzimuth;

  // ── Imperative handle ──────────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    recenter: () => {
      const map = mapRef.current;
      if (!map) return;
      if (routeCamera) {
        map.easeTo({ center: routeCamera.center, zoom: fitZoomRef.current + 1.8, pitch: 0, bearing: 0, duration: 600 });
      } else if (focus) {
        map.easeTo({ center: toLngLat(focus.x, focus.y), zoom: fitZoomRef.current + 1.7, pitch: 50, duration: 600 });
      } else if (floorCamRef.current) {
        map.easeTo({ center: floorCamRef.current.center, zoom: floorCamRef.current.zoom, pitch: 50, duration: 600 });
      } else {
        map.fitBounds(floorBounds, { padding: 24, pitch: 50, duration: 600 });
      }
    },
    tiltedView: () => { mapRef.current?.easeTo({ pitch: 50, duration: 400 }); },
    topView: () => { mapRef.current?.easeTo({ pitch: 0, duration: 400 }); },
    zoomIn: () => { mapRef.current?.zoomIn({ duration: 250 }); },
    zoomOut: () => { mapRef.current?.zoomOut({ duration: 250 }); },
  }), [floorBounds, routeCamera, focus, toLngLat]);

  return (
    <>
      <style>{`@keyframes wainpulse { 0% { transform: scale(0.6); opacity: 0.9; } 100% { transform: scale(2.4); opacity: 0; } }`}</style>
      <div ref={containerRef} className="w-full h-full" />
    </>
  );
});

export default BuildingMap;
