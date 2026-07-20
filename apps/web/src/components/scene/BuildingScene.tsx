// @ts-nocheck — dormant Three.js / React-Three-Fiber engine, kept for possible
// future use but NOT imported by the app (the active engine is BuildingMap.tsx /
// MapLibre). R3F v9's intrinsic elements (mesh, group, …) don't resolve under
// React 19's JSX namespace; skipping type-checking here keeps the rest of the
// web app fully type-checked without reviving this file's typings.
"use client";
import { useRef, useMemo, useEffect, useState, useImperativeHandle, forwardRef, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Text, Html } from "@react-three/drei";
import * as THREE from "three";
import { categoryGlyph, isOpenSpace } from "@/lib/category-icons";

// ─── Types ───────────────────────────────────────────────────────────────────

interface StoreData {
  id: string;
  name: string;
  nameAr: string;
  polygon: Array<{ x: number; y: number }>;
  extrudeHeight: number;
  color: string;
  category: string;
}

interface RouteStep {
  nodeId: string;
  floorId: string;
  x: number;
  y: number;
  z: number;
}

export interface SceneProjectionInfo {
  /** Camera azimuth in radians, 0 means north is up on screen. */
  azimuth: number;
  /** Destination position in normalized screen coords (-1..1 X/Y). null when no route. */
  destScreen: { x: number; y: number; inView: boolean } | null;
}

interface Props {
  stores: StoreData[];
  routeSteps: RouteStep[];
  destinationId: string | null;
  selectedId: string | null;
  floorWidth: number;
  floorHeight: number;
  origin: { x: number; y: number } | null;
  /** When set, camera tightly centers on this point (used during navigation). */
  focus: { x: number; y: number } | null;
  /** Heading the user should face (radians). Renders an arrow on the pin. */
  heading: number | null;
  /** One-shot azimuth applied to camera when destination changes. */
  initialAzimuth: number | null;
  /** Fires each frame with camera azimuth + destination screen-position. */
  onProjection?: (info: SceneProjectionInfo) => void;
  onBlockClick?: (storeId: string) => void;
}

export interface BuildingSceneHandle {
  recenter: () => void;
  topView: () => void;
  tiltedView: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

// ─── LEAP / invisual.app-style palette ──────────────────────────────────────
// Cream "outside" + off-white floor + white extruded blocks with soft shadows.
const DEFAULT_ROOM_COLOR = "#ffffff";      // all rooms are white by default
const DESTINATION_COLOR = "#5b21b6";       // vivid LEAP-style purple
const SELECTED_COLOR = "#ec4899";
const ROUTE_COLOR = "#38bdf8";             // bright LEAP-blue
const ROUTE_DARK = "#0284c7";
const FLOOR_COLOR = "#fbf8f3";             // warm off-white (the building interior)
const BACKGROUND = "#f0e9da";              // cream (outside the building boundary)
const SHADOW_COLOR = "#d6cbb3";            // warm gray drop-shadow under blocks

// LOD: as the camera pulls back, fade label-text → icon-only → nothing.
// (These compare against camera.position.y in world units.)
const LABEL_HIDE_DISTANCE = 1800;
const ICON_HIDE_DISTANCE = 3000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toWorld(x: number, y: number, w: number, h: number, yOffset = 0): [number, number, number] {
  return [x - w / 2, yOffset, -(y - h / 2)];
}
function polygonCentroid(poly: Array<{ x: number; y: number }>) {
  if (poly.length === 0) return { x: 0, y: 0 };
  let sx = 0, sy = 0;
  for (const p of poly) { sx += p.x; sy += p.y; }
  return { x: sx / poly.length, y: sy / poly.length };
}

// ─── Floor base ──────────────────────────────────────────────────────────────

function FloorBase({ width, height }: { width: number; height: number }) {
  // Floor matches the actual building footprint so the cream "outside"
  // is visible at the edges (LEAP-style).
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial color={FLOOR_COLOR} roughness={1} />
      </mesh>
    </group>
  );
}

