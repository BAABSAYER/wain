"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { floorPointToLngLat, type FloorGeoreference } from "@wain/types";
import { makeBasemapStyle, zoomForScale } from "./geo-reference";

interface Props {
  reference: FloorGeoreference;
  floorWidth: number;
  floorHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  viewport: { x: number; y: number; scale: number } | null;
}

export default function GeoBasemap({
  reference,
  floorWidth,
  floorHeight,
  canvasWidth,
  canvasHeight,
  viewport,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: makeBasemapStyle(reference.basemap),
      center: [reference.longitude, reference.latitude],
      zoom: 18,
      bearing: reference.bearing,
      interactive: false,
      attributionControl: { compact: true },
      fadeDuration: 0,
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    mapRef.current?.setStyle(makeBasemapStyle(reference.basemap));
  }, [reference.basemap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !viewport) return;
    const localCenterX = (canvasWidth / 2 - viewport.x) / viewport.scale;
    const localCenterY = (canvasHeight / 2 - viewport.y) / viewport.scale;
    const center = floorPointToLngLat(
      localCenterX,
      localCenterY,
      floorWidth,
      floorHeight,
      reference,
    );
    map.jumpTo({
      center,
      zoom: zoomForScale(reference.latitude, reference.metersPerUnit, viewport.scale),
      bearing: reference.bearing,
      pitch: 0,
    });
    map.resize();
  }, [reference, floorWidth, floorHeight, canvasWidth, canvasHeight, viewport]);

  return (
    <div className="absolute inset-0" aria-hidden="true">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
