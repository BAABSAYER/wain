"use client";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { api } from "@/lib/api";
import SearchBar from "@/components/nav/SearchBar";
import DirectionsCard from "@/components/nav/DirectionsCard";
import PlaceDetailSheet from "@/components/nav/PlaceDetailSheet";
import LocaleToggle from "@/components/nav/LocaleToggle";
import Compass from "@/components/nav/Compass";
import MapLegend, { type AmenityKey } from "@/components/nav/MapLegend";
import PlacesPanel from "@/components/nav/PlacesPanel";
import HelpPanel from "@/components/nav/HelpPanel";
import SceneErrorBoundary from "@/components/scene/SceneErrorBoundary";
import { useLocale } from "@/lib/i18n";
import type { SceneProjectionInfo } from "@/components/scene/BuildingMap";
import type { BuildingMapHandle } from "@/components/scene/BuildingMap";

// ── Active engine: MapLibre (LEAP-style). The old Three.js BuildingScene is kept
//    in the repo but inactive — swap the import below to revert.
const BuildingScene = dynamic(() => import("@/components/scene/BuildingMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-dvh flex flex-col items-center justify-center gap-4 bg-slate-50">
      <div className="w-14 h-14 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-slate-700 text-base font-medium">Loading map…</p>
    </div>
  ),
});
// Dormant Three.js engine (uncomment to switch back):
// const BuildingScene = dynamic(() => import("@/components/scene/BuildingScene"), { ssr: false, loading: ... });

// ─── Types ───────────────────────────────────────────────────────────────────

