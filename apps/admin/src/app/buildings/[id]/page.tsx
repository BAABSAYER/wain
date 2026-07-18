"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { usePublicAppUrl } from "@/lib/public-url";
import PublicUrlSetting from "@/components/PublicUrlSetting";
import AnalyticsDashboard from "@/components/AnalyticsDashboard";
import NorthSetting from "@/components/NorthSetting";

interface QRCode {
  id: string;
  code: string;
  label: string;
  floorId: string;
  // Null when the QR is unassigned (e.g. after its node was deleted).
  nodeId: string | null;
  qrImageUrl?: string;
}

type FloorForm = {
  name: string;
  nameAr: string;
  level: number;
  width: number;
  height: number;
  floorPlanUrl: string;
};

const emptyFloorForm: FloorForm = {
  name: "",
  nameAr: "",
  level: 0,
  width: 2000,
  height: 1400,
  floorPlanUrl: "",
};

export default function BuildingPage() {
  const { id } = useParams<{ id: string }>();
  const [building, setBuilding] = useState<any>(null);
  const [qrCodes, setQrCodes] = useState<QRCode[]>([]);
  const [showFloorForm, setShowFloorForm] = useState(false);
  const [showQrForm, setShowQrForm] = useState(false);
  const [floorForm, setFloorForm] = useState<FloorForm>(emptyFloorForm);
  const [editingFloorId, setEditingFloorId] = useState<string | null>(null);
  const [editFloorForm, setEditFloorForm] = useState<FloorForm>(emptyFloorForm);
  const [qrForm, setQrForm] = useState({ floorId: "", nodeId: "", label: "" });
  const [qrError, setQrError] = useState<string | null>(null);
  const { url: publicAppUrl } = usePublicAppUrl();

  const refresh = useCallback(async () => {
    const [b, qrs] = await Promise.all([
      api.getBuilding(id),
      api.getQRCodes(id).catch(() => []),
    ]);
    setBuilding(b);
    setQrCodes(qrs);
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleCreateFloor = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.createFloor({
      buildingId: id,
      ...floorForm,
      floorPlanUrl: floorForm.floorPlanUrl.trim() || undefined,
    });
    setShowFloorForm(false);
    setFloorForm(emptyFloorForm);
    await refresh();
  };

  const openEditFloor = (f: any) => {
    setShowFloorForm(false);
    setEditingFloorId(f.id);
    setEditFloorForm({
      name: f.name ?? "",
      nameAr: f.nameAr ?? "",
      level: Number(f.level ?? 0),
      width: Number(f.width ?? 2000),
      height: Number(f.height ?? 1400),
      floorPlanUrl: f.floorPlanUrl ?? "",
    });
  };

  const closeEditFloor = () => {
    setEditingFloorId(null);
    setEditFloorForm(emptyFloorForm);
  };

  const handleUpdateFloor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFloorId) return;
    await api.updateFloor(editingFloorId, {
      name: editFloorForm.name.trim(),
      nameAr: editFloorForm.nameAr.trim(),
      level: editFloorForm.level,
      width: editFloorForm.width,
      height: editFloorForm.height,
      floorPlanUrl: editFloorForm.floorPlanUrl.trim() || null,
    });
    closeEditFloor();
    await refresh();
  };

  const handleDeleteFloor = async (f: any) => {
    const stores = f.stores?.length ?? 0;
    const nodes  = f.navNodes?.length ?? 0;
    const msg = `Delete floor "${f.name}"?\n\n${stores} store(s) and ${nodes} nav node(s) on this floor will be removed permanently. This cannot be undone.`;
    if (!window.confirm(msg)) return;
    try {
      await api.deleteFloor(f.id);
      await refresh();
    } catch (err: any) {
      alert(`Delete failed: ${err?.message ?? "unknown error"}`);
    }
  };

  const handleCreateQR = async (e: React.FormEvent) => {
    e.preventDefault();
    setQrError(null);
    try {
      await api.createQR({
        buildingId: id,
        floorId: qrForm.floorId,
        nodeId: qrForm.nodeId,
        label: qrForm.label,
        appBaseUrl: publicAppUrl,
      });
      setShowQrForm(false);
      setQrForm({ floorId: "", nodeId: "", label: "" });
      await refresh();
    } catch (err: any) {
      setQrError(err?.message ?? "Failed to create QR code");
    }
  };

  // ── Reassign QR modal state ──────────────────────────────────────────
  const [reassignQr, setReassignQr] = useState<QRCode | null>(null);
  const [reassignNodeId, setReassignNodeId] = useState<string>("");
  const [reassignBusy, setReassignBusy] = useState(false);

  const openReassign = (qr: QRCode) => {
    setReassignQr(qr);
    setReassignNodeId(qr.nodeId ?? "");
  };
  const closeReassign = () => { setReassignQr(null); setReassignBusy(false); };

  const handleReassign = async () => {
    if (!reassignQr) return;
    setReassignBusy(true);
    try {
      // Find the floor for the chosen node so QRPoint.floorId stays consistent.
      let floorId = reassignQr.floorId;
      if (reassignNodeId) {
        for (const f of (building?.floors ?? [])) {
          if ((f.navNodes ?? []).some((n: any) => n.id === reassignNodeId)) { floorId = f.id; break; }
        }
      }
      const updated = await api.reassignQR(reassignQr.id, {
        nodeId: reassignNodeId || null,
        floorId,
      });
      setQrCodes((prev) => prev.map((q) => (q.id === reassignQr.id ? { ...q, ...updated } : q)));
      closeReassign();
    } catch (err: any) {
      alert(`Reassign failed: ${err?.message ?? "unknown error"}`);
      setReassignBusy(false);
    }
  };

  const handleDeleteQR = async (qrId: string) => {
    if (!confirm("Delete this QR code?")) return;
    await api.deleteQR(qrId);
    await refresh();
  };

  if (!building) return <div className="p-8 text-slate-400 min-h-screen">Loading…</div>;

  const allNodes = (building.floors ?? []).flatMap((f: any) =>
    (f.navNodes ?? []).map((n: any) => ({ ...n, floorName: f.name })),
  );
  const nodesForSelectedFloor = qrForm.floorId
    ? allNodes.filter((n: any) => n.floorId === qrForm.floorId)
    : [];

  return (
    <main className="max-w-5xl mx-auto p-8 min-h-screen">
      <div className="mb-2">
        <Link href="/buildings" className="text-slate-400 hover:text-slate-600 text-sm">← Buildings</Link>
      </div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{building.name}</h1>
          <p className="text-slate-500 text-lg" dir="rtl">{building.nameAr}</p>
          {building.address && <p className="text-slate-400 text-sm mt-1">{building.address}</p>}
        </div>
      </div>

      <div className="mb-8 space-y-3">
        <PublicUrlSetting />
        <NorthSetting buildingId={id} initial={building.northOffset ?? 0} />
      </div>

      {/* ───────── Floors section ───────── */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-slate-900">Floors <span className="text-slate-400 text-sm font-normal">({building.floors?.length ?? 0})</span></h2>
          <button
            onClick={() => setShowFloorForm(!showFloorForm)}
            className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium shadow-sm"
          >
            + Add Floor
          </button>
        </div>

        {showFloorForm && (
          <form onSubmit={handleCreateFloor} className="bg-white border border-slate-200 rounded-xl p-5 mb-4 flex flex-col gap-3 shadow-sm">
            <h3 className="font-semibold text-slate-900">New Floor</h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 font-medium">Name (EN)</span>
                <input required className="bg-white border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" value={floorForm.name} onChange={(e) => setFloorForm({ ...floorForm, name: e.target.value })} placeholder="Ground Floor" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 font-medium">Name (AR)</span>
                <input dir="rtl" required className="bg-white border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" value={floorForm.nameAr} onChange={(e) => setFloorForm({ ...floorForm, nameAr: e.target.value })} placeholder="الطابق الأرضي" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 font-medium">Level</span>
                <input type="number" required className="bg-white border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" value={floorForm.level} onChange={(e) => setFloorForm({ ...floorForm, level: Number(e.target.value) })} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 font-medium">Width</span>
                <input type="number" required className="bg-white border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" value={floorForm.width} onChange={(e) => setFloorForm({ ...floorForm, width: Number(e.target.value) })} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 font-medium">Height</span>
                <input type="number" required className="bg-white border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" value={floorForm.height} onChange={(e) => setFloorForm({ ...floorForm, height: Number(e.target.value) })} />
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-medium">Floor plan URL</span>
              <input className="bg-white border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" value={floorForm.floorPlanUrl} onChange={(e) => setFloorForm({ ...floorForm, floorPlanUrl: e.target.value })} placeholder="https://..." />
            </label>
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setShowFloorForm(false)} className="px-4 py-2 text-slate-500 hover:text-slate-700 text-sm">Cancel</button>
              <button type="submit" className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium shadow-sm">Create</button>
            </div>
          </form>
        )}

        <div className="grid gap-3">
          {(building.floors ?? []).map((f: any) => (
            <div
              key={f.id}
              className="bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 rounded-xl flex items-center transition-colors shadow-sm"
            >
              <Link
                href={`/buildings/${id}/floors/${f.id}`}
                className="flex-1 p-5 flex items-center justify-between min-w-0"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 truncate">
                    {f.name} <span className="text-slate-400 text-sm ml-2 font-normal">Level {f.level}</span>
                  </div>
                  <div className="text-slate-500 text-sm truncate" dir="rtl">{f.nameAr}</div>
                  <div className="text-slate-400 text-xs mt-1">
                    {f.stores?.length ?? 0} stores · {f.navNodes?.length ?? 0} nav nodes · {f.width}×{f.height}
                  </div>
                </div>
                <span className="text-blue-500 text-sm font-medium ml-3 flex-shrink-0">Open Map Builder →</span>
              </Link>
              <div className="flex items-center gap-1 pr-3 pl-1">
                <button
                  type="button"
                  onClick={() => openEditFloor(f)}
                  title="Edit floor"
                  className="w-9 h-9 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 flex items-center justify-center text-lg"
                >
                  ✎
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteFloor(f)}
                  title="Delete floor"
                  className="w-9 h-9 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 flex items-center justify-center text-lg"
                >
                  🗑
                </button>
              </div>
            </div>
          ))}
          {building.floors?.length === 0 && (
            <div className="text-slate-400 text-center py-8 bg-white border border-dashed border-slate-200 rounded-xl">No floors yet.</div>
          )}
        </div>
      </section>

      {/* ───────── QR Codes section ───────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-slate-900">
            QR Codes <span className="text-slate-400 text-sm font-normal">({qrCodes.length})</span>
          </h2>
          <button
            onClick={() => setShowQrForm(!showQrForm)}
            disabled={allNodes.length === 0}
            className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium shadow-sm"
          >
            + Generate QR
          </button>
        </div>

        {allNodes.length === 0 && (
          <p className="text-slate-400 text-sm mb-3">Add at least one nav node in the Map Builder before generating QR codes.</p>
        )}

        {showQrForm && (
          <form onSubmit={handleCreateQR} className="bg-white border border-slate-200 rounded-xl p-5 mb-4 flex flex-col gap-3 shadow-sm">
            <h3 className="font-semibold text-slate-900">New QR Scan Point</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 font-medium">Floor</span>
                <select
                  required
                  className="bg-white border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  value={qrForm.floorId}
                  onChange={(e) => setQrForm({ ...qrForm, floorId: e.target.value, nodeId: "" })}
                >
                  <option value="">Select floor…</option>
                  {(building.floors ?? []).map((f: any) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 font-medium">Nav Node</span>
                <select
                  required
                  disabled={!qrForm.floorId}
                  className="bg-white border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
                  value={qrForm.nodeId}
                  onChange={(e) => setQrForm({ ...qrForm, nodeId: e.target.value })}
                >
                  <option value="">Select node…</option>
                  {nodesForSelectedFloor.map((n: any) => (
                    <option key={n.id} value={n.id}>
                      {n.type} — ({Math.round(n.x)}, {Math.round(n.y)})
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 font-medium">Label</span>
                <input
                  required
                  className="bg-white border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="e.g. Main Entrance"
                  value={qrForm.label}
                  onChange={(e) => setQrForm({ ...qrForm, label: e.target.value })}
                />
              </label>
            </div>
            {qrError && <p className="text-red-600 text-sm">{qrError}</p>}
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => { setShowQrForm(false); setQrError(null); }} className="px-4 py-2 text-slate-500 hover:text-slate-700 text-sm">Cancel</button>
              <button type="submit" className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium shadow-sm">Generate</button>
            </div>
          </form>
        )}

        {qrCodes.length === 0 ? (
          <div className="text-slate-400 text-center py-8 bg-white border border-dashed border-slate-200 rounded-xl">No QR codes yet.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {qrCodes.map((qr) => {
              const floor = building.floors?.find((f: any) => f.id === qr.floorId);
              const navUrl = qr.nodeId ? `${publicAppUrl}/nav/${id}/${qr.floorId}/${qr.nodeId}` : null;
              const scanUrl = `${publicAppUrl}/qr/${qr.code}`;
              return (
                <div key={qr.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-2">
                  {qr.qrImageUrl && (
                    <img src={qr.qrImageUrl} alt={qr.label} className="w-full aspect-square rounded-lg bg-slate-50 border border-slate-100 object-contain" />
                  )}
                  <div>
                    <div className="font-semibold text-slate-900 text-sm truncate">{qr.label}</div>
                    <div className="text-xs text-slate-400 truncate">{floor?.name ?? "Unknown floor"}</div>
                    <div className="text-xs text-slate-400 font-mono mt-1 truncate" title={qr.code}>{qr.code}</div>
                    {qr.nodeId ? (
                      <div className="text-[10px] mt-1 inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                        <span>●</span> Linked
                      </div>
                    ) : (
                      <div className="text-[10px] mt-1 inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                        <span>⚠</span> Unassigned — visitors see &ldquo;ask staff&rdquo;
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-1">
                    {navUrl ? (
                      <a
                        href={navUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 px-2 py-1.5 text-xs font-medium text-center bg-blue-50 hover:bg-blue-100 text-blue-700 rounded border border-blue-200"
                      >
                        Open
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="flex-1 px-2 py-1.5 text-xs font-medium text-center bg-slate-50 text-slate-400 rounded border border-slate-200 cursor-not-allowed"
                        title="No node linked"
                      >
                        Open
                      </button>
                    )}
                    {qr.qrImageUrl && (
                      <a
                        href={qr.qrImageUrl}
                        download={`${qr.label}.png`}
                        className="flex-1 px-2 py-1.5 text-xs font-medium text-center bg-slate-50 hover:bg-slate-100 text-slate-700 rounded border border-slate-200"
                      >
                        Download
                      </a>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openReassign(qr)}
                      className="flex-1 px-2 py-1.5 text-xs font-medium bg-slate-50 hover:bg-slate-100 text-slate-700 rounded border border-slate-200"
                      title="Reassign to a different nav node (no re-print needed)"
                    >
                      ⇄ Reassign
                    </button>
                    <button
                      onClick={() => handleDeleteQR(qr.id)}
                      className="px-2 py-1.5 text-xs font-medium bg-red-50 hover:bg-red-100 text-red-700 rounded border border-red-200"
                      aria-label="Delete"
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ───────── Analytics section ───────── */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-900 mb-3">Analytics</h2>
        <AnalyticsDashboard
          buildingId={id}
          storeNames={Object.fromEntries(
            (building.floors ?? []).flatMap((f: any) =>
              (f.stores ?? []).map((s: any) => [s.id, s.name]),
            ),
          )}
        />
      </section>

      {/* ───── Reassign QR modal ───── */}
      {editingFloorId && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) closeEditFloor(); }}
        >
          <form onSubmit={handleUpdateFloor} className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl p-6 flex flex-col gap-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Edit floor</h3>
              <p className="text-xs text-slate-500 mt-1">Update names, level, canvas size, and floor plan image URL.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 font-medium">Name (EN)</span>
                <input required className="bg-white border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" value={editFloorForm.name} onChange={(e) => setEditFloorForm({ ...editFloorForm, name: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 font-medium">Name (AR)</span>
                <input dir="rtl" required className="bg-white border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" value={editFloorForm.nameAr} onChange={(e) => setEditFloorForm({ ...editFloorForm, nameAr: e.target.value })} />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 font-medium">Level</span>
                <input type="number" required className="bg-white border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" value={editFloorForm.level} onChange={(e) => setEditFloorForm({ ...editFloorForm, level: Number(e.target.value) })} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 font-medium">Width</span>
                <input type="number" min={1} required className="bg-white border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" value={editFloorForm.width} onChange={(e) => setEditFloorForm({ ...editFloorForm, width: Number(e.target.value) })} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 font-medium">Height</span>
                <input type="number" min={1} required className="bg-white border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" value={editFloorForm.height} onChange={(e) => setEditFloorForm({ ...editFloorForm, height: Number(e.target.value) })} />
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-medium">Floor plan URL</span>
              <input className="bg-white border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" value={editFloorForm.floorPlanUrl} onChange={(e) => setEditFloorForm({ ...editFloorForm, floorPlanUrl: e.target.value })} placeholder="Leave empty to remove" />
            </label>

            <div className="flex justify-end gap-2 mt-1">
              <button type="button" onClick={closeEditFloor} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm font-semibold bg-blue-500 hover:bg-blue-600 text-white rounded-lg shadow-sm">Save changes</button>
            </div>
          </form>
        </div>
      )}

      {reassignQr && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) closeReassign(); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Reassign QR code</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Point this printed sticker at a different nav node.{" "}
                <span className="font-mono">{reassignQr.code}</span> stays the same — no
                need to re-print.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded p-3 text-xs text-slate-600">
              <div><span className="text-slate-400">Label:</span> {reassignQr.label || <span className="italic text-slate-400">(none)</span>}</div>
              <div className="mt-1"><span className="text-slate-400">Currently linked to:</span>{" "}
                {reassignQr.nodeId ? (
                  <span className="font-mono break-all">{reassignQr.nodeId}</span>
                ) : (
                  <span className="text-amber-700 font-medium">Unassigned</span>
                )}
              </div>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-medium">New nav node</span>
              <select
                value={reassignNodeId}
                onChange={(e) => setReassignNodeId(e.target.value)}
                className="bg-white border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded px-3 py-2 text-sm text-slate-900 outline-none"
              >
                <option value="">— Unassign (visitors see &ldquo;ask staff&rdquo;) —</option>
                {(building?.floors ?? []).map((f: any) => (
                  ((f.navNodes ?? []).length > 0) && (
                    <optgroup key={f.id} label={`${f.name}${f.nameAr ? ` · ${f.nameAr}` : ""}`}>
                      {(f.navNodes ?? []).map((n: any) => (
                        <option key={n.id} value={n.id}>
                          {n.type} — ({Math.round(n.x)}, {Math.round(n.y)}) {n.id.slice(-6)}
                        </option>
                      ))}
                    </optgroup>
                  )
                ))}
              </select>
              {Object.values(building?.floors ?? []).every((f: any) => (f.navNodes ?? []).length === 0) && (
                <span className="text-xs text-amber-700 mt-1">
                  No nav nodes exist on any floor — add nodes in the Map Builder first.
                </span>
              )}
            </label>

            <div className="flex justify-end gap-2 mt-1">
              <button
                type="button"
                onClick={closeReassign}
                className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReassign}
                disabled={reassignBusy || (reassignNodeId === (reassignQr.nodeId ?? ""))}
                className="px-4 py-2 text-sm font-semibold bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg shadow-sm"
              >
                {reassignBusy ? "Saving…" : (reassignNodeId ? "Reassign" : "Unassign")}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
