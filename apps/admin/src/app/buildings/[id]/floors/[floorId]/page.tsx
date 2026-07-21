"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { api } from "@/lib/api";
import { useMapBuilderStore } from "@/store/map-builder";
import { usePublicAppUrl } from "@/lib/public-url";
import PublicUrlSetting from "@/components/PublicUrlSetting";
import PropertiesPanel from "@/components/map-builder/PropertiesPanel";
import Toolbar from "@/components/map-builder/Toolbar";
import CadImportModal from "@/components/map-builder/cad-import/CadImportModal";

const MapCanvas = dynamic(() => import("@/components/map-builder/MapCanvas"), { ssr: false });

interface QRCode {
  id: string; code: string; label: string;
  floorId: string; nodeId: string; qrImageUrl?: string;
}

export default function FloorEditorPage() {
  const { id: buildingId, floorId } = useParams<{ id: string; floorId: string }>();
  const [building, setBuilding] = useState<any>(null);
  const [floor, setFloor] = useState<any>(null);
  const [qrCodes, setQrCodes] = useState<QRCode[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [dimensions, setDimensions] = useState({ w: 800, h: 600 });
  const [cadImportOpen, setCadImportOpen] = useState(false);

  // Modal: QR generation prompt when user clicks a node with the QR tool
  const [qrPrompt, setQrPrompt] = useState<{ nodeId: string; label: string } | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);

  const {
    isDirty, markClean, loadFromApi, stores, assets, nodes, edges, setTool,
    selectedId, selectedKind, extraSelectedIds, setSelected,
    toggleExtraSelection, selectAllStores,
  } = useMapBuilderStore();
  const { url: publicAppUrl } = usePublicAppUrl();

  const selectedRoomIds = selectedKind === "store" && selectedId
    ? new Set([selectedId, ...extraSelectedIds])
    : new Set<string>();
  const toggleRoomSelection = (roomId: string) => {
    if (selectedKind !== "store" || !selectedId) {
      setSelected(roomId, "store");
      return;
    }
    toggleExtraSelection(roomId);
  };

  // Track viewport size for canvas
  useEffect(() => {
    const measure = () => setDimensions({
      w: Math.max(400, window.innerWidth - 224 - 256),
      h: Math.max(400, window.innerHeight - 56),
    });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const refreshQR = useCallback(async () => {
    const list = await api.getQRCodes(buildingId).catch(() => []);
    setQrCodes(list.filter((q: QRCode) => q.floorId === floorId));
  }, [buildingId, floorId]);

  // Pull the floor from the API and push it into the map-builder store.
  // Called on mount AND after each save so client state is rebuilt with the
  // server-assigned ids (otherwise local-only nanoids from drag-edits stick
  // around and successive saves create duplicate rows).
  const reloadFloor = useCallback(async () => {
    const [f, b] = await Promise.all([
      api.getFloor(floorId),
      api.getBuilding(buildingId),
    ]);
    setBuilding(b);
    setFloor(f);
    const canvasStores = (f.stores ?? []).map((s: any) => ({
      id: s.id, polygon: s.polygon, name: s.name, nameAr: s.nameAr,
      category: s.category, color: s.color, extrudeHeight: s.extrudeHeight,
      zone: s.zone ?? "", zoneAr: s.zoneAr ?? "", logoUrl: s.logoUrl ?? "",
      navNodeId: s.navNodeId ?? null,
      // M:N: prefer the navLinks array, fall back to legacy navNodeId
      navLinkNodeIds: Array.isArray(s.navLinks) && s.navLinks.length > 0
        ? s.navLinks.map((l: any) => l.navNodeId)
        : (s.navNodeId ? [s.navNodeId] : []),
    }));
    const canvasNodes = (f.navNodes ?? []).map((n: any) => ({
      id: n.id, x: n.x, y: n.y, type: n.type,
      connectedFloorNodeId: n.connectedFloorNodeId ?? null,
    }));
    const currentNodeIds = new Set(canvasNodes.map((n: any) => n.id));
    const canvasEdges = (f.navNodes ?? []).flatMap((n: any) =>
      (n.edgesFrom ?? [])
        .filter((e: any) => currentNodeIds.has(e.toNodeId))
        .map((e: any) => ({
          id: e.id, fromId: e.fromNodeId, toId: e.toNodeId,
        })),
    );
    const canvasAssets = (f.assets ?? []).map((a: any) => ({
      id: a.id,
      type: a.type,
      label: a.label ?? "",
      x: a.x,
      y: a.y,
      z: a.z ?? 0,
      rotation: a.rotation ?? 0,
      scale: a.scale ?? 1,
      color: a.color ?? null,
      modelUrl: a.modelUrl ?? null,
      navNodeId: a.navNodeId ?? null,
    }));
    loadFromApi(canvasStores, canvasNodes, canvasEdges, canvasAssets);
  }, [buildingId, floorId, loadFromApi]);

  // Load floor + QR codes
  useEffect(() => {
    reloadFloor();
    refreshQR();
  }, [reloadFloor, refreshQR]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      // 1. Save the nav graph FIRST. bulkSaveGraph wipes + recreates every
      //    node (giving each a new DB id), so any subsequent store save
      //    needs the freshly-minted ids — not the stale ones in local state.
      const graphRes = await api.bulkSaveGraph(floorId, { nodes, edges });
      const nodeIdMap = (graphRes?.nodeIdMap ?? {}) as Record<string, string>;

      // 2. Delete any room that existed at load-time but isn't in the
      //    current local state (user removed it in this session). Without
      //    this, deletions silently bounce back on reload — looks like
      //    "save failed" even though the API was happy.
      const currentIds = new Set(stores.map((s) => s.id));
      const stalePersistedIds: string[] = (floor?.stores ?? [])
        .map((s: any) => s.id)
        .filter((id: string) => !currentIds.has(id));
      for (const id of stalePersistedIds) {
        try { await api.deleteStore(id); }
        catch (e) { console.warn(`deleteStore ${id} failed (continuing):`, e); }
      }

      // 3. Save each store. Remap legacy navNodeId AND the M:N navLinkNodeIds
      //    through the id map so links survive a node-rebuild.
      const mapId = (id: string | null | undefined) =>
        id ? (nodeIdMap[id] ?? id) : null;        // identity fall-through for stable ids
      for (const store of stores) {
        const mappedNavNodeId = mapId(store.navNodeId);
        const exists = floor?.stores?.find((s: any) => s.id === store.id);
        const savedStore = exists
          ? await api.updateStore(store.id, {
              name: store.name, nameAr: store.nameAr, category: store.category,
              color: store.color, extrudeHeight: store.extrudeHeight, polygon: store.polygon,
              zone: store.zone || null, zoneAr: store.zoneAr || null, logoUrl: store.logoUrl || null,
              navNodeId: mappedNavNodeId,
            })
          : await api.createStore({ ...store, floorId, isSearchable: true, navNodeId: mappedNavNodeId });

        // M:N nav links — replace the full set per save. Skip the PUT if
        // there's nothing to set AND nothing was previously set (don't
        // burn a call on no-op stores).
        const mappedLinks = (store.navLinkNodeIds ?? [])
          .map((id) => mapId(id))
          .filter((id): id is string => !!id);
        const hadOld = Array.isArray((exists as any)?.navLinks) && (exists as any).navLinks.length > 0;
        if (mappedLinks.length > 0 || hadOld) {
          await api.setStoreNavLinks(savedStore.id ?? store.id, mappedLinks);
        }
      }

      await api.bulkSaveAssets(floorId, assets.map((asset) => ({
        type: asset.type,
        label: asset.label ?? "",
        x: asset.x,
        y: asset.y,
        z: asset.z ?? 0,
        rotation: asset.rotation ?? 0,
        scale: asset.scale ?? 1,
        color: asset.color ?? null,
        modelUrl: asset.modelUrl ?? null,
        navNodeId: mapId(asset.navNodeId),
      })));
      markClean();

      // 4. Pull the saved state back so local store / node ids are the real
      //    server-side ones (otherwise the NEXT save would silently create
      //    duplicates from leftover local nanoids).
      await reloadFloor();
    } catch (err: any) {
      console.error(err);
      alert(`Save failed: ${err?.message ?? "unknown error"}`);
    } finally {
      setIsSaving(false);
    }
  }, [stores, assets, nodes, edges, floor, floorId, markClean, reloadFloor]);

  // Triggered when user uses the QR tool and clicks a nav node on the canvas
  const handleCreateQRFromNode = useCallback((nodeId: string) => {
    const exists = qrCodes.find((q) => q.nodeId === nodeId);
    if (exists) {
      alert(`This node already has a QR code: "${exists.label}". Delete it first if you want to re-create it.`);
      return;
    }
    setQrPrompt({ nodeId, label: "" });
    setQrError(null);
  }, [qrCodes]);

  const submitQRPrompt = useCallback(async () => {
    if (!qrPrompt) return;
    if (!qrPrompt.label.trim()) { setQrError("Label is required"); return; }
    try {
      await api.createQR({
        buildingId, floorId, nodeId: qrPrompt.nodeId,
        label: qrPrompt.label.trim(),
        appBaseUrl: publicAppUrl,
      });
      setQrPrompt(null);
      setQrError(null);
      await refreshQR();
      setTool("select");
    } catch (err: any) {
      setQrError(err?.message ?? "Failed to create QR");
    }
  }, [qrPrompt, buildingId, floorId, refreshQR, setTool, publicAppUrl]);

  const handleDeleteQR = async (qrId: string) => {
    if (!confirm("Delete this QR code?")) return;
    await api.deleteQR(qrId);
    await refreshQR();
  };

  if (!floor) return <div className="p-8 text-slate-400 min-h-screen">Loading floor…</div>;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-slate-50">
      <Toolbar onSave={handleSave} isSaving={isSaving} isDirty={isDirty} buildingHref={`/buildings/${buildingId}`} />

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar: floor info + rooms + QR list */}
        <aside className="w-56 bg-white border-r border-slate-200 flex flex-col overflow-y-auto shrink-0">
          <div className="p-3 border-b border-slate-200">
            <Link href={`/buildings/${buildingId}`} className="text-xs text-slate-400 hover:text-slate-600">
              ← Back to floors
            </Link>
            <div className="font-semibold mt-2 text-sm text-slate-900">{floor.name}</div>
            <div className="text-xs text-slate-500" dir="rtl">{floor.nameAr}</div>
            <div className="text-[11px] text-slate-400 mt-1">{floor.width} × {floor.height}</div>

            {/* Bulk CAD/BIM import */}
            <div className="mt-3">
              <button
                onClick={() => setCadImportOpen(true)}
                className="w-full px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded text-xs font-medium text-blue-700"
                title="Import room polygons from a DXF, SVG, or IFC file"
              >
                📐 Import from CAD / BIM
              </button>
            </div>

            {/* Floor-plan image (traced over in the canvas) */}
            <div className="mt-3">
              <span className="text-[11px] text-slate-500 font-medium">Floor plan image</span>
              <div className="flex items-center gap-2 mt-1">
                <label className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded text-xs font-medium text-slate-700 cursor-pointer">
                  {floor.floorPlanUrl ? "Replace" : "Upload"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const reader = new FileReader();
                      reader.onload = async () => {
                        const url = reader.result as string;
                        await api.updateFloor(floorId, { floorPlanUrl: url });
                        setFloor((prev: any) => ({ ...prev, floorPlanUrl: url }));
                      };
                      reader.readAsDataURL(f);
                    }}
                  />
                </label>
                {floor.floorPlanUrl && (
                  <button
                    onClick={async () => {
                      await api.updateFloor(floorId, { floorPlanUrl: null });
                      setFloor((prev: any) => ({ ...prev, floorPlanUrl: null }));
                    }}
                    className="px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                  >Remove</button>
                )}
              </div>
              {floor.floorPlanUrl && (
                <img src={floor.floorPlanUrl} alt="floor plan" className="mt-2 w-full rounded border border-slate-100 object-contain bg-slate-50" />
              )}
            </div>
          </div>

          {(() => {
            const unlinked = stores.filter((s) => s.category !== "other" && !s.navNodeId);
            if (unlinked.length === 0) return null;
            return (
              <div className="m-3 mb-0 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 leading-snug">
                ⚠ {unlinked.length} room(s) not linked to a nav node — they can&apos;t be routed to. Select a room → Routing → “Link to nearest nav node”.
              </div>
            );
          })()}

          <div className="p-3 border-b border-slate-200">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
                Rooms ({stores.length})
              </div>
              {stores.length > 0 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => selectAllStores(stores.map((store) => store.id))}
                    className="px-1.5 py-0.5 text-[10px] font-medium text-blue-600 hover:bg-blue-50 rounded"
                  >Select all</button>
                  {selectedRoomIds.size > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelected(null)}
                      className="px-1.5 py-0.5 text-[10px] font-medium text-slate-500 hover:bg-slate-100 rounded"
                    >Clear</button>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-1">
              {stores.map((s) => {
                const selected = selectedRoomIds.has(s.id);
                return (
                  <label
                    key={s.id}
                    className={`text-xs py-1.5 px-1.5 flex items-center gap-2 rounded cursor-pointer ${
                      selected ? "bg-blue-50 text-blue-800" : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleRoomSelection(s.id)}
                      className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                    />
                    <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0 border border-slate-200" style={{ backgroundColor: s.color }} />
                    <span className="truncate">{s.name}</span>
                  </label>
                );
              })}
              {stores.length === 0 && (
                <p className="text-xs text-slate-400 italic">None yet</p>
              )}
            </div>
          </div>

          <div className="p-3 border-b border-slate-200">
            <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2">
              Graph
            </div>
            <p className="text-xs text-slate-600">{nodes.length} nodes · {edges.length} edges</p>
          </div>

          <div className="p-3 border-b border-slate-200">
            <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2">
              Assets ({assets.length})
            </div>
            <div className="space-y-1">
              {assets.map((a) => (
                <div key={a.id} className="text-xs text-slate-700 py-1 flex items-center gap-2 truncate">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0 border border-slate-200" style={{ backgroundColor: a.color ?? "#64748b" }} />
                  <span className="truncate">{a.label || a.type}</span>
                </div>
              ))}
              {assets.length === 0 && (
                <p className="text-xs text-slate-400 italic">None yet</p>
              )}
            </div>
          </div>

          <div className="p-3 flex-1">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
                QR Codes ({qrCodes.length})
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mb-2">Use the ▣ QR tool, then click a node.</p>
            <div className="mb-2 text-[10px] text-slate-500 truncate" title={publicAppUrl}>
              Will encode <code className="font-mono text-slate-700">{publicAppUrl}</code>
            </div>
            <div className="space-y-2">
              {qrCodes.map((q) => (
                <div key={q.id} className="border border-slate-200 rounded-lg p-2 bg-white">
                  {q.qrImageUrl && (
                    <img
                      src={q.qrImageUrl}
                      alt={q.label}
                      className="w-full aspect-square rounded bg-slate-50 border border-slate-100 object-contain mb-1.5"
                    />
                  )}
                  <div className="text-xs font-semibold text-slate-800 truncate">{q.label}</div>
                  <div className="text-[10px] text-slate-400 font-mono truncate">{q.code}</div>
                  <div className="flex gap-1 mt-1">
                    {q.qrImageUrl && (
                      <a
                        href={q.qrImageUrl}
                        download={`${q.label}.png`}
                        className="flex-1 px-1.5 py-1 text-[10px] text-center bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 rounded font-medium"
                      >
                        PNG
                      </a>
                    )}
                    <button
                      onClick={() => handleDeleteQR(q.id)}
                      className="px-1.5 py-1 text-[10px] bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded"
                    >×</button>
                  </div>
                </div>
              ))}
              {qrCodes.length === 0 && (
                <p className="text-xs text-slate-400 italic">No QR codes on this floor</p>
              )}
            </div>
          </div>
        </aside>

        {/* Center: canvas */}
        <MapCanvas
          floorPlanUrl={floor.floorPlanUrl ?? undefined}
          floorWidth={floor.width}
          floorHeight={floor.height}
          canvasWidth={dimensions.w}
          canvasHeight={dimensions.h}
          onCreateQR={handleCreateQRFromNode}
        />

        {/* Right: properties */}
        <aside className="w-64 bg-white border-l border-slate-200 overflow-y-auto shrink-0">
          <div className="p-3 border-b border-slate-200 text-xs text-slate-500 font-semibold uppercase tracking-wider">
            Properties
          </div>
          <PropertiesPanel floors={building?.floors ?? []} currentFloorId={floorId} />
        </aside>
      </div>

      {/* QR creation modal */}
      {qrPrompt && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setQrPrompt(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-slate-900 text-lg">New QR Scan Point</h3>
            <p className="text-sm text-slate-500 mt-1">Label for the QR placed at node <span className="font-mono text-xs">{qrPrompt.nodeId.slice(0, 8)}…</span></p>
            <input
              autoFocus
              className="mt-4 w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              placeholder="e.g. Main Entrance"
              value={qrPrompt.label}
              onChange={(e) => setQrPrompt({ ...qrPrompt, label: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") submitQRPrompt(); if (e.key === "Escape") setQrPrompt(null); }}
            />
            {qrError && <p className="text-red-600 text-sm mt-2">{qrError}</p>}
            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => setQrPrompt(null)} className="px-4 py-2 text-slate-500 hover:text-slate-700 text-sm font-medium">Cancel</button>
              <button onClick={submitQRPrompt} className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-semibold shadow-sm">Generate</button>
            </div>
          </div>
        </div>
      )}

      {cadImportOpen && (
        <CadImportModal
          floorWidth={floor.width}
          floorHeight={floor.height}
          onClose={() => setCadImportOpen(false)}
        />
      )}
    </div>
  );
}
