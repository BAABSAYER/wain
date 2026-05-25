"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

interface Props {
  buildingId: string;
  /** Map of storeId → display name, to resolve destination IDs. */
  storeNames: Record<string, string>;
}

interface Summary {
  totalScans: number;
  topDestinations: Array<{ destinationId: string; _count: { destinationId: number } }>;
  recentEvents: Array<{ id: string; eventType: string; destinationId?: string | null; floorId?: string | null; createdAt: string }>;
}

const EVENT_LABEL: Record<string, string> = {
  qr_scan: "QR scan",
  route_requested: "Route requested",
  navigation_started: "Navigation started",
};

export default function AnalyticsDashboard({ buildingId, storeNames }: Props) {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.getAnalytics(buildingId)
      .then(setData)
      .catch((e) => setError(e?.message ?? "Failed to load analytics"))
      .finally(() => setLoading(false));
  };
  useEffect(load, [buildingId]);

  const routeRequests = useMemo(
    () => data?.topDestinations.reduce((a, d) => a + d._count.destinationId, 0) ?? 0,
    [data],
  );
  const maxCount = useMemo(
    () => Math.max(1, ...(data?.topDestinations.map((d) => d._count.destinationId) ?? [1])),
    [data],
  );

  if (loading) return <div className="text-slate-400 text-sm py-6">Loading analytics…</div>;
  if (error) return <div className="text-red-600 text-sm py-6">{error}</div>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-3xl font-bold text-blue-600">{data.totalScans}</div>
          <div className="text-xs text-slate-500 mt-1 uppercase tracking-wider">QR scans</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-3xl font-bold text-violet-600">{routeRequests}</div>
          <div className="text-xs text-slate-500 mt-1 uppercase tracking-wider">Routes requested</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-3xl font-bold text-emerald-600">{data.topDestinations.length}</div>
          <div className="text-xs text-slate-500 mt-1 uppercase tracking-wider">Distinct destinations</div>
        </div>
      </div>

      {/* Top destinations */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-900">Most-requested destinations</h3>
          <button onClick={load} className="text-xs text-blue-600 hover:text-blue-800">↻ Refresh</button>
        </div>
        {data.topDestinations.length === 0 ? (
          <p className="text-sm text-slate-400">No routes requested yet.</p>
        ) : (
          <div className="space-y-2">
            {data.topDestinations.map((d) => {
              const name = storeNames[d.destinationId] ?? d.destinationId.slice(0, 8) + "…";
              const pct = (d._count.destinationId / maxCount) * 100;
              return (
                <div key={d.destinationId} className="flex items-center gap-3">
                  <div className="w-40 truncate text-sm text-slate-700">{name}</div>
                  <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full flex items-center justify-end pr-2" style={{ width: `${Math.max(pct, 8)}%` }}>
                      <span className="text-[10px] font-bold text-white">{d._count.destinationId}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent activity */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <h3 className="font-semibold text-slate-900 mb-3">Recent activity</h3>
        {data.recentEvents.length === 0 ? (
          <p className="text-sm text-slate-400">No activity yet.</p>
        ) : (
          <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
            {data.recentEvents.map((e) => (
              <div key={e.id} className="flex items-center gap-3 py-2 text-sm">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  e.eventType === "qr_scan" ? "bg-blue-500" : e.eventType === "route_requested" ? "bg-violet-500" : "bg-emerald-500"
                }`} />
                <span className="text-slate-700 w-36 flex-shrink-0">{EVENT_LABEL[e.eventType] ?? e.eventType}</span>
                <span className="text-slate-500 flex-1 truncate">
                  {e.destinationId ? (storeNames[e.destinationId] ?? "—") : "—"}
                </span>
                <span className="text-slate-400 text-xs flex-shrink-0">
                  {new Date(e.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