interface BuildingData {
  id: string; name: string; nameAr: string; northOffset?: number; floors: FloorData[];
}
interface FloorData {
  id: string; name: string; nameAr?: string; level: number;
  width: number; height: number;
  stores: StoreData[]; navNodes: NavNodeData[];
}
interface StoreData {
  id: string; name: string; nameAr: string;
  polygon: Array<{ x: number; y: number }>;
  extrudeHeight: number; color: string; category: string;
}
interface NavNodeData { id: string; x: number; y: number; z: number; floorId: string; }
interface RouteResult {
  steps: Array<{ nodeId: string; floorId: string; x: number; y: number; z: number }>;
  totalDistance: number;
  estimatedMinutes: number;
  destination: { id: string; name: string; nameAr: string };
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function NavPage() {
  const { buildingId, floorId, nodeId } = useParams<{
    buildingId: string; floorId: string; nodeId: string;
  }>();

  const { t, locale } = useLocale();
  const sceneRef = useRef<BuildingMapHandle>(null);
  const [building, setBuilding] = useState<BuildingData | null>(null);
  const [currentFloor, setCurrentFloor] = useState<FloorData | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [destinationName, setDestinationName] = useState<string | null>(null);
  const [destinationNameAr, setDestinationNameAr] = useState<string | null>(null);
  const [selectedStore, setSelectedStore] = useState<StoreData | null>(null);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"map" | "list" | "help">("map");
  const [projection, setProjection] = useState<SceneProjectionInfo>({ azimuth: 0, destScreen: null });
  const [graph, setGraph] = useState<any[]>([]);
  const [accessible, setAccessible] = useState(false);
  const [lastDest, setLastDest] = useState<{ id: string; name: string; nameAr: string } | null>(null);

  useEffect(() => {
    api.getBuilding(buildingId)
      .then((b: BuildingData) => {
        setBuilding(b);
        const floor = b.floors.find((f) => f.id === floorId) ?? b.floors[0];
        setCurrentFloor(floor ?? null);
        api.track({ buildingId, floorId, qrCode: nodeId, eventType: "qr_scan" }).catch(() => {});
      })
      .catch(() => setError("Building not found. Please scan the QR code again."))
      .finally(() => setLoading(false));
    // Nav graph (nodes + edgesFrom) for the always-on corridor arrows
    api.getGraph(buildingId).then(setGraph).catch(() => setGraph([]));
  }, [buildingId, floorId, nodeId]);

  // "You are here" coords
  const originNode = useMemo(() => {
    if (!building) return null;
    for (const f of building.floors) {
      const n = f.navNodes.find((n) => n.id === nodeId);
      if (n) return n;
    }
    return null;
  }, [building, nodeId]);

  const originLabel = t("youAreHere");

  // "You are here" pin is always the scan node (no step-by-step simulation).
  const currentPosition = useMemo(() => {
    if (originNode) return { x: originNode.x, y: originNode.y, floorId: originNode.floorId };
    return null;
  }, [originNode]);

  // Stable {x,y} for the map's origin/focus props. MUST be memoized — passing a
  // fresh object literal each render makes BuildingMap's effects re-fire every
  // render → easeTo → moveend → setState → infinite loop.
  const mapPoint = useMemo(() => {
    if (currentPosition && currentFloor && currentPosition.floorId === currentFloor.id) {
      return { x: currentPosition.x, y: currentPosition.y };
    }
    return null;
  }, [currentPosition, currentFloor]);

  // One-shot azimuth: orient the camera so the route reads "up" when a destination is picked.
  const initialAzimuth = useMemo<number | null>(() => {
    if (!route || !originNode) return null;
    const last = route.steps[route.steps.length - 1];
    if (!last) return null;
    const dx = last.x - originNode.x;
    const dy = last.y - originNode.y;
    if (dx === 0 && dy === 0) return null;
    return Math.atan2(dx, -dy);

  }, [route?.destination?.id, originNode?.id]);

  // Heading on the you-are-here pin → points toward the first waypoint of the route.
  const heading = useMemo<number | null>(() => {
    if (!route || !originNode || route.steps.length < 2) return null;
    const next = route.steps[1];
    const dx = next.x - originNode.x;
    const dy = next.y - originNode.y;
    if (dx === 0 && dy === 0) return null;
    return Math.atan2(dx, -dy);
  }, [route, originNode]);

  const routeForCurrentFloor = useMemo(() => {
    if (!route || !currentFloor) return [];
    return route.steps.filter((s) => s.floorId === currentFloor.id);
  }, [route, currentFloor]);

  // Ordered list of floors the route passes through (for cross-floor hand-off).
  const routeFloorIds = useMemo(() => {
    if (!route) return [] as string[];
    const seq: string[] = [];
    for (const s of route.steps) if (seq[seq.length - 1] !== s.floorId) seq.push(s.floorId);
    return seq;
  }, [route]);

  // If the route continues onto another floor, describe the hand-off.
  const floorHandoff = useMemo(() => {
    if (!route || !currentFloor || routeFloorIds.length < 2) return null;
    const idx = routeFloorIds.indexOf(currentFloor.id);
    if (idx < 0) return null;
    const nextId = routeFloorIds[idx + 1];
    const prevId = idx > 0 ? routeFloorIds[idx - 1] : null;
    const nextFloor = nextId ? building?.floors.find((f) => f.id === nextId) ?? null : null;
    const prevFloor = prevId ? building?.floors.find((f) => f.id === prevId) ?? null : null;
    // transition node = last route step on this floor → its type (elevator/stairs)
    const onFloor = route.steps.filter((s) => s.floorId === currentFloor.id);
    const transNodeId = onFloor[onFloor.length - 1]?.nodeId;
    const transType = graph.find((n) => n.id === transNodeId)?.type ?? "elevator";
    return { nextFloor, prevFloor, transType };
  }, [route, currentFloor, routeFloorIds, building, graph]);

  // Category filter HIGHLIGHTS (never hides): all units stay on the map; the
  // chosen category is tinted via `highlightCategory` below.
  const allStores = currentFloor?.stores ?? [];
  const highlightCategory = filter === "all" ? null : filter;

  // Corridor segments (nav-graph edges) for the always-on wayfinding arrows.
  // Built from the /nav/graph endpoint (which includes edgesFrom), filtered to
  // the current floor.
  const navLines = useMemo(() => {
    if (!currentFloor || graph.length === 0) return [];
    const nodeMap = new Map(graph.map((n: any) => [n.id, n] as const));
    const floorNodes = graph.filter((n: any) => n.floorId === currentFloor.id);
    return floorNodes.flatMap((n: any) =>
      (n.edgesFrom ?? []).map((e: any) => {
        const a = nodeMap.get(e.fromNodeId);
        const b = nodeMap.get(e.toNodeId);
        if (!a || !b || a.floorId !== currentFloor.id || b.floorId !== currentFloor.id) return null;
        return { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } };
      }),
    ).filter(Boolean) as Array<{ a: { x: number; y: number }; b: { x: number; y: number } }>;
  }, [currentFloor, graph]);