// ─── Walkable corridor lines (drawn flat on the floor from the nav graph) ────

// Corridor overlay removed — LEAP-style walkable space is the negative space
// between extruded blocks, lit naturally by the floor color and block shadows.

// ─── Room block (extruded polygon) ───────────────────────────────────────────

function RoomBlock({
  store, isDestination, isSelected, w, h, onClick,
}: {
  store: StoreData;
  isDestination: boolean;
  isSelected: boolean;
  w: number;
  h: number;
  onClick?: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const open = isOpenSpace(store.category);
  const roomHeight = Math.max(0, Number.isFinite(store.extrudeHeight) ? store.extrudeHeight : 4) * 5.6;

  const { geometry, shadowGeom } = useMemo(() => {
    if (store.polygon.length < 3) return { geometry: null, shadowGeom: null };
    const shape = new THREE.Shape();
    const p0 = store.polygon[0];
    shape.moveTo(p0.x - w / 2, -(p0.y - h / 2));
    for (let i = 1; i < store.polygon.length; i++) {
      const p = store.polygon[i];
      shape.lineTo(p.x - w / 2, -(p.y - h / 2));
    }
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: roomHeight, bevelEnabled: false });

    // Fake drop-shadow: same polygon, flat, offset slightly south-east
    const sh = new THREE.ShapeGeometry(shape);
    return { geometry: geo, shadowGeom: sh };
  }, [store.polygon, roomHeight, w, h]);

  useFrame(({ clock }) => {
    if (isDestination && meshRef.current) {
      const t = (Math.sin(clock.elapsedTime * 2.4) + 1) / 2;
      const mat = meshRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.15 + t * 0.45;
    }
  });

  if (open || roomHeight <= 0 || !geometry || !shadowGeom) return null;

  const color = isDestination ? DESTINATION_COLOR : isSelected ? SELECTED_COLOR : DEFAULT_ROOM_COLOR;
  const emissive = isDestination ? "#7c3aed" : isSelected ? "#f472b6" : "#000000";

  return (
    <group>
      {/* Drop shadow on the floor (offset toward camera-facing corner) */}
      <mesh
        geometry={shadowGeom}
        rotation={[Math.PI / 2, 0, 0]}
        position={[3, 0.02, 3]}
      >
        <meshBasicMaterial color={SHADOW_COLOR} transparent opacity={0.55} />
      </mesh>
      {/* Main extruded block — pure white by default; coloured only when called out */}
      <mesh
        ref={meshRef}
        geometry={geometry}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        castShadow
        receiveShadow
        onClick={(e) => { e.stopPropagation(); onClick?.(); }}
        onPointerOver={() => { document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { document.body.style.cursor = "default"; }}
      >
        <meshStandardMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={isDestination ? 0.35 : isSelected ? 0.2 : 0}
          roughness={0.7}
          metalness={0}
        />
      </mesh>
    </group>
  );
}

// ─── Block labels (text + category icon, LOD-aware, billboard yaw) ───────────

