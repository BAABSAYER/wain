// In production the front-end is served same-origin with the API (Caddy / your
// reverse proxy routes `/api` to the NestJS service), so a relative URL just
// works regardless of domain, IP, or port — never needs a rebuild when those
// change. In dev set NEXT_PUBLIC_API_URL=http://localhost:4000/api in `.env`.
const API = process.env.NEXT_PUBLIC_API_URL || "/api";

/**
 * The admin is mounted under a baked-in basePath (e.g. /console-7k29qz) so any
 * raw browser navigation must prefix it — without this, `window.location.href =
 * "/login"` lands on the visitor app and 404s. Next.js's `<Link>` /
 * `useRouter()` handle this automatically; this helper is for the rare
 * outside-Next case (the 401 redirect from a fetch helper).
 *
 * Known top-level admin routes; if the current first segment isn't one of
 * these, treat it as the basePath.
 */
const ADMIN_TOP_LEVEL = new Set(["buildings", "login"]);
function getAdminBasePath(): string {
  if (typeof window === "undefined") return "";
  const first = window.location.pathname.split("/").filter(Boolean)[0];
  if (!first || ADMIN_TOP_LEVEL.has(first)) return "";
  return `/${first}`;
}

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
    // Session missing/expired → bounce to login (basePath-aware so the admin
    // mounted under a secret URL doesn't 404 on the visitor app).
    window.localStorage.removeItem("wain.admin.token");
    const loginUrl = `${getAdminBasePath()}/login`;
    if (window.location.pathname !== loginUrl) window.location.href = loginUrl;
    throw new Error("Session expired — please log in again.");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? "API error");
  }
  // Some endpoints (e.g. DELETE) legitimately return an empty body. Don't
  // throw "Unexpected end of JSON input" — return undefined and let the
  // caller decide whether it cares.
  const text = await res.text();
  if (!text) return undefined as unknown as T;
  try { return JSON.parse(text) as T; }
  catch { return text as unknown as T; }
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
  duplicateFloor: (id: string, data: { name: string; nameAr: string; level: number }) =>
                                              req<any>(`/floors/${id}/duplicate`, { method: "POST", body: JSON.stringify(data) }),
  deleteFloor: (id: string)               => req<any>(`/floors/${id}`, { method: "DELETE" }),
  updateFloor: (id: string, data: any)    => req<any>(`/floors/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  // Stores
  getStores:   (floorId: string)          => req<any[]>(`/stores/floor/${floorId}`),
  createStore: (data: any)                => req<any>("/stores", { method: "POST", body: JSON.stringify(data) }),
  updateStore: (id: string, data: any)    => req<any>(`/stores/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  /** Replace the full set of nav nodes a store is linked to (M:N). */
  setStoreNavLinks: (id: string, navNodeIds: string[]) =>
                                              req<any>(`/stores/${id}/nav-links`, { method: "PUT", body: JSON.stringify({ navNodeIds }) }),
  deleteStore: (id: string)               => req<any>(`/stores/${id}`, { method: "DELETE" }),
  searchStores: (buildingId: string, q: string) => req<any[]>(`/stores/search?buildingId=${buildingId}&q=${encodeURIComponent(q)}`),

  // Assets
  getAssets:   (floorId: string)          => req<any[]>(`/assets/floor/${floorId}`),
  createAsset: (data: any)                => req<any>("/assets", { method: "POST", body: JSON.stringify(data) }),
  updateAsset: (id: string, data: any)    => req<any>(`/assets/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  bulkSaveAssets: (floorId: string, assets: any[]) =>
                                              req<any[]>(`/assets/floor/${floorId}/bulk`, { method: "PUT", body: JSON.stringify({ assets }) }),
  bulkSaveOutdoorFeatures: (floorId: string, features: any[]) =>
                                              req<any[]>(`/outdoor-features/floor/${floorId}/bulk`, { method: "PUT", body: JSON.stringify({ features }) }),
  deleteAsset: (id: string)               => req<any>(`/assets/${id}`, { method: "DELETE" }),

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