  const computeRoute = useCallback(async (storeId: string, name: string, nameAr: string, useAccessible = accessible) => {
    setRouteError(null);
    setDestinationName(name);
    setDestinationNameAr(nameAr);
    setLastDest({ id: storeId, name, nameAr });
    try {
      const result = await api.getRoute(nodeId, storeId, useAccessible);
      setRoute(result);
      api.track({ buildingId, floorId, eventType: "route_requested", destinationId: storeId }).catch(() => {});
    } catch (err: any) {
      setRouteError(err?.message ?? "Could not calculate route.");
      setDestinationName(null);
      setDestinationNameAr(null);
    }
  }, [nodeId, buildingId, floorId, accessible]);

  // Toggle accessible routing; recompute the active route if one is shown.
  const toggleAccessible = useCallback(() => {
    setAccessible((prev) => {
      const next = !prev;
      if (lastDest) computeRoute(lastDest.id, lastDest.name, lastDest.nameAr, next);
      return next;
    });
  }, [lastDest, computeRoute]);

  const handleSearchSelect = (id: string, name: string, nameAr: string) => {
    const store = currentFloor?.stores.find((s) => s.id === id);
    if (store) setSelectedStore(store);
    else computeRoute(id, name, nameAr);
  };

  const handleBlockClick = (storeId: string) => {
    if (route) return; // ignore clicks while a route is shown
    const store = currentFloor?.stores.find((s) => s.id === storeId);
    if (store) setSelectedStore(store);
  };

  const handleDirectionsFromDetail = () => {
    if (!selectedStore) return;
    computeRoute(selectedStore.id, selectedStore.name, selectedStore.nameAr);
    setSelectedStore(null);
  };

  // Picked a place from the Places directory → switch to its floor + open detail
  const handlePlaceFromList = (floorId: string, store: { id: string }) => {
    const floor = building?.floors.find((f) => f.id === floorId);
    const full = floor?.stores.find((s) => s.id === store.id) ?? null;
    if (floor && floor.id !== currentFloor?.id) setCurrentFloor(floor);
    setSelectedStore(full);
    setActiveTab("map");
  };

  // Legend shortcut → find the nearest amenity of a kind and route to it.
  const findNearestAmenity = useCallback((key: AmenityKey) => {
    if (!building || !originNode) return;
    const matches = (s: StoreData & { floorId?: string }) => {
      const txt = `${s.name} ${s.nameAr}`.toLowerCase();
      switch (key) {
        case "restroom": return s.category === "restroom";
        case "elevator": return s.category === "elevator";
        case "stairs":   return s.category === "stairs" || s.category === "escalator";
        case "entrance": return s.category === "entrance";
        case "prayer":   return s.category === "services" && /prayer|مصل/.test(txt);
        case "info":     return s.category === "services" && /info|reception|استقبال|معلومات|نurse|تمريض/.test(txt);
        default: return false;
      }
    };
    const candidates = building.floors.flatMap((f) =>
      f.stores.filter((s: any) => matches(s) && s.navNodeId).map((s: any) => ({ ...s, floorId: f.id })),
    );
    if (candidates.length === 0) {
      const labels: Record<AmenityKey, string> = {
        restroom: locale === "ar" ? "دورة مياه" : "restroom", elevator: locale === "ar" ? "مصعد" : "elevator",
        stairs: locale === "ar" ? "سلم" : "stairs", prayer: locale === "ar" ? "مصلى" : "prayer room",
        info: locale === "ar" ? "مكتب استقبال" : "info desk", entrance: locale === "ar" ? "مدخل" : "entrance",
      };
      setRouteError(locale === "ar" ? `لا يوجد ${labels[key]} في هذا المبنى` : `No ${labels[key]} found in this building`);
      return;
    }
    // Nearest by straight-line from origin, strongly preferring the same floor.
    const score = (s: any) => {
      const cx = s.polygon.reduce((a: number, p: any) => a + p.x, 0) / s.polygon.length;
      const cy = s.polygon.reduce((a: number, p: any) => a + p.y, 0) / s.polygon.length;
      const samePenalty = s.floorId === originNode.floorId ? 0 : 1e6;
      return samePenalty + Math.hypot(cx - originNode.x, cy - originNode.y);
    };
    const nearest = candidates.reduce((a, b) => (score(b) < score(a) ? b : a));
    computeRoute(nearest.id, nearest.name, nearest.nameAr);
    setActiveTab("map");
  }, [building, originNode, locale, computeRoute]);