function BlockOverlay({ store, w, h, isDestination, isSelected }: {
  store: StoreData; w: number; h: number; isDestination: boolean; isSelected: boolean;
}) {
  const [lod, setLod] = useState<"full" | "icon" | "hidden">("full");
  const open = isOpenSpace(store.category);
  const labelHeight = Math.max(0, Number.isFinite(store.extrudeHeight) ? store.extrudeHeight : 4) * 5.6;

  // Watch the camera height to decide LOD visibility (no rotation needed — DOM
  // labels render in screen space and are always pixel-perfect).
  useFrame(({ camera }) => {
    const h2 = camera.position.y;
    const next: "full" | "icon" | "hidden" =
      isDestination ? "full"
      : h2 < LABEL_HIDE_DISTANCE ? "full"
      : h2 < ICON_HIDE_DISTANCE ? "icon"
      : "hidden";
    if (next !== lod) setLod(next);
  });

  if (store.polygon.length === 0 || open || labelHeight <= 0 || lod === "hidden") return null;

  const c = polygonCentroid(store.polygon);
  const [wx, , wz] = toWorld(c.x, c.y, w, h, 0);
  const glyph = categoryGlyph(store.category);

  // Approx polygon shortest dim — used to size the HTML pill so it fits visually
  const xs = store.polygon.map((p) => p.x);
  const ys = store.polygon.map((p) => p.y);
  const dim = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));

  // Map polygon size → distanceFactor (smaller polys = label scales with zoom less aggressively)
  const distanceFactor = Math.min(Math.max(dim * 0.55, 60), 220);

  // Cap the text length so tiny rooms don't get giant overflow pills
  const fullName = store.name.length > 28 ? store.name.slice(0, 26) + "…" : store.name;

  // LEAP-style: bold black text directly on the white block (no pill), except
  // for destination which gets the purple pill so it's obvious.
  return (
    <Html
      position={[wx, labelHeight + 0.5, wz]}
      center
      distanceFactor={distanceFactor}
      zIndexRange={[10, 0]}
      pointerEvents="none"
      transform={false}
      sprite
      occlude={false}
    >
      {isDestination ? (
        <div
          className="pointer-events-none select-none font-bold whitespace-nowrap text-center bg-purple-700 text-white border-2 border-white shadow-lg rounded-full px-3 py-1 flex items-center gap-1"
          style={{ fontSize: 13, lineHeight: 1.15 }}
        >
          <span className="text-base leading-none">{glyph}</span>
          <span className="text-[12px]">{fullName}</span>
        </div>
      ) : isSelected ? (
        <div
          className="pointer-events-none select-none font-bold whitespace-nowrap text-center bg-pink-500 text-white border-2 border-white shadow rounded-full px-3 py-1 flex items-center gap-1"
          style={{ fontSize: 13, lineHeight: 1.15 }}
        >
          <span className="text-base leading-none">{glyph}</span>
          <span className="text-[12px]">{fullName}</span>
        </div>
      ) : (
        <div
          className="pointer-events-none select-none font-bold whitespace-nowrap text-center text-slate-900"
          style={{
            fontSize: lod === "icon" ? 14 : 12,
            lineHeight: 1.1,
            textShadow: "0 1px 0 rgba(255,255,255,0.9), 0 0 4px rgba(255,255,255,0.85)",
          }}
        >
          {lod === "full" ? fullName : glyph}
        </div>
      )}
    </Html>
  );
}

// ─── "You are here" pin ──────────────────────────────────────────────────────

function YouAreHerePin({ origin, w, h, heading }: {
  origin: { x: number; y: number } | null; w: number; h: number; heading: number | null;
}) {
  const ringRef = useRef<THREE.Mesh>(null!);

  useFrame(({ clock }) => {
    if (!ringRef.current) return;
    const t = (clock.elapsedTime * 0.7) % 1;
    ringRef.current.scale.setScalar(1 + t * 2.4);
    const mat = ringRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = (1 - t) * 0.8;
  });

  if (!origin) return null;
  const [wx, , wz] = toWorld(origin.x, origin.y, w, h, 0);

  return (
    <group position={[wx, 0, wz]}>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.4, 0]}>
        <ringGeometry args={[5, 6.5, 48]} />
        <meshBasicMaterial color={ROUTE_COLOR} transparent opacity={0.6} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.5, 0]}>
        <circleGeometry args={[5, 32]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.6, 0]}>
        <circleGeometry args={[4, 32]} />
        <meshBasicMaterial color={ROUTE_COLOR} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.7, 0]}>
        <circleGeometry args={[1.8, 32]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>

      {heading !== null && (
        <group rotation={[0, heading, 0]} position={[0, 0.8, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 7]}>
            <shapeGeometry
              args={[(() => {
                const s = new THREE.Shape();
                s.moveTo(0, -7);
                s.lineTo(-5, 3);
                s.lineTo(0, 1);
                s.lineTo(5, 3);
                s.closePath();
                return s;
              })()]}
            />
            <meshBasicMaterial color={ROUTE_COLOR} transparent opacity={0.85} side={THREE.DoubleSide} />
          </mesh>
        </group>
      )}
    </group>
  );
}

