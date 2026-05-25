const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.message) msg = body.message;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json();
}

export const api = {
  getBuilding:   (id: string) => req<any>(`/buildings/${id}`),
  getGraph:      (buildingId: string) => req<any[]>(`/nav/graph/${buildingId}`),
  searchStores:  (buildingId: string, q: string) => req<any[]>(`/stores/search?buildingId=${buildingId}&q=${encodeURIComponent(q)}`),
  getRoute:      (from: string, to: string, accessible = false) =>
    req<any>(`/route?from=${from}&to=${to}&accessible=${accessible}`),
  track:         (data: any) => req<any>("/analytics/track", { method: "POST", body: JSON.stringify(data) }),
};
