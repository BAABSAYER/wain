import type { FloorGeoreference, GeoBasemapStyle } from "@wain/types";
import type { StyleSpecification } from "maplibre-gl";

export interface GeoreferencedFloor {
  width: number;
  height: number;
  geoLatitude?: number | null;
  geoLongitude?: number | null;
  geoBearing?: number | null;
  geoMetersPerUnit?: number | null;
  geoBasemap?: GeoBasemapStyle | null;
}

export function getFloorGeoreference(floor: GeoreferencedFloor | null | undefined): FloorGeoreference | null {
  if (
    !floor
    || typeof floor.geoLatitude !== "number"
    || typeof floor.geoLongitude !== "number"
    || typeof floor.geoMetersPerUnit !== "number"
    || floor.geoMetersPerUnit <= 0
  ) return null;

  return {
    latitude: floor.geoLatitude,
    longitude: floor.geoLongitude,
    bearing: floor.geoBearing ?? 0,
    metersPerUnit: floor.geoMetersPerUnit,
    basemap: floor.geoBasemap === "streets" ? "streets" : "satellite",
  };
}

export function parseMapLocation(value: string): { latitude: number; longitude: number } | null {
  const input = value.trim();
  const patterns = [
    /@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/,
    /[?&](?:q|query|ll)=(-?\d{1,2}(?:\.\d+)?)(?:%2C|,)(-?\d{1,3}(?:\.\d+)?)/i,
    /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/,
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (!match) continue;
    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    if (latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
      return { latitude, longitude };
    }
  }
  return null;
}

export function makeBasemapStyle(style: GeoBasemapStyle): StyleSpecification {
  const satellite = style === "satellite";
  return {
    version: 8,
    sources: {
      basemap: {
        type: "raster",
        tiles: satellite
          ? ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"]
          : ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        // Esri has no level-20 imagery at some sites and returns a
        // "Map data not yet available" placeholder. Overzoom level 19.
        maxzoom: 19,
        attribution: satellite
          ? "Tiles &copy; Esri and contributors"
          : "&copy; OpenStreetMap contributors",
      },
    },
    layers: [{ id: "basemap", type: "raster", source: "basemap" }],
  };
}

export function zoomForScale(latitude: number, metersPerUnit: number, pixelsPerUnit: number): number {
  const metresPerPixel = metersPerUnit / Math.max(pixelsPerUnit, 0.0001);
  const circumference = 2 * Math.PI * 6378137 * Math.cos(latitude * Math.PI / 180);
  return Math.max(1, Math.min(22, Math.log2(circumference / (512 * metresPerPixel))));
}
