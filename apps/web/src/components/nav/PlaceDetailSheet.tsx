"use client";
import { useLocale, type TKey } from "@/lib/i18n";

interface Props {
  name: string;
  nameAr: string;
  category: string;
  floorName?: string;
  floorNameAr?: string;
  onDirections: () => void;
  onClose: () => void;
}

const CATEGORY_META: Record<string, { tkey: TKey; emoji: string; tint: string }> = {
  medical:   { tkey: "catClinic",    emoji: "⚕",  tint: "bg-rose-50 text-rose-600 border-rose-200" },
  retail:    { tkey: "catPharmacy",  emoji: "℞",  tint: "bg-emerald-50 text-emerald-600 border-emerald-200" },
  food:      { tkey: "catFood",      emoji: "☕", tint: "bg-amber-50 text-amber-700 border-amber-200" },
  services:  { tkey: "catService",   emoji: "ⓘ",  tint: "bg-sky-50 text-sky-600 border-sky-200" },
  restroom:  { tkey: "catRestroom",  emoji: "WC", tint: "bg-indigo-50 text-indigo-600 border-indigo-200" },
  elevator:  { tkey: "catElevator",  emoji: "▦",  tint: "bg-violet-50 text-violet-600 border-violet-200" },
  entrance:  { tkey: "catEntrance",  emoji: "⌂",  tint: "bg-slate-50 text-slate-600 border-slate-200" },
  other:     { tkey: "catPlace",     emoji: "•",  tint: "bg-slate-50 text-slate-600 border-slate-200" },
};

// Google-Maps-style: a slim non-blocking bottom card that previews the place
// + offers a single primary "Directions" action. Keeps the map fully visible
// so the user can verify the location before confirming.
export default function PlaceDetailSheet({
  name, nameAr, category, floorName, floorNameAr, onDirections, onClose,
}: Props) {
  const { t, locale } = useLocale();
  const cat = CATEGORY_META[category] ?? CATEGORY_META.other;
  const primaryName = locale === "ar" ? nameAr : name;
  const floorLabel = locale === "ar" && floorNameAr ? floorNameAr : floorName;

  return (
    // Sit above the bottom tab bar (which occupies ~bottom-16); inset from
    // edges so the map is still tappable around the card.
    <div
      className="absolute bottom-20 left-3 right-3 z-30 pointer-events-none"
      dir={locale === "ar" ? "rtl" : "ltr"}
    >
      <div className="relative max-w-md mx-auto pointer-events-auto animate-in slide-in-from-bottom duration-200">
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-3 flex items-center gap-3">
          {/* category icon */}
          <div
            className={`w-12 h-12 rounded-xl border-2 ${cat.tint} flex items-center justify-center text-xl font-bold flex-shrink-0`}
          >
            {cat.emoji}
          </div>

          {/* name + meta (truncate so long names don't push the button off) */}
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-slate-900 truncate leading-tight">
              {primaryName}
            </h2>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 min-w-0">
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${cat.tint} flex-shrink-0`}
              >
                {t(cat.tkey)}
              </span>
              {floorLabel && (
                <span className="truncate flex items-center gap-1">
                  <span className="opacity-60">·</span>
                  <span className="truncate">{floorLabel}</span>
                </span>
              )}
            </div>
          </div>

          {/* primary action — confirm and start navigating */}
          <button
            onClick={onDirections}
            className="flex items-center gap-1.5 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white font-semibold text-sm px-4 py-2.5 rounded-xl shadow-sm flex-shrink-0 transition-colors"
          >
            <span>📍</span>
            <span>{t("directions")}</span>
          </button>
        </div>

        {/* small dismiss handle (floating corner X — doesn't take row space) */}
        <button
          onClick={onClose}
          aria-label={t("close")}
          className="absolute -top-2 -right-2 rtl:-right-auto rtl:-left-2 w-7 h-7 rounded-full bg-white border border-slate-300 shadow text-slate-600 hover:bg-slate-50 active:bg-slate-100 flex items-center justify-center text-sm leading-none"
        >
          ×
        </button>
      </div>
    </div>
  );
}