  const clearRoute = () => {
    setRoute(null);
    setDestinationName(null);
    setDestinationNameAr(null);
    setLastDest(null);
  };

  if (loading) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center gap-4 bg-slate-50">
        <div className="w-14 h-14 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-700 text-base">{t("loading")}</p>
      </div>
    );
  }

  if (error || !building || !currentFloor) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center gap-4 p-8 text-center bg-slate-50">
        <p className="text-6xl">⚠</p>
        <p className="text-slate-900 font-semibold text-xl">{error ?? t("errMapNotFound")}</p>
        <p className="text-slate-600 text-base">{t("errScanAgain")}</p>
        <div className="mt-2"><LocaleToggle /></div>
      </div>
    );
  }

  // Validate that the scan node from the URL actually exists for this building
  if (building && !originNode) {
    const bName = locale === "ar" ? building.nameAr : building.name;
    return (
      <div className="h-dvh flex flex-col items-center justify-center gap-4 p-8 text-center bg-slate-50">
        <p className="text-6xl">⚠</p>
        <p className="text-slate-900 font-semibold text-xl">{t("errInvalidScan")}</p>
        <p className="text-slate-600 text-base">
          {t("errInvalidScanDesc")} (<b>{bName}</b>)
        </p>
        <p className="text-slate-500 text-sm font-mono break-all max-w-md">
          nodeId: {nodeId}
        </p>
        <p className="text-slate-500 text-sm mt-2">{t("errScanAgain")}</p>
        <div className="mt-3"><LocaleToggle /></div>
      </div>
    );
  }

  const hasRoute = !!route && !!destinationName;

  return (
    <div className="h-dvh flex flex-col overflow-hidden relative bg-slate-50">
      {/* ─── Top Overlay ─────────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-20 pt-3 px-3">
        {hasRoute ? (
          <DirectionsCard
            originName={originLabel}
            destinationName={destinationName!}
            destinationNameAr={destinationNameAr ?? undefined}
            estimatedMinutes={route?.estimatedMinutes ?? null}
            totalSteps={route?.steps.length ?? null}
            onEnd={clearRoute}
          />
        ) : (
          <SearchBar
            buildingId={buildingId}
            onSelect={handleSearchSelect}
            activeFilter={filter}
            onFilterChange={setFilter}
          />
        )}
      </div>

      {/* ─── Route error banner ─────────────────────────────── */}
      {routeError && (
        <div className="absolute top-3 left-3 right-3 z-30 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 shadow-lg flex items-start gap-3">
          <span className="text-red-500 text-xl flex-shrink-0">⚠</span>
          <div className="flex-1 min-w-0">
            <p className="text-red-900 font-semibold text-sm">{t("errCouldNotGetDir")}</p>
            <p className="text-red-700 text-xs mt-0.5 break-words">{routeError}</p>
          </div>
          <button
            onClick={() => setRouteError(null)}
            aria-label={t("close")}
            className="text-red-400 hover:text-red-700 text-xl leading-none flex-shrink-0"
          >×</button>
        </div>
      )}

      {/* ─── Back button (top-left, floating outside other cards) ── */}
      {hasRoute && (
        <button
          onClick={clearRoute}
          aria-label={t("back")}
          className="absolute top-3 left-3 rtl:left-auto rtl:right-3 z-30 w-11 h-11 bg-white border border-slate-200 rounded-full shadow-lg flex items-center justify-center text-slate-700 hover:bg-slate-50 text-xl"
        >
          {locale === "ar" ? "→" : "←"}
        </button>
      )}

      {/* ─── Language toggle (top-right, always visible) ─────── */}
      {!hasRoute && (
        <div className="absolute top-3 right-3 rtl:right-auto rtl:left-3 z-30">
          <LocaleToggle />
        </div>
      )}

      {/* ─── Floor switcher (top-right corner, below the cards) ─── */}
      {building.floors.length > 1 && (
        <div className="absolute top-44 right-3 rtl:right-auto rtl:left-3 z-10 flex flex-col bg-white border border-slate-200 rounded-2xl shadow-md overflow-hidden">
          {building.floors
            .slice()
            .sort((a, b) => b.level - a.level)
            .map((f) => (
              <button
                key={f.id}
                onClick={() => setCurrentFloor(f)}
                className={`w-11 h-11 flex items-center justify-center text-sm font-bold transition-colors ${
                  f.id === currentFloor.id
                    ? "bg-blue-500 text-white"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
                aria-label={`${t("floor")} ${f.level === 0 ? t("groundFloor") : f.level}`}
              >
                {f.level === 0 ? (locale === "ar" ? "أ" : "G") : f.level}
              </button>
            ))}
        </div>
      )}

      {/* ─── 3D Scene ────────────────────────────────────────── */}
      <div className="flex-1 relative">
        <SceneErrorBoundary>
          <BuildingScene
            ref={sceneRef}
            stores={allStores}
            routeSteps={routeForCurrentFloor}
            destinationId={route?.destination?.id ?? null}
            selectedId={selectedStore?.id ?? null}
            highlightCategory={highlightCategory}
            floorWidth={currentFloor.width}
            floorHeight={currentFloor.height}
            origin={mapPoint}
            focus={mapPoint}
            heading={heading}
            initialAzimuth={initialAzimuth}
            locale={locale}
            navEdges={navLines}
            onProjection={setProjection}
            onBlockClick={handleBlockClick}
          />
        </SceneErrorBoundary>

        {/* Right-side floating controls */}
        <div className="absolute right-3 rtl:right-auto rtl:left-3 bottom-28 z-10 flex flex-col gap-2 items-end rtl:items-start">
          <Compass azimuth={projection.azimuth} northOffset={building.northOffset ?? 0} />
          <MapLegend onFindNearest={findNearestAmenity} />
          <button
            onClick={toggleAccessible}
            aria-label={locale === "ar" ? "مسار يناسب الكراسي المتحركة" : "Accessible route"}
            title={locale === "ar" ? "مسار يناسب الكراسي المتحركة" : "Accessible (step-free) route"}
            className={`w-12 h-12 rounded-full shadow-md border flex items-center justify-center text-xl transition-colors ${
              accessible
                ? "bg-blue-500 border-blue-500 text-white"
                : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"
            }`}
          >
            ♿
          </button>
          <button
            onClick={() => sceneRef.current?.recenter()}
            aria-label={t("youAreHere")}
            className="w-12 h-12 bg-white border border-slate-200 rounded-full shadow-md hover:bg-slate-50 active:bg-slate-100 flex items-center justify-center text-xl text-slate-700"
          >
            ⌖
          </button>

          {/* Zoom in / out pill */}
          <div className="flex flex-col bg-white border border-slate-200 rounded-2xl shadow-md overflow-hidden">
            <button
              onClick={() => sceneRef.current?.zoomIn()}
              aria-label={locale === "ar" ? "تكبير" : "Zoom in"}
              className="w-12 h-12 flex items-center justify-center text-2xl text-blue-500 hover:bg-blue-50 active:bg-blue-100"
            >
              +
            </button>
            <div className="h-px bg-slate-200" />
            <button
              onClick={() => sceneRef.current?.zoomOut()}
              aria-label={locale === "ar" ? "تصغير" : "Zoom out"}
              className="w-12 h-12 flex items-center justify-center text-2xl text-blue-500 hover:bg-blue-50 active:bg-blue-100"
            >
              −
            </button>
          </div>
        </div>

        {/* Branding pill */}
        <div className="absolute right-3 rtl:right-auto rtl:left-3 bottom-20 z-10 pointer-events-none">
          <div className="bg-slate-900/90 text-white text-xs px-3 py-1.5 rounded-full shadow-md">
            وين <span className="text-slate-400 mx-1">·</span> {locale === "ar" ? "تنقّل داخلي" : "indoor nav"}
          </div>
        </div>

        {/* Places directory tab */}
        {activeTab === "list" && (
          <PlacesPanel floors={building.floors} onSelect={handlePlaceFromList} />
        )}

        {/* Help tab */}
        {activeTab === "help" && <HelpPanel />}
      </div>

      {/* ─── Place Detail Sheet (when block clicked) ─────────── */}
      {selectedStore && !hasRoute && (
        <PlaceDetailSheet
          name={selectedStore.name}
          nameAr={selectedStore.nameAr}
          category={selectedStore.category}
          floorName={currentFloor.name}
          floorNameAr={currentFloor.nameAr}
          onDirections={handleDirectionsFromDetail}
          onClose={() => setSelectedStore(null)}
        />
      )}

      {/* ─── Cross-floor hand-off banner ─────────────────────── */}
      {hasRoute && floorHandoff && (floorHandoff.nextFloor || floorHandoff.prevFloor) && (
        <div className="absolute bottom-20 left-3 right-3 z-20">
          <div className="max-w-md mx-auto bg-blue-600 text-white rounded-2xl shadow-xl px-4 py-3 flex items-center gap-3">
            <span className="text-2xl flex-shrink-0">
              {floorHandoff.transType === "stairs" ? "🪜" : floorHandoff.transType === "escalator" ? "⇅" : "🛗"}
            </span>
            <div className="flex-1 min-w-0 text-sm">
              {floorHandoff.nextFloor ? (
                <>
                  <p className="font-semibold leading-tight">
                    {locale === "ar"
                      ? `استخدم ${floorHandoff.transType === "stairs" ? "السلم" : "المصعد"} إلى ${floorHandoff.nextFloor.nameAr || floorHandoff.nextFloor.name}`
                      : `Take the ${floorHandoff.transType === "stairs" ? "stairs" : floorHandoff.transType === "escalator" ? "escalator" : "elevator"} to ${floorHandoff.nextFloor.name}`}
                  </p>
                  <p className="text-blue-100 text-xs leading-tight">
                    {locale === "ar" ? "ثم تابع المسار" : "Then continue the route"}
                  </p>
                </>
              ) : (
                <p className="font-semibold leading-tight">
                  {locale === "ar" ? "تابع إلى الطابق السابق" : "Continue from the previous floor"}
                </p>
              )}
            </div>
            {floorHandoff.nextFloor && (
              <button
                onClick={() => setCurrentFloor(floorHandoff.nextFloor as any)}
                className="flex-shrink-0 bg-white text-blue-700 font-bold text-sm px-3 py-2 rounded-xl hover:bg-blue-50"
              >
                {locale === "ar" ? "انتقل ←" : "Go →"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ─── Bottom Tab Bar ──────────────────────────────────── */}
      <nav className="bg-white border-t border-slate-200 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] safe-area-inset-bottom">
        <div className="flex">
          {[
            { key: "map" as const,  tkey: "tabMap" as const,    icon: "🗺" },
            { key: "list" as const, tkey: "tabPlaces" as const, icon: "≣" },
            { key: "help" as const, tkey: "tabHelp" as const,   icon: "?" },
          ].map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 ${
                  active ? "text-blue-500" : "text-slate-500"
                }`}
              >
                <div className={`w-10 h-7 rounded-2xl flex items-center justify-center text-lg ${
                  active ? "bg-blue-100" : ""
                }`}>
                  {tab.icon}
                </div>
                <span className={`text-xs font-medium ${active ? "text-blue-600" : ""}`}>{t(tab.tkey)}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
