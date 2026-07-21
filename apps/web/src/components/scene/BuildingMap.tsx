"use client";
import { useRef, useEffect, useState, useImperativeHandle, forwardRef, useMemo } from "react";
import maplibregl from "maplibre-gl";
import * as THREE from "three";
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

function assetModelHtml(asset: AssetData, color: string, scale: number) {
  const s = Math.max(0.45, Math.min(scale * 1.35, 4));
  const common = `transform:scale(${s});transform-origin:50% 100%;`;
  const label = (asset.label || asset.type).slice(0, 10).toUpperCase();
  switch (asset.type) {
    case "tree":
      return `<div style="${common};position:relative;width:48px;height:70px">
        <div style="position:absolute;left:20px;bottom:0;width:9px;height:28px;background:#8b5a2b;border-radius:3px;box-shadow:6px 0 0 #70461f"></div>
        <div style="position:absolute;left:3px;bottom:22px;width:42px;height:38px;border-radius:50%;background:${color};box-shadow:11px 7px 0 rgba(20,83,45,0.55),-8px 8px 0 rgba(34,197,94,0.35),inset -8px -10px 0 rgba(21,128,61,0.22)"></div>
        <div style="position:absolute;left:14px;bottom:47px;width:24px;height:24px;border-radius:50%;background:#bbf7d0"></div>
      </div>`;
    case "planter":
      return `<div style="${common};position:relative;width:58px;height:44px">
        <div style="position:absolute;left:6px;bottom:0;width:44px;height:20px;background:#8b5a2b;transform:skewX(-12deg);box-shadow:8px -5px 0 #a16207;border-radius:4px"></div>
        <div style="position:absolute;left:13px;bottom:17px;width:24px;height:22px;border-radius:50%;background:${color};box-shadow:-11px 4px 0 #22c55e,11px 3px 0 #15803d"></div>
      </div>`;
    case "door":
      return `<div style="${common};position:relative;width:70px;height:72px">
        <div style="position:absolute;left:25px;bottom:2px;width:18px;height:52px;background:${color};box-shadow:11px -7px 0 rgba(15,23,42,0.3);transform:skewY(-12deg)"></div>
        <div style="position:absolute;left:3px;bottom:46px;width:64px;height:24px;background:${color};clip-path:polygon(50% 0,100% 100%,0 100%);box-shadow:0 6px 0 rgba(15,23,42,0.25)"></div>
        <div style="position:absolute;left:28px;bottom:13px;width:4px;height:28px;background:rgba(255,255,255,0.65);border-radius:2px"></div>
      </div>`;
    case "stairs":
      return `<div style="${common};position:relative;width:68px;height:48px">
        ${[0, 1, 2, 3, 4].map((i) => `<div style="position:absolute;left:${i * 8}px;bottom:${i * 7}px;width:34px;height:9px;background:${color};box-shadow:7px -4px 0 rgba(15,23,42,0.22);border-radius:1px"></div>`).join("")}
        <div style="position:absolute;left:6px;bottom:1px;width:58px;height:3px;background:rgba(255,255,255,0.65)"></div>
      </div>`;
    case "escalator":
      return `<div style="${common};position:relative;width:74px;height:52px">
        <div style="position:absolute;left:5px;bottom:8px;width:58px;height:15px;background:${color};transform:rotate(-24deg);border-radius:9px;box-shadow:6px 6px 0 rgba(15,23,42,0.22)"></div>
        <div style="position:absolute;left:13px;bottom:25px;width:52px;height:5px;background:#e2e8f0;transform:rotate(-24deg);border-radius:4px"></div>
        <div style="position:absolute;left:13px;bottom:12px;width:12px;height:12px;border-radius:50%;background:#f8fafc;border:3px solid ${color}"></div>
      </div>`;
    case "bench":
      return `<div style="${common};position:relative;width:76px;height:44px">
        <div style="position:absolute;left:5px;bottom:25px;width:60px;height:11px;background:${color};border-radius:3px;box-shadow:8px -5px 0 rgba(15,23,42,0.22)"></div>
        <div style="position:absolute;left:10px;bottom:11px;width:50px;height:10px;background:${color};border-radius:3px"></div>
        <div style="position:absolute;left:15px;bottom:0;width:5px;height:13px;background:#475569"></div><div style="position:absolute;right:18px;bottom:0;width:5px;height:13px;background:#475569"></div>
        <div style="position:absolute;left:11px;bottom:28px;width:50px;height:2px;background:rgba(255,255,255,0.55)"></div>
      </div>`;
    case "barrier":
      return `<div style="${common};position:relative;width:82px;height:42px">
        <div style="position:absolute;left:4px;bottom:19px;width:70px;height:9px;background:${color};transform:skewX(-18deg);box-shadow:7px -4px 0 rgba(15,23,42,0.25)"></div>
        <div style="position:absolute;left:12px;bottom:0;width:6px;height:30px;background:#334155"></div><div style="position:absolute;right:14px;bottom:0;width:6px;height:30px;background:#334155"></div>
        <div style="position:absolute;left:19px;bottom:22px;width:14px;height:3px;background:rgba(255,255,255,0.72);transform:skewX(-18deg)"></div>
        <div style="position:absolute;left:42px;bottom:22px;width:14px;height:3px;background:rgba(255,255,255,0.72);transform:skewX(-18deg)"></div>
      </div>`;
    case "elevator":
      return `<div style="${common};position:relative;width:58px;height:72px">
        <div style="position:absolute;left:8px;bottom:0;width:40px;height:60px;background:linear-gradient(90deg,#e2e8f0 0 47%,#94a3b8 47% 53%,#cbd5e1 53%);border:3px solid ${color};border-radius:6px 6px 2px 2px;box-shadow:11px -7px 0 rgba(15,23,42,0.2)"></div>
        <div style="position:absolute;left:14px;bottom:41px;width:10px;height:9px;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:10px solid ${color}"></div>
        <div style="position:absolute;left:31px;bottom:41px;width:10px;height:9px;border-left:6px solid transparent;border-right:6px solid transparent;border-top:10px solid ${color}"></div>
        <div style="position:absolute;left:16px;bottom:7px;width:24px;height:2px;background:rgba(255,255,255,0.75);box-shadow:0 -10px 0 rgba(255,255,255,0.45),0 -20px 0 rgba(255,255,255,0.35)"></div>
      </div>`;
    case "reception":
      return `<div style="${common};position:relative;width:78px;height:54px">
        <div style="position:absolute;left:9px;bottom:0;width:58px;height:28px;background:${color};border-radius:6px 6px 3px 3px;box-shadow:10px -7px 0 rgba(15,23,42,0.2),inset 0 10px 0 rgba(255,255,255,0.22)"></div>
        <div style="position:absolute;left:24px;bottom:23px;width:30px;height:19px;background:#f8fafc;border:3px solid ${color};border-radius:4px;box-shadow:6px -4px 0 rgba(15,23,42,0.14)"></div>
        <div style="position:absolute;left:18px;bottom:8px;width:42px;height:5px;background:rgba(255,255,255,0.35);border-radius:999px"></div>
      </div>`;
    case "info":
      return `<div style="${common};position:relative;width:54px;height:76px">
        <div style="position:absolute;left:22px;bottom:0;width:10px;height:46px;background:${color};box-shadow:6px -4px 0 rgba(15,23,42,0.2)"></div>
        <div style="position:absolute;left:7px;bottom:40px;width:40px;height:27px;background:#f8fafc;border:4px solid ${color};border-radius:7px;box-shadow:7px -5px 0 rgba(15,23,42,0.18);font:bold 20px/22px system-ui;color:${color};text-align:center">i</div>
        <div style="position:absolute;left:5px;bottom:0;width:44px;height:7px;background:#64748b;border-radius:999px"></div>
      </div>`;
    case "security":
      return `<div style="${common};position:relative;width:66px;height:72px">
        <div style="position:absolute;left:11px;bottom:0;width:42px;height:46px;background:${color};clip-path:polygon(10% 0,90% 0,100% 100%,0 100%);box-shadow:10px -6px 0 rgba(15,23,42,0.2)"></div>
        <div style="position:absolute;left:18px;bottom:32px;width:28px;height:22px;background:#dbeafe;border-radius:4px;border:3px solid #e2e8f0"></div>
        <div style="position:absolute;left:24px;bottom:52px;width:16px;height:12px;background:#334155;border-radius:9px 9px 3px 3px"></div>
        <div style="position:absolute;left:20px;bottom:8px;width:24px;height:5px;background:rgba(255,255,255,0.35);border-radius:999px"></div>
      </div>`;
    case "parking":
      return `<div style="${common};position:relative;width:60px;height:76px">
        <div style="position:absolute;left:26px;bottom:0;width:8px;height:48px;background:#475569"></div>
        <div style="position:absolute;left:8px;bottom:40px;width:44px;height:31px;background:${color};border-radius:6px;box-shadow:8px -5px 0 rgba(15,23,42,0.18);font:bold 25px/31px system-ui;color:#fff;text-align:center">P</div>
        <div style="position:absolute;left:21px;bottom:4px;width:18px;height:5px;background:#334155;border-radius:999px"></div>
      </div>`;
    case "dining":
      return `<div style="${common};position:relative;width:76px;height:56px">
        <div style="position:absolute;left:24px;bottom:17px;width:30px;height:24px;background:${color};border-radius:50%;box-shadow:8px -5px 0 rgba(15,23,42,0.18),inset -5px -4px 0 rgba(0,0,0,0.13)"></div>
        <div style="position:absolute;left:7px;bottom:13px;width:12px;height:21px;background:#94a3b8;border-radius:7px 7px 3px 3px"></div>
        <div style="position:absolute;right:8px;bottom:13px;width:12px;height:21px;background:#94a3b8;border-radius:7px 7px 3px 3px"></div>
        <div style="position:absolute;left:36px;bottom:0;width:6px;height:18px;background:#475569"></div>
        <div style="position:absolute;left:30px;bottom:26px;width:18px;height:2px;background:rgba(255,255,255,0.6);transform:rotate(-20deg)"></div>
      </div>`;
    case "kiosk":
      return `<div style="${common};position:relative;width:58px;height:76px">
        <div style="position:absolute;left:12px;bottom:0;width:36px;height:56px;background:${color};border-radius:7px;box-shadow:10px -7px 0 rgba(15,23,42,0.22)"></div>
        <div style="position:absolute;left:18px;bottom:31px;width:24px;height:18px;background:#e0f2fe;border-radius:3px"></div>
        <div style="position:absolute;left:17px;bottom:11px;width:26px;height:8px;background:rgba(255,255,255,0.45);border-radius:999px"></div>
        <div style="position:absolute;left:20px;bottom:23px;width:20px;height:3px;background:rgba(15,23,42,0.35)"></div>
      </div>`;
    case "atm":
      return `<div style="${common};position:relative;width:58px;height:76px">
        <div style="position:absolute;left:11px;bottom:0;width:38px;height:58px;background:${color};border-radius:7px;box-shadow:10px -7px 0 rgba(15,23,42,0.22)"></div>
        <div style="position:absolute;left:17px;bottom:39px;width:26px;height:14px;background:#dbeafe;border-radius:3px"></div>
        <div style="position:absolute;left:17px;bottom:28px;width:25px;height:4px;background:#0f172a;border-radius:999px"></div>
        <div style="position:absolute;left:21px;bottom:11px;width:17px;height:12px;background:rgba(255,255,255,0.35);border-radius:2px"></div>
        <div style="position:absolute;left:16px;bottom:60px;width:28px;height:10px;background:#0f172a;border-radius:4px;color:#fff;font:bold 7px/10px system-ui;text-align:center">ATM</div>
      </div>`;
    case "sign":
      return `<div style="${common};position:relative;width:68px;height:76px">
        <div style="position:absolute;left:30px;bottom:0;width:8px;height:46px;background:#475569"></div>
        <div style="position:absolute;left:7px;bottom:40px;width:54px;height:24px;background:${color};clip-path:polygon(0 0,82% 0,100% 50%,82% 100%,0 100%);box-shadow:8px -5px 0 rgba(15,23,42,0.2)"></div>
        <div style="position:absolute;left:15px;bottom:48px;width:28px;height:3px;background:rgba(255,255,255,0.68);border-radius:999px"></div>
      </div>`;
    default:
      return `<div style="${common};position:relative;width:62px;height:58px">
        <div style="position:absolute;left:8px;bottom:0;width:44px;height:42px;background:${color};clip-path:polygon(18% 0,100% 10%,84% 100%,0 88%);box-shadow:10px -7px 0 rgba(15,23,42,0.22),inset 0 1px 0 rgba(255,255,255,0.35)"></div>
        <div style="position:absolute;left:16px;bottom:16px;width:30px;height:10px;background:rgba(255,255,255,0.32);border-radius:2px;font:bold 6px/10px system-ui;text-align:center;color:#fff">${label}</div>
      </div>`;
  }
}