// ─── Route path ──────────────────────────────────────────────────────────────

function RoutePath({ steps, w, h }: { steps: RouteStep[]; w: number; h: number }) {
  const fullPoints = useMemo(
    () => steps.map((s) => new THREE.Vector3(...toWorld(s.x, s.y, w, h, 0.4))),
    [steps, w, h],
  );

  const { tubeGeom, chevrons, endPoint } = useMemo(() => {
    if (fullPoints.length < 2) return { tubeGeom: null, chevrons: [], endPoint: null };
    const fullCurve = new THREE.CatmullRomCurve3(fullPoints, false, "centripetal");
    const sampleCount = 120;
    const all = fullCurve.getPoints(sampleCount);
    const trimAt = Math.max(2, Math.floor(sampleCount * 0.92));
    const trimmed = all.slice(0, trimAt);
    const drawCurve = new THREE.CatmullRomCurve3(trimmed, false, "centripetal");
    const tube = new THREE.TubeGeometry(drawCurve, trimmed.length, 1.8, 8, false);

    const chevs: Array<{ pos: THREE.Vector3; angle: number; key: number }> = [];
    for (let i = 8; i < trimmed.length - 4; i += 14) {
      const a = trimmed[i];
      const b = trimmed[Math.min(i + 2, trimmed.length - 1)];
      const angle = Math.atan2(b.x - a.x, b.z - a.z);
      chevs.push({ pos: a, angle, key: i });
    }

    return { tubeGeom: tube, chevrons: chevs, endPoint: all[all.length - 1] };
  }, [fullPoints]);

  if (!tubeGeom || !endPoint || fullPoints.length < 2) return null;

  return (
    <group>
      <mesh geometry={tubeGeom} renderOrder={1}>
        <meshBasicMaterial color={ROUTE_DARK} />
      </mesh>
      <mesh geometry={tubeGeom} position={[0, 0.05, 0]} renderOrder={2}>
        <meshBasicMaterial color={ROUTE_COLOR} />
      </mesh>

      {chevrons.map((ch) => (
        <Text
          key={ch.key}
          position={[ch.pos.x, 0.55, ch.pos.z]}
          rotation={[-Math.PI / 2, 0, -ch.angle]}
          fontSize={3.6}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.12}
          outlineColor={ROUTE_DARK}
        >
          ▲
        </Text>
      ))}

      {/* Destination teardrop pin */}
      <group position={[endPoint.x, 0, endPoint.z]}>
        <mesh position={[0, 14, 0]} castShadow>
          <sphereGeometry args={[3.8, 16, 16]} />
          <meshStandardMaterial color="#ef4444" emissive="#dc2626" emissiveIntensity={0.7} />
        </mesh>
        <mesh position={[0, 8.5, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[3.2, 9, 16]} />
          <meshStandardMaterial color="#ef4444" emissive="#dc2626" emissiveIntensity={0.55} />
        </mesh>
        <mesh position={[0, 14, 0]}>
          <sphereGeometry args={[1.6, 12, 12]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      </group>
    </group>
  );
}

// ─── Projection emitter — reports azimuth + destination screen pos every frame ──

function ProjectionEmitter({ destWorld, onProjection }: {
  destWorld: [number, number, number] | null;
  onProjection?: (info: SceneProjectionInfo) => void;
}) {
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    if (!onProjection) return;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const azimuth = Math.atan2(dir.x, dir.z);

    let destScreen: SceneProjectionInfo["destScreen"] = null;
    if (destWorld) {
      tmp.set(destWorld[0], destWorld[1] + 12, destWorld[2]).project(camera);
      const inView = tmp.x >= -1 && tmp.x <= 1 && tmp.y >= -1 && tmp.y <= 1 && tmp.z < 1;
      destScreen = { x: tmp.x, y: tmp.y, inView };
    }
    onProjection({ azimuth, destScreen });
  });
  return null;
}

