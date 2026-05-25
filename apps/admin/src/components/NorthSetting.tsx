"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

interface Props {
  buildingId: string;
  initial: number;
}

/**
 * Sets the building's north offset — the angle (clockwise, degrees) from the
 * floor plan's "up" to true north. The visitor compass uses it so its N needle
 * points at real north. Drag the dial or type a value.
 */
export default function NorthSetting({ buildingId, initial }: Props) {
  const [deg, setDeg] = useState(Math.round(initial) % 360);
  const [saved, setSaved] = useState<"idle" | "saving" | "ok">("idle");
  const dialRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // Debounced save
  useEffect(() => {
    if (deg === Math.round(initial) % 360) return;
    setSaved("saving");
    const t = setTimeout(async () => {
      try {
        await api.updateBuilding(buildingId, { northOffset: deg });
        setSaved("ok");
        setTimeout(() => setSaved("idle"), 1500);
      } catch {
        setSaved("idle");
      }
    }, 500);
    return () => clearTimeout(t);
  }, [deg, buildingId, initial]);

  const angleFromEvent = (clientX: number, clientY: number) => {
    const el = dialRef.current;
    if (!el) return deg;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    // angle clockwise from up (north)
    let a = (Math.atan2(clientX - cx, -(clientY - cy)) * 180) / Math.PI;
    if (a < 0) a += 360;
    return Math.round(a);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center gap-5">
      {/* Dial */}
      <div
        ref={dialRef}
        onPointerDown={(e) => { dragging.current = true; setDeg(angleFromEvent(e.clientX, e.clientY)); }}
        onPointerMove={(e) => { if (dragging.current) setDeg(angleFromEvent(e.clientX, e.clientY)); }}
        onPointerUp={() => { dragging.current = false; }}
        onPointerLeave={() => { dragging.current = false; }}
        className="relative w-24 h-24 rounded-full border-2 border-slate-200 bg-slate-50 cursor-grab active:cursor-grabbing flex-shrink-0 touch-none"
        title="Drag to point to true north"
      >
        {/* N E S W ticks */}
        <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[10px] text-slate-400 font-bold">N</span>
        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] text-slate-400">S</span>
        <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">W</span>
        <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">E</span>
        {/* needle */}
        <div className="absolute inset-0 flex items-start justify-center pt-2" style={{ transform: `rotate(${deg}deg)` }}>
          <div className="flex flex-col items-center">
            <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-b-[14px] border-l-transparent border-r-transparent border-b-red-500" />
            <div className="w-0.5 h-7 bg-red-400" />
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">North direction</span>
          {saved === "saving" && <span className="text-[11px] text-slate-400">saving…</span>}
          {saved === "ok" && <span className="text-[11px] text-emerald-600">✓ saved</span>}
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Angle from the floor plan&apos;s “up” to true north (clockwise). The visitor compass uses this.
        </p>
        <div className="flex items-center gap-2 mt-2">
          <input
            type="number"
            min={0} max={359}
            value={deg}
            onChange={(e) => setDeg(((Number(e.target.value) % 360) + 360) % 360)}
            className="w-20 bg-white border border-slate-300 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-500">°</span>
          <input
            type="range" min={0} max={359} value={deg}
            onChange={(e) => setDeg(Number(e.target.value))}
            className="flex-1 accent-blue-500"
          />
        </div>
      </div>
    </div>
  );
}