function transformAssetPoint(asset: AssetData, x: number, y: number) {
  const r = ((asset.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return {
    x: asset.x + x * cos - y * sin,
    y: asset.y + x * sin + y * cos,
  };
}

function rectAsset(asset: AssetData, width: number, height: number) {
  return [
    transformAssetPoint(asset, -width / 2, -height / 2),
    transformAssetPoint(asset, width / 2, -height / 2),
    transformAssetPoint(asset, width / 2, height / 2),
    transformAssetPoint(asset, -width / 2, height / 2),
  ];
}

function circleAsset(asset: AssetData, radius: number, sides = 14) {
  return Array.from({ length: sides }, (_, i) => {
    const t = (i / sides) * Math.PI * 2;
    return transformAssetPoint(asset, Math.cos(t) * radius, Math.sin(t) * radius);
  });
}

function assetFootprint(asset: AssetData) {
  const s = Math.max(0.35, Math.min(asset.scale ?? 1, 4));
  switch (asset.type) {
    case "tree": return circleAsset(asset, 28 * s, 18);
    case "planter": return rectAsset(asset, 60 * s, 34 * s);
    case "door":
      return [
        transformAssetPoint(asset, 0, -38 * s),
        transformAssetPoint(asset, 34 * s, 12 * s),
        transformAssetPoint(asset, 13 * s, 12 * s),
        transformAssetPoint(asset, 13 * s, 42 * s),
        transformAssetPoint(asset, -13 * s, 42 * s),
        transformAssetPoint(asset, -13 * s, 12 * s),
        transformAssetPoint(asset, -34 * s, 12 * s),
      ];
    case "sign":
      return [
        transformAssetPoint(asset, -34 * s, -18 * s),
        transformAssetPoint(asset, 18 * s, -18 * s),
        transformAssetPoint(asset, 36 * s, 0),
        transformAssetPoint(asset, 18 * s, 18 * s),
        transformAssetPoint(asset, -34 * s, 18 * s),
      ];
    case "stairs": return rectAsset(asset, 72 * s, 46 * s);
    case "escalator": return rectAsset(asset, 80 * s, 28 * s);
    case "bench": return rectAsset(asset, 84 * s, 28 * s);
    case "barrier": return rectAsset(asset, 92 * s, 18 * s);
    case "dining": return circleAsset(asset, 30 * s, 16);
    case "elevator": return rectAsset(asset, 48 * s, 58 * s);
    case "reception": return rectAsset(asset, 82 * s, 42 * s);
    case "info": return rectAsset(asset, 42 * s, 54 * s);
    case "security": return rectAsset(asset, 56 * s, 56 * s);
    case "parking": return rectAsset(asset, 48 * s, 60 * s);
    case "kiosk": return rectAsset(asset, 46 * s, 62 * s);
    case "atm": return rectAsset(asset, 46 * s, 62 * s);
    default: return rectAsset(asset, 48 * s, 42 * s);
  }
}

function assetHeight(asset: AssetData) {
  const s = Math.max(0.35, Math.min(asset.scale ?? 1, 4));
  switch (asset.type) {
    case "tree": return 9 * s;
    case "door": return 3 * s;
    case "planter": return 1.8 * s;
    case "bench": return 1.6 * s;
    case "barrier": return 1.4 * s;
    case "stairs": return 1.8 * s;
    case "escalator": return 2 * s;
    case "dining": return 1.5 * s;
    case "sign":
    case "parking":
    case "info": return 5 * s;
    case "elevator":
    case "security":
    case "kiosk":
    case "atm": return 6 * s;
    case "reception": return 3 * s;
    default: return 3 * s;
  }
}

const tempAssetMaterials = new Map<string, THREE.MeshStandardMaterial>();

function material(color: string, roughness = 0.72) {
  const key = `${color}:${roughness}`;
  const cached = tempAssetMaterials.get(key);
  if (cached) return cached;
  const next = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.08 });
  tempAssetMaterials.set(key, next);
  return next;
}