// ─── Camera controller (unchanged from prior version, omitted comments) ─────

const CameraController = forwardRef<
  BuildingSceneHandle,
  {
    floorWidth: number;
    floorHeight: number;
    focus: { x: number; y: number } | null;
    tightFollow: boolean;
    initialAzimuth: number | null;
    controlsRef: React.RefObject<any>;
  }
>(function CameraController({ floorWidth, floorHeight, focus, tightFollow, initialAzimuth, controlsRef }, ref) {
  const { camera } = useThree();
  const maxDim = Math.max(floorWidth, floorHeight);

  const focusWorld = useMemo<[number, number, number]>(() => {
    if (focus) return [focus.x - floorWidth / 2, 0, -(focus.y - floorHeight / 2)];
    return [0, 0, 0];
  }, [focus, floorWidth, floorHeight]);

  const placeCamera = (targetX: number, targetZ: number, zoom = 1) => {
    // Isometric-ish: ~35° tilt from vertical, so blocks show clear side faces (LEAP look).
    const dist = maxDim * 0.95 * zoom;
    camera.position.set(targetX, dist * 0.78, targetZ + dist * 0.55);
    camera.lookAt(targetX, 0, targetZ);
    if (controlsRef.current) {
      controlsRef.current.target.set(targetX, 0, targetZ);
      controlsRef.current.update();
    }
  };

  const recenter = () => {
    if (tightFollow && focus) placeCamera(focusWorld[0], focusWorld[2], 0.55);
    else placeCamera(0, 0, 1.0);
  };

  useEffect(() => {
    if (!controlsRef.current) { recenter(); return; }
    const ctl = controlsRef.current;
    const startTx = ctl.target.x, startTz = ctl.target.z;
    const startCx = camera.position.x, startCy = camera.position.y, startCz = camera.position.z;
    const targetTx = tightFollow && focus ? focusWorld[0] : 0;
    const targetTz = tightFollow && focus ? focusWorld[2] : 0;
    const targetZoom = tightFollow && focus ? 0.55 : 1.0;
    const targetDist = maxDim * 0.95 * targetZoom;
    const targetCy = targetDist * 0.78;
    const targetCx = targetTx;
    const targetCz = targetTz + targetDist * 0.55;
    let t = 0, raf = 0;
    const dur = 30;
    const tick = () => {
      t += 1;
      const k = Math.min(1, t / dur);
      const ease = 1 - Math.pow(1 - k, 3);
      ctl.target.set(startTx + (targetTx - startTx) * ease, 0, startTz + (targetTz - startTz) * ease);
      camera.position.set(
        startCx + (targetCx - startCx) * ease,
        startCy + (targetCy - startCy) * ease,
        startCz + (targetCz - startCz) * ease,
      );
      ctl.update();
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);

  }, [focusWorld[0], focusWorld[2], tightFollow]);

  useEffect(() => { recenter(); }, [floorWidth, floorHeight]);

  useEffect(() => {
    if (initialAzimuth === null || !controlsRef.current) return;
    const ctl = controlsRef.current;
    const offset = new THREE.Vector3().subVectors(camera.position, ctl.target);
    const sph = new THREE.Spherical().setFromVector3(offset);
    sph.theta = initialAzimuth + Math.PI;
    offset.setFromSpherical(sph);
    camera.position.copy(ctl.target).add(offset);
    ctl.update();
  }, [initialAzimuth]);

  useImperativeHandle(ref, () => ({
    recenter, tiltedView: recenter, topView: recenter,
  }));
  return null;
});

// ─── Main scene ──────────────────────────────────────────────────────────────

