"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { Crosshair, LocateFixed, Map, Satellite, Save, X } from "lucide-react";
import {
  floorPointToLngLat,
  type FloorGeoreference,
  type GeoBasemapStyle,
} from "@wain/types";
import { makeBasemapStyle, parseMapLocation, zoomForScale } from "./geo-reference";

interface Props {
  floor: {
    width: number;
    height: number;
    geoLatitude?: number | null;
    geoLongitude?: number | null;
    geoBearing?: number | null;
    geoMetersPerUnit?: number | null;
    geoBasemap?: GeoBasemapStyle | null;
  };
  onClose: () => void;
  onSave: (reference: FloorGeoreference) => Promise<void>;
  onRemove: () => Promise<void>;
}

const DEFAULT_LOCATION = { latitude: 24.7136, longitude: 46.6753 };

export default function GeoReferenceModal({ floor, onClose, onSave, onRemove }: Props) {
  const initial = useMemo<FloorGeoreference>(() => ({
    latitude: floor.geoLatitude ?? DEFAULT_LOCATION.latitude,
    longitude: floor.geoLongitude ?? DEFAULT_LOCATION.longitude,
    bearing: floor.geoBearing ?? 0,
    metersPerUnit: floor.geoMetersPerUnit ?? 0.25,
    basemap: floor.geoBasemap === "streets" ? "streets" : "satellite",
  }), [floor]);
  const [reference, setReference] = useState(initial);
  const referenceRef = useRef(reference);
  const [locationInput, setLocationInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loadedRef = useRef(false);
  referenceRef.current = reference;

  const footprint = useCallback((value: FloorGeoreference) => {
    const corners = [
      floorPointToLngLat(0, 0, floor.width, floor.height, value),
      floorPointToLngLat(floor.width, 0, floor.width, floor.height, value),
      floorPointToLngLat(floor.width, floor.height, floor.width, floor.height, value),
      floorPointToLngLat(0, floor.height, floor.width, floor.height, value),
    ];
    corners.push(corners[0]);
    return {
      type: "FeatureCollection" as const,
      features: [{
        type: "Feature" as const,
        properties: {},
        geometry: { type: "Polygon" as const, coordinates: [corners] },
      }],
    };
  }, [floor.height, floor.width]);

  const ensureFootprint = useCallback((map: maplibregl.Map) => {
    if (!map.getSource("floor-footprint")) {
      map.addSource("floor-footprint", {
        type: "geojson",
        data: footprint(referenceRef.current),
      });
      map.addLayer({
        id: "floor-footprint-fill",
        type: "fill",
        source: "floor-footprint",
        paint: { "fill-color": "#3b82f6", "fill-opacity": 0.18 },
      });
      map.addLayer({
        id: "floor-footprint-line",
        type: "line",
        source: "floor-footprint",
        paint: { "line-color": "#2563eb", "line-width": 3 },
      });
    }
  }, [footprint]);

  useEffect(() => {
    if (!mapContainerRef.current) return;
    const pixelsPerUnit = 520 / Math.max(floor.width, floor.height);
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: makeBasemapStyle(initial.basemap),
      center: [initial.longitude, initial.latitude],
      zoom: zoomForScale(initial.latitude, initial.metersPerUnit, pixelsPerUnit),
      bearing: initial.bearing,
      pitch: 0,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "bottom-right");
    mapRef.current = map;
    map.on("load", () => {
      loadedRef.current = true;
      ensureFootprint(map);
    });
    map.on("moveend", () => {
      const center = map.getCenter();
      setReference((current) => ({
        ...current,
        latitude: Number(center.lat.toFixed(7)),
        longitude: Number(center.lng.toFixed(7)),
      }));
    });
    return () => {
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(makeBasemapStyle(reference.basemap));
    map.once("styledata", () => {
      if (map.isStyleLoaded()) ensureFootprint(map);
      else map.once("idle", () => ensureFootprint(map));
    });
  }, [reference.basemap, ensureFootprint]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    (map.getSource("floor-footprint") as maplibregl.GeoJSONSource | undefined)
      ?.setData(footprint(reference));
    if (Math.abs(map.getBearing() - reference.bearing) > 0.01) {
      map.rotateTo(reference.bearing, { duration: 0 });
    }
  }, [reference, footprint]);

  const goToLocation = (latitude: number, longitude: number) => {
    setReference((current) => ({ ...current, latitude, longitude }));
    mapRef.current?.jumpTo({ center: [longitude, latitude] });
  };

  const applyLocationInput = () => {
    const parsed = parseMapLocation(locationInput);
    if (!parsed) {
      setError("Paste coordinates or a full Google Maps URL containing @latitude,longitude.");
      return;
    }
    setError(null);
    goToLocation(parsed.latitude, parsed.longitude);
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError("Location is not available in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setError(null);
        goToLocation(position.coords.latitude, position.coords.longitude);
      },
      () => setError("Location permission was denied or unavailable."),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };

  const save = async () => {
    if (
      !Number.isFinite(reference.latitude)
      || !Number.isFinite(reference.longitude)
      || !Number.isFinite(reference.metersPerUnit)
      || reference.metersPerUnit <= 0
    ) {
      setError("Enter a valid location and a scale greater than zero.");
      return;
    }
    setSaving(true);
    try {
      await onSave(reference);
      onClose();
    } catch (saveError: any) {
      setError(saveError?.message ?? "Could not save map alignment.");
    } finally {
      setSaving(false);
    }
  };

  const updateNumber = (key: "latitude" | "longitude" | "bearing" | "metersPerUnit", value: string) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return;
    setReference((current) => ({ ...current, [key]: number }));
  };

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/60 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Align floor to real map">
      <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden bg-white shadow-2xl sm:h-[min(860px,calc(100vh-2rem))] sm:rounded-lg">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Real-world alignment</h2>
            <p className="text-xs text-slate-500">Pan the map until the floor footprint sits over the site.</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center text-slate-500 hover:bg-slate-100" aria-label="Close">
            <X size={19} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="relative min-h-[44vh] flex-1 bg-slate-200">
            <div className="absolute inset-0">
              <div ref={mapContainerRef} className="h-full w-full" />
            </div>
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-blue-700 drop-shadow">
              <Crosshair size={30} strokeWidth={2.5} />
            </div>
          </div>

          <aside className="w-full shrink-0 overflow-y-auto border-t border-slate-200 bg-white p-4 lg:w-80 lg:border-l lg:border-t-0">
            <label className="text-xs font-semibold text-slate-700">Google Maps URL or coordinates</label>
            <div className="mt-1 flex gap-2">
              <input
                value={locationInput}
                onChange={(event) => setLocationInput(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") applyLocationInput(); }}
                placeholder="24.7136, 46.6753"
                className="min-w-0 flex-1 border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
              <button type="button" onClick={applyLocationInput} className="h-10 px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50">
                Go
              </button>
            </div>
            <button type="button" onClick={useCurrentLocation} className="mt-2 flex h-9 items-center gap-2 px-2 text-xs font-medium text-slate-600 hover:bg-slate-100">
              <LocateFixed size={16} /> Use current location
            </button>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <label className="text-xs text-slate-600">
                Latitude
                <input type="number" step="0.000001" value={reference.latitude} onChange={(event) => updateNumber("latitude", event.target.value)} onBlur={() => goToLocation(reference.latitude, reference.longitude)} className="mt-1 w-full border border-slate-300 px-2 py-2 text-sm" />
              </label>
              <label className="text-xs text-slate-600">
                Longitude
                <input type="number" step="0.000001" value={reference.longitude} onChange={(event) => updateNumber("longitude", event.target.value)} onBlur={() => goToLocation(reference.latitude, reference.longitude)} className="mt-1 w-full border border-slate-300 px-2 py-2 text-sm" />
              </label>
              <label className="text-xs text-slate-600">
                Metres per unit
                <input type="number" min="0.001" step="0.01" value={reference.metersPerUnit} onChange={(event) => updateNumber("metersPerUnit", event.target.value)} className="mt-1 w-full border border-slate-300 px-2 py-2 text-sm" />
              </label>
              <label className="text-xs text-slate-600">
                Bearing
                <input type="number" min="0" max="360" step="1" value={reference.bearing} onChange={(event) => updateNumber("bearing", event.target.value)} className="mt-1 w-full border border-slate-300 px-2 py-2 text-sm" />
              </label>
            </div>

            <div className="mt-5">
              <span className="text-xs font-semibold text-slate-700">Basemap</span>
              <div className="mt-2 grid grid-cols-2 border border-slate-200">
                <button type="button" onClick={() => setReference((current) => ({ ...current, basemap: "satellite" }))} className={`flex h-10 items-center justify-center gap-2 text-xs font-semibold ${reference.basemap === "satellite" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                  <Satellite size={16} /> Satellite
                </button>
                <button type="button" onClick={() => setReference((current) => ({ ...current, basemap: "streets" }))} className={`flex h-10 items-center justify-center gap-2 text-xs font-semibold ${reference.basemap === "streets" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                  <Map size={16} /> Streets
                </button>
              </div>
            </div>

            <p className="mt-4 text-xs leading-5 text-slate-500">
              The blue footprint is the full Wain floor canvas. Pan to position it, then use scale and bearing to match the real site.
            </p>
            {error && <p className="mt-3 text-xs font-medium text-red-600">{error}</p>}

            <div className="mt-6 flex items-center justify-between gap-2">
              {(floor.geoLatitude != null && floor.geoLongitude != null) ? (
                <button type="button" onClick={onRemove} className="h-10 px-3 text-xs font-semibold text-red-600 hover:bg-red-50">
                  Remove alignment
                </button>
              ) : <span />}
              <button type="button" disabled={saving} onClick={save} className="flex h-10 items-center gap-2 bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                <Save size={16} /> {saving ? "Saving..." : "Save alignment"}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
