export type NavigationLocationSource = "qr" | "arrival" | "floor_transition";

export interface NavigationLocation {
  buildingId: string;
  scannedNodeId: string;
  scanToken: string | null;
  currentNodeId: string;
  floorId: string;
  source: NavigationLocationSource;
  confirmedAt: number;
}

const STORAGE_PREFIX = "wain.navigation-location";
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

function storageKey(buildingId: string) {
  return `${STORAGE_PREFIX}.${buildingId}`;
}

export function readNavigationLocation(buildingId: string): NavigationLocation | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(storageKey(buildingId));
    if (!raw) return null;

    const value = JSON.parse(raw) as Partial<NavigationLocation>;
    const valid =
      value.buildingId === buildingId
      && typeof value.scannedNodeId === "string"
      && typeof value.currentNodeId === "string"
      && typeof value.floorId === "string"
      && typeof value.confirmedAt === "number"
      && Date.now() - value.confirmedAt <= MAX_AGE_MS;

    if (!valid) {
      window.localStorage.removeItem(storageKey(buildingId));
      return null;
    }

    return {
      ...value,
      scanToken: typeof value.scanToken === "string" ? value.scanToken : null,
    } as NavigationLocation;
  } catch {
    window.localStorage.removeItem(storageKey(buildingId));
    return null;
  }
}

export function saveNavigationLocation(location: NavigationLocation) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(location.buildingId), JSON.stringify(location));
}
