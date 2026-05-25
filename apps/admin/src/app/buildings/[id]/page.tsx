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
  nodeId: string;
  qrImageUrl?: string;
}

export default function BuildingPage() {
  const { id } = useParams<{ id: string }>();
  const [building, setBuilding] = useState<any>(null);
  const [qrCodes, setQrCodes] = useState<QRCode[]>([]);
  const [showFloorForm, setShowFloorForm] = useState(false);
  const [showQrForm, setShowQrForm] = useState(false);
  const [floorForm, setFloorForm] = useState({ name: "", nameAr: "", level: 0, width: 2000, height: 1400 });
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
    await api.createFloor({ buildingId: id, ...floorForm });
    setShowFloorForm(false);
    setFloorForm({ name: "", nameAr: "", level: 0, width: 2000, height: 1400 });
    await refresh();
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
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setShowFloorForm(false)} className="px-4 py-2 text-slate-500 hover:text-slate-700 text-sm">Cancel</button>
              <button type="submit" className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium shadow-sm">Create</button>
            </div>
          </form>
        )}

        <div className="grid gap-3">
          {(building.floors ?? []).map((f: any) => (
            <Link
              key={f.id}
              href={`/buildings/${id}/floors/${f.id}`}
              className="bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 rounded-xl p-5 flex items-center justify-between transition-colors shadow-sm"
            >
              <div>
                <div className="font-semibold text-slate-900">
                  {f.name} <span className="text-slate-400 text-sm ml-2 font-normal">Level {f.level}</span>
                </div>
                <div className="text-slate-500 text-sm" dir="rtl">{f.nameAr}</div>
                <div className="text-slate-400 text-xs mt-1">
                  {f.stores?.length ?? 0} stores · {f.navNodes?.length ?? 0} nav nodes · {f.width}×{f.height}
                </div>
              </div>
              <span className="text-blue-500 text-sm font-medium">Open Map Builder →</span>
            </Link>
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
              const navUrl = `${publicAppUrl}/nav/${id}/${qr.floorId}/${qr.nodeId}`;
              return (
                <div key={qr.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-2">
                  {qr.qrImageUrl && (
                    <img src={qr.qrImageUrl} alt={qr.label} className="w-full aspect-square rounded-lg bg-slate-50 border border-slate-100 object-contain" />
                  )}
                  <div>
                    <div className="font-semibold text-slate-900 text-sm truncate">{qr.label}</div>
                    <div className="text-xs text-slate-400 truncate">{floor?.name ?? "Unknown floor"}</div>
                    <div className="text-xs text-slate-400 font-mono mt-1 truncate" title={qr.code}>{qr.code}</div>
                  </div>
                  <div className="flex gap-2 mt-1">
                    <a
                      href={navUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 px-2 py-1.5 text-xs font-medium text-center bg-blue-50 hover:bg-blue-100 text-blue-700 rounded border border-blue-200"
                    >
                      Open
                    </a>
                    {qr.qrImageUrl && (
                      <a
                        href={qr.qrImageUrl}
                        download={`${qr.label}.png`}
                        className="flex-1 px-2 py-1.5 text-xs font-medium text-center bg-slate-50 hover:bg-slate-100 text-slate-700 rounded border border-slate-200"
                      >
                        Download
                      </a>
                    )}
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
    </main>
  );
}