const BuildingScene = forwardRef<BuildingSceneHandle, Props>(function BuildingScene(
  { stores, routeSteps, destinationId, selectedId, floorWidth, floorHeight,
    origin, focus, heading, initialAzimuth, onProjection, onBlockClick },
  ref,
) {
  const controlsRef = useRef<any>(null);
  const tightFollow = routeSteps.length >= 2;
  const destWorld = useMemo<[number, number, number] | null>(() => {
    if (routeSteps.length === 0) return null;
    const last = routeSteps[routeSteps.length - 1];
    return toWorld(last.x, last.y, floorWidth, floorHeight, 0);
  }, [routeSteps, floorWidth, floorHeight]);
  return (
    <div className="w-full h-full relative">
      <Canvas
        dpr={[1.25, 2.5]}
        shadows
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        camera={{ fov: 38, near: 0.1, far: 10000, position: [0, 700, 700] }}
        style={{ background: BACKGROUND }}
      >
        <CameraController
          ref={ref}
          floorWidth={floorWidth}
          floorHeight={floorHeight}
          focus={focus}
          tightFollow={tightFollow}
          initialAzimuth={initialAzimuth}
          controlsRef={controlsRef}
        />

        <ambientLight intensity={0.7} />
        <hemisphereLight args={["#fffbf2", "#cbb88a", 0.45]} />
        <directionalLight
          position={[-floorWidth * 0.4, floorHeight * 1.5, floorHeight * 0.6]}
          intensity={1.15}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0005}
          shadow-camera-left={-floorWidth}
          shadow-camera-right={floorWidth}
          shadow-camera-top={floorHeight}
          shadow-camera-bottom={-floorHeight}
          shadow-camera-near={0.1}
          shadow-camera-far={floorHeight * 4}
        />

        <ProjectionEmitter destWorld={destWorld} onProjection={onProjection} />

        <Suspense fallback={null}>
          <FloorBase width={floorWidth} height={floorHeight} />

          {/* Rooms (open spaces render flat + transparent automatically) */}
          {stores.map((store) => (
            <RoomBlock
              key={store.id}
              store={store}
              isDestination={store.id === destinationId}
              isSelected={store.id === selectedId && store.id !== destinationId}
              w={floorWidth}
              h={floorHeight}
              onClick={() => onBlockClick?.(store.id)}
            />
          ))}

          {/* Labels + category icons */}
          {stores.map((store) => (
            <BlockOverlay
              key={`o-${store.id}`}
              store={store}
              w={floorWidth}
              h={floorHeight}
              isDestination={store.id === destinationId}
              isSelected={store.id === selectedId && store.id !== destinationId}
            />
          ))}

          <YouAreHerePin origin={origin} w={floorWidth} h={floorHeight} heading={heading} />

          {routeSteps.length >= 2 && (
            <RoutePath steps={routeSteps} w={floorWidth} h={floorHeight} />
          )}
        </Suspense>

        <OrbitControls
          ref={controlsRef}
          enablePan
          enableZoom
          enableRotate={true}
          enableDamping
          dampingFactor={0.12}
          minDistance={Math.max(floorWidth, floorHeight) * 0.25}
          maxDistance={Math.max(floorWidth, floorHeight) * 1.05}
          minPolarAngle={0.05}
          maxPolarAngle={Math.PI / 2.6}
          screenSpacePanning={false}
          touches={{ ONE: 1, TWO: 3 }}
          mouseButtons={{ LEFT: 2, MIDDLE: 1, RIGHT: 0 }}
          onChange={() => {
            const c = controlsRef.current;
            if (!c) return;
            const halfW = floorWidth / 2;
            const halfH = floorHeight / 2;
            const margin = 0.2;
            const tx = Math.max(-halfW * (1 + margin), Math.min(halfW * (1 + margin), c.target.x));
            const tz = Math.max(-halfH * (1 + margin), Math.min(halfH * (1 + margin), c.target.z));
            if (tx !== c.target.x || tz !== c.target.z) {
              const dx = tx - c.target.x;
              const dz = tz - c.target.z;
              c.target.set(tx, 0, tz);
              c.object.position.x += dx;
              c.object.position.z += dz;
            }
          }}
        />
      </Canvas>
    </div>
  );
});

export default BuildingScene;
