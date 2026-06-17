// In production the front-end is served same-origin with the API (Caddy / your
// reverse proxy routes `/api` to the NestJS service), so a relative URL just
// works regardless of domain, IP, or port — never needs a rebuild when those
// change. In dev set NEXT_PUBLIC_API_URL=http://localhost:4000/api in `.env`.
const API = process.env.NEXT_PUBLIC_API_URL || "/api";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const token = typeof window !== "undefined" ? window.localStorage.getItem("wain.admin.token") : null;
  const res = await fetch(`${API}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...init,
  });
  if (res.status === 401 && typeof window !== "undefined") {
    // Session missing/expired → bounce to login.
    window.localStorage.removeItem("wain.admin.token");
    if (!window.location.pathname.startsWith("/login")) window.location.href = "/login";
    throw new Error("Session expired — please log in again.");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? "API error");
  }
  return res.json();
}

export const api = {
  // Buildings
  getBuildings: ()                        => req<any[]>("/buildings"),
  getBuilding:  (id: string)              => req<any>(`/buildings/${id}`),
  createBuilding: (data: any)             => req<any>("/buildings", { method: "POST", body: JSON.stringify(data) }),
  updateBuilding: (id: string, data: any) => req<any>(`/buildings/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteBuilding: (id: string)            => req<any>(`/buildings/${id}`, { method: "DELETE" }),

  // Floors
  getFloors:   (buildingId: string)       => req<any[]>(`/floors/building/${buildingId}`),
  getFloor:    (id: string)               => req<any>(`/floors/${id}`),
  createFloor: (data: any)                => req<any>("/floors", { method: "POST", body: JSON.stringify(data) }),
  deleteFloor: (id: string)               => req<any>(`/floors/${id}`, { method: "DELETE" }),
  updateFloor: (id: string, data: any)    => req<any>(`/floors/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  // Stores
  getStores:   (floorId: string)          => req<any[]>(`/stores/floor/${floorId}`),
  createStore: (data: any)                => req<any>("/stores", { method: "POST", body: JSON.stringify(data) }),
  updateStore: (id: string, data: any)    => req<any>(`/stores/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteStore: (id: string)               => req<any>(`/stores/${id}`, { method: "DELETE" }),
  searchStores: (buildingId: string, q: string) => req<any[]>(`/stores/search?buildingId=${buildingId}&q=${encodeURIComponent(q)}`),

  // Nav graph
  getGraph:    (buildingId: string)       => req<any[]>(`/nav/graph/${buildingId}`),
  bulkSaveGraph: (floorId: string, data: any) => req<any>(`/nav/graph/${floorId}/bulk`, { method: "POST", body: JSON.stringify(data) }),

  // QR
  getQRCodes:  (buildingId: string)       => req<any[]>(`/qr/building/${buildingId}`),
  /** Reassign a QR to a different (or no) nav node. The printed sticker doesn't change. */
  reassignQR:  (id: string, patch: { nodeId?: string | null; floorId?: string; label?: string }) =>
                                              req<any>(`/qr/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  createQR:    (data: any)                => req<any>("/qr", { method: "POST", body: JSON.stringify(data) }),
  deleteQR:    (id: string)               => req<any>(`/qr/${id}`, { method: "DELETE" }),

  // Analytics
  getAnalytics: (buildingId: string)      => req<any>(`/analytics/${buildingId}`),
  track:        (data: any)               => req<any>("/analytics/track", { method: "POST", body: JSON.stringify(data) }),
};
