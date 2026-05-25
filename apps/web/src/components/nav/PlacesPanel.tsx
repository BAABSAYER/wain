"use client";
import { useState, useMemo } from "react";
import { useLocale } from "@/lib/i18n";
import { categoryGlyph, isOpenSpace } from "@/lib/category-icons";

interface StoreLite {
  id: string; name: string; nameAr: string; category: string;
  zone?: string | null; zoneAr?: string | null;
}
interface FloorLite {
  id: string; name: string; nameAr?: string; level: number; stores: StoreLite[];
}

interface Props {
  floors: FloorLite[];
  onSelect: (floorId: string, store: StoreLite) => void;
}

export default function PlacesPanel({ floors, onSelect }: Props) {
  const { t, locale } = useLocale();
  const ar = locale === "ar";
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return floors
      .slice()
      .sort((a, b) => b.level - a.level)
      .map((f) => {
        const stores = f.stores
          .filter((s) => !isOpenSpace(s.category))
          .filter((s) => !ql || s.name.toLowerCase().includes(ql) || s.nameAr.includes(q.trim()))
          .sort((a, b) => a.name.localeCompare(b.name));
        return { floor: f, stores };
      })
      .filter((g) => g.stores.length > 0);
  }, [floors, q]);

  return (
    <div className="absolute inset-0 z-20 bg-slate-50 flex flex-col" dir={ar ? "rtl" : "ltr"}>
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-xl font-bold text-slate-900">{t("tabPlaces")}</h2>
        <div className="relative mt-3">
          <span className="absolute top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none start-4">⌕</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full bg-white border border-slate-200 rounded-full ps-12 pe-4 py-3 text-base placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 shadow-sm"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {groups.length === 0 && (
          <p className="text-center text-slate-400 py-10">{t("noResults")}</p>
        )}
        {groups.map((g) => (
          <div key={g.floor.id} className="mb-4">
            <div className="sticky top-0 bg-slate-50 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
              {ar && g.floor.nameAr ? g.floor.nameAr : g.floor.name}
            </div>
            <div className="space-y-2 mt-1">
              {g.stores.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onSelect(g.floor.id, s)}
                  className="w-full flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-2xl hover:border-blue-300 hover:bg-blue-50/40 active:bg-blue-50 transition-colors text-start"
                >
                  <span className="w-10 h-10 flex items-center justify-center bg-slate-100 rounded-xl text-lg flex-shrink-0">
                    {categoryGlyph(s.category)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-base text-slate-900 truncate">
                      {ar ? s.nameAr : s.name}
                    </div>
                    <div className="text-sm text-slate-500 truncate" dir={ar ? "ltr" : "rtl"}>
                      {ar ? s.name : s.nameAr}
                    </div>
                    {(ar ? s.zoneAr : s.zone) && (
                      <div className="text-xs text-slate-400 mt-0.5">{ar ? s.zoneAr : s.zone}</div>
                    )}
                  </div>
                  <span className="text-slate-400 text-xl flex-shrink-0">{ar ? "‹" : "›"}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
