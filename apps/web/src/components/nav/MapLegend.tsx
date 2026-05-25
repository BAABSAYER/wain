"use client";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/lib/i18n";

export type AmenityKey = "restroom" | "elevator" | "stairs" | "prayer" | "info" | "entrance";

interface Row { key: AmenityKey; icon: string; en: string; ar: string; }

const AMENITIES: Row[] = [
  { key: "restroom", icon: "🚻", en: "Restroom",  ar: "دورة مياه" },
  { key: "elevator", icon: "🛗", en: "Elevator",  ar: "مصعد" },
  { key: "stairs",   icon: "🪜", en: "Stairs",    ar: "سلم" },
  { key: "prayer",   icon: "🕌", en: "Prayer",    ar: "مصلى" },
  { key: "info",     icon: "ⓘ",  en: "Info desk", ar: "استقبال" },
  { key: "entrance", icon: "🚪", en: "Entrance",  ar: "مدخل" },
];

const MARKERS = [
  { icon: "🔵", en: "You are here", ar: "موقعك" },
  { icon: "🟣", en: "Destination",  ar: "الوجهة" },
  { icon: "➡", en: "Walkway",      ar: "ممر" },
];

interface Props {
  onFindNearest?: (key: AmenityKey) => void;
}

export default function MapLegend({ onFindNearest }: Props) {
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const ar = locale === "ar";

  // Close when clicking/tapping outside the legend.
  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [open]);

  return (
    // relative wrapper keeps the 11×11 button footprint fixed in the control
    // stack; the panel floats ABOVE it (absolute) so nothing else shifts.
    <div ref={ref} className="relative w-11 h-11 select-none">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-11 h-11 rounded-full border shadow-md flex items-center justify-center text-lg transition-colors ${
          open ? "bg-blue-500 border-blue-500 text-white" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
        }`}
        aria-label={ar ? "مفتاح الخريطة" : "Map legend"}
        title={ar ? "مفتاح الخريطة" : "Map legend"}
      >
        🔑
      </button>

      {open && (
        <div
          className="fixed bottom-24 left-3 rtl:left-auto rtl:right-3 z-40 bg-white border border-slate-200 rounded-2xl shadow-2xl p-3 w-56 max-h-[60vh] overflow-y-auto"
          dir={ar ? "rtl" : "ltr"}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              {ar ? "مفتاح الخريطة" : "Map key"}
            </span>
            <button
              onClick={() => setOpen(false)}
              className="w-6 h-6 rounded-full hover:bg-slate-100 text-slate-400 text-lg leading-none flex items-center justify-center"
              aria-label={ar ? "إغلاق" : "Close"}
            >×</button>
          </div>

          <div className="space-y-1.5">
            {MARKERS.map((r) => (
              <div key={r.en} className="flex items-center gap-2.5 text-sm text-slate-700">
                <span className="w-5 text-center">{r.icon}</span>
                <span>{ar ? r.ar : r.en}</span>
              </div>
            ))}
          </div>

          <div className="h-px bg-slate-100 my-2" />
          <p className="text-[11px] text-slate-400 mb-1.5">
            {ar ? "اضغط للوصول إلى الأقرب:" : "Tap to route to the nearest:"}
          </p>

          <div className="grid grid-cols-2 gap-1.5">
            {AMENITIES.map((r) => (
              <button
                key={r.key}
                onClick={() => { onFindNearest?.(r.key); setOpen(false); }}
                className="flex items-center gap-2 text-xs text-slate-700 px-2 py-1.5 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50 active:bg-blue-100 transition-colors text-start"
              >
                <span className="w-5 text-center text-base">{r.icon}</span>
                <span className="truncate">{ar ? r.ar : r.en}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