function addBox(group: THREE.Group, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material(color));
  mesh.position.set(x, y, z + sz / 2);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addCylinder(group: THREE.Group, color: string, x: number, y: number, z: number, radius: number, height: number, segments = 16) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), material(color));
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, z + height / 2);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addSphere(group: THREE.Group, color: string, x: number, y: number, z: number, radius: number) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 14, 10), material(color));
  mesh.position.set(x, y, z + radius);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addCone(group: THREE.Group, color: string, x: number, y: number, z: number, radius: number, height: number) {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 4), material(color));
  mesh.rotation.z = Math.PI / 4;
  mesh.position.set(x, y, z + height / 2);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function createAssetObject(asset: AssetData) {
  const group = new THREE.Group();
  const c = asset.color || "#64748b";
  const s = Math.max(0.35, Math.min(asset.scale ?? 1, 4)) * METERS_PER_UNIT * 34;
  const steel = "#475569";
  const light = "#e2e8f0";
  const glass = "#bfdbfe";

  switch (asset.type) {
    case "tree":
      addCylinder(group, "#8b5a2b", 0, 0, 0, s * 0.11, s * 0.75, 10);
      addSphere(group, c, 0, 0, s * 0.56, s * 0.42);
      addSphere(group, "#86efac", -s * 0.25, s * 0.12, s * 0.48, s * 0.28);
      addSphere(group, "#15803d", s * 0.24, -s * 0.08, s * 0.44, s * 0.3);
      break;
    case "planter":
      addBox(group, "#8b5a2b", 0, 0, 0, s * 1.15, s * 0.55, s * 0.22);
      addSphere(group, c, -s * 0.28, 0, s * 0.15, s * 0.22);
      addSphere(group, "#22c55e", s * 0.02, 0, s * 0.17, s * 0.24);
      addSphere(group, "#15803d", s * 0.3, 0, s * 0.15, s * 0.2);
      break;
    case "door":
      addBox(group, c, 0, 0, 0, s * 0.22, s * 0.75, s * 0.08);
      addCone(group, c, 0, -s * 0.52, 0, s * 0.34, s * 0.12);
      break;
    case "stairs":
      for (let i = 0; i < 5; i++) addBox(group, c, -s * 0.4 + i * s * 0.2, 0, i * s * 0.055, s * 0.32, s * 0.8, s * 0.09);
      break;
    case "escalator":
      addBox(group, c, 0, 0, 0, s * 1.05, s * 0.22, s * 0.12).rotation.z = -0.35;
      addCylinder(group, light, -s * 0.45, 0, s * 0.05, s * 0.13, s * 0.24, 14);
      addCylinder(group, light, s * 0.45, 0, s * 0.05, s * 0.13, s * 0.24, 14);
      break;
    case "elevator":
      addBox(group, light, 0, 0, 0, s * 0.58, s * 0.52, s * 0.9);
      addBox(group, c, -s * 0.16, -s * 0.27, s * 0.04, s * 0.26, s * 0.04, s * 0.72);
      addBox(group, c, s * 0.16, -s * 0.27, s * 0.04, s * 0.26, s * 0.04, s * 0.72);
      addBox(group, "#0f172a", 0, -s * 0.31, s * 0.74, s * 0.26, s * 0.035, s * 0.1);
      break;
    case "reception":
      addBox(group, c, 0, 0, 0, s * 1.1, s * 0.38, s * 0.35);
      addBox(group, light, 0, -s * 0.16, s * 0.28, s * 0.42, s * 0.1, s * 0.28);
      addBox(group, glass, 0, -s * 0.23, s * 0.42, s * 0.32, s * 0.04, s * 0.18);
      break;
    case "info":
      addCylinder(group, c, 0, 0, 0, s * 0.08, s * 0.72, 12);
      addBox(group, light, 0, -s * 0.05, s * 0.62, s * 0.48, s * 0.12, s * 0.34);
      addCylinder(group, steel, 0, 0, 0, s * 0.34, s * 0.06, 18);
      break;
    case "security":
      addBox(group, c, 0, 0, 0, s * 0.72, s * 0.62, s * 0.58);
      addBox(group, glass, 0, -s * 0.32, s * 0.36, s * 0.44, s * 0.04, s * 0.22);
      addBox(group, steel, 0, 0, s * 0.58, s * 0.82, s * 0.72, s * 0.08);
      break;
    case "parking":
      addCylinder(group, steel, 0, 0, 0, s * 0.05, s * 0.7, 10);
      addBox(group, c, 0, -s * 0.05, s * 0.65, s * 0.56, s * 0.1, s * 0.4);
      addBox(group, "#ffffff", 0, -s * 0.11, s * 0.76, s * 0.24, s * 0.025, s * 0.2);
      break;
    case "dining":
      addCylinder(group, c, 0, 0, s * 0.2, s * 0.36, s * 0.08, 18);
      addCylinder(group, steel, 0, 0, 0, s * 0.06, s * 0.28, 10);
      addBox(group, steel, -s * 0.58, 0, 0, s * 0.18, s * 0.26, s * 0.28);
      addBox(group, steel, s * 0.58, 0, 0, s * 0.18, s * 0.26, s * 0.28);
      break;
    case "bench":
      addBox(group, c, 0, 0, s * 0.24, s * 1.15, s * 0.12, s * 0.1);
      addBox(group, c, 0, -s * 0.22, s * 0.44, s * 1.15, s * 0.1, s * 0.12);
      addBox(group, steel, -s * 0.42, 0, 0, s * 0.07, s * 0.12, s * 0.26);
      addBox(group, steel, s * 0.42, 0, 0, s * 0.07, s * 0.12, s * 0.26);
      break;
    case "barrier":
      addBox(group, c, 0, 0, s * 0.36, s * 1.2, s * 0.1, s * 0.1);
      addBox(group, steel, -s * 0.48, 0, 0, s * 0.08, s * 0.08, s * 0.5);
      addBox(group, steel, s * 0.48, 0, 0, s * 0.08, s * 0.08, s * 0.5);
      break;
    case "kiosk":
    case "atm":
      addBox(group, c, 0, 0, 0, s * 0.46, s * 0.36, s * 0.82);
      addBox(group, glass, 0, -s * 0.2, s * 0.52, s * 0.3, s * 0.035, s * 0.18);
      addBox(group, "#0f172a", 0, -s * 0.22, s * 0.34, s * 0.28, s * 0.035, s * 0.05);
      break;
    case "sign":
      addCylinder(group, steel, 0, 0, 0, s * 0.045, s * 0.72, 10);
      addBox(group, c, 0, -s * 0.06, s * 0.65, s * 0.72, s * 0.08, s * 0.28);
      break;
    default:
      addBox(group, c, 0, 0, 0, s * 0.55, s * 0.48, s * 0.45);
  }

  group.rotation.z = -((asset.rotation ?? 0) * Math.PI) / 180;
  return group;
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

  const rebuild = () => {
    if (!scene || !root) return;
    root.clear();
    const toLngLatLocal = getToLngLat();
    for (const asset of getAssets()) {
      const lngLat = toLngLatLocal(asset.x, asset.y);
      const coord = maplibregl.MercatorCoordinate.fromLngLat({ lng: lngLat[0], lat: lngLat[1] }, 0);
      const scale = coord.meterInMercatorCoordinateUnits();
      const object = createAssetObject(asset);
      object.position.set(coord.x, coord.y, coord.z);
      object.scale.set(scale, scale, scale);
      root.add(object);
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
      const modelViewProjectionMatrix = options.modelViewProjectionMatrix;
      if (!modelViewProjectionMatrix) return;
      camera.projectionMatrix = new THREE.Matrix4().fromArray(modelViewProjectionMatrix);
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
  destLngLatRef.current = routeSteps.length >= 2
    ? toLngLat(routeSteps[routeSteps.length - 1].x, routeSteps[routeSteps.length - 1].y)
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

  const assetFallbackFC = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: assets.map((asset) => {
      const ring = assetFootprint(asset).map((p) => toLngLat(p.x, p.y));
      if (ring.length > 0) ring.push(ring[0]);
      return {
        type: "Feature" as const,
        id: asset.id,
        properties: {
          id: asset.id,
          color: asset.color || "#64748b",
        },
        geometry: { type: "Polygon" as const, coordinates: [ring] },
      };
    }),
  }), [assets, toLngLat]);

  const routeFC = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: routeSteps.length >= 2 ? [{
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "LineString" as const,
        coordinates: routeSteps.map((s) => toLngLat(s.x, s.y)),
      },
    }] : [],
  }), [routeSteps, toLngLat]);

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
    ["==", ["get", "id"], selectedId ?? "__none__"], 3.2,
    ["boolean", ["feature-state", "hover"], false], 2.4,
    0,
  ] as any), [destinationId, selectedId]);

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

      // Corridor wayfinding network (always visible) — light path + arrows
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

      map.addSource("asset-fallback", { type: "geojson", data: assetFallbackFC, promoteId: "id" });
      map.addLayer({
        id: "asset-fallback-fill", type: "fill", source: "asset-fallback",
        paint: {
          "fill-color": ["coalesce", ["get", "color"], "#64748b"],
          "fill-opacity": ["interpolate", ["linear"], ["zoom"], 16, 0.18, 19, 0.38],
        },
      });
      map.addLayer({
        id: "asset-fallback-outline", type: "line", source: "asset-fallback",
        paint: {
          "line-color": "#ffffff",
          "line-width": ["interpolate", ["linear"], ["zoom"], 16, 0.4, 20, 1.6],
          "line-opacity": 0.65,
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
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    (map.getSource("asset-fallback") as maplibregl.GeoJSONSource | undefined)?.setData(assetFallbackFC as any);
  }, [assetFallbackFC, ready]);

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
    const centroid = (s: StoreData) => ({
      x: s.polygon.reduce((a, p) => a + p.x, 0) / s.polygon.length,
      y: s.polygon.reduce((a, p) => a + p.y, 0) / s.polygon.length,
    });
    const addMarker = (lngLat: [number, number], el: HTMLElement) => {
      labelMarkersRef.current.push(new maplibregl.Marker({ element: el }).setLngLat(lngLat).addTo(map));
    };

    // 1) ZONE PILLS — one big colored pill at the centroid of each zone group
    const zoneGroups = new Map<string, { en: string; ar: string; color: string; xs: number[]; ys: number[] }>();
    for (const s of real) {
      if (!s.zone) continue;
      const g = zoneGroups.get(s.zone) ?? { en: s.zone, ar: s.zoneAr || s.zone, color: s.color, xs: [], ys: [] };
      const c = centroid(s);
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
      const c = centroid(s);
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
    if (origin) b.extend(toLngLat(origin.x, origin.y));
    return b;
  }, [routeSteps, origin, toLngLat]);

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
