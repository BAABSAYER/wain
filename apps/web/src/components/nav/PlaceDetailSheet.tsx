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

export default function PlaceDetailSheet({
  name, nameAr, category, floorName, floorNameAr, onDirections, onClose,
}: Props) {
  const { t, locale } = useLocale();
  const cat = CATEGORY_META[category] ?? CATEGORY_META.other;
  const primaryName = locale === "ar" ? nameAr : name;
  const secondaryName = locale === "ar" ? name : nameAr;
  const floorLabel = locale === "ar" && floorNameAr ? floorNameAr : floorName;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-30 bg-white rounded-t-3xl shadow-2xl border-t border-slate-200 animate-in slide-in-from-bottom duration-200">
      <div className="px-5 pt-3 pb-6">
        {/* drag handle */}
        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4" />

        {/* close */}
        <button
          onClick={onClose}
          aria-label={t("close")}
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-xl rtl:right-auto rtl:left-4"
        >
          ×
        </button>

        {/* Hero icon */}
        <div className={`mx-auto w-20 h-20 rounded-3xl border-2 ${cat.tint} flex items-center justify-center text-4xl font-bold mb-3`}>
          {cat.emoji}
        </div>

        {/* Name */}
        <h2 className="text-2xl font-bold text-slate-900 text-center" dir={locale === "ar" ? "rtl" : "ltr"}>{primaryName}</h2>
        <p className="text-base text-slate-500 text-center mt-0.5" dir={locale === "ar" ? "ltr" : "rtl"}>{secondaryName}</p>

        {/* Meta row */}
        <div className="flex items-center justify-center gap-3 mt-3 text-sm text-slate-500">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cat.tint}`}>
            {t(cat.tkey)}
          </span>
          {floorLabel && (
            <span className="flex items-center gap-1">
              <span>📍</span>
              <span>{floorLabel}</span>
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="mt-5 space-y-2">
          <button
            onClick={onDirections}
            className="w-full flex items-center justify-center gap-3 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white font-semibold text-lg py-4 rounded-2xl shadow-md transition-colors"
          >
            <span className="text-xl">📍</span>
            <span>{t("directions")}</span>
          </button>
          <button
            onClick={onClose}
            className="w-full flex items-center justify-center gap-2 border-2 border-slate-200 hover:bg-slate-50 active:bg-slate-100 text-slate-700 font-medium py-3 rounded-2xl"
          >
            <span>{t("cancel")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
