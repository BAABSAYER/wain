"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { useLocale, type TKey } from "@/lib/i18n";

interface StoreResult {
  id: string;
  name: string;
  nameAr: string;
  category: string;
  floor?: { id: string; name: string; nameAr?: string };
}

interface Props {
  buildingId: string;
  onSelect: (storeId: string, storeName: string, storeNameAr: string) => void;
  activeFilter: string;
  onFilterChange: (filter: string) => void;
}

const FILTERS: Array<{ key: string; tkey: TKey }> = [
  { key: "all",      tkey: "filterAll" },
  { key: "medical",  tkey: "filterClinics" },
  { key: "services", tkey: "filterServices" },
  { key: "retail",   tkey: "filterPharmacy" },
  { key: "food",     tkey: "filterFood" },
  { key: "restroom", tkey: "filterRestrooms" },
];

export default function SearchBar({ buildingId, onSelect, activeFilter, onFilterChange }: Props) {
  const { t, locale } = useLocale();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StoreResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const run = useCallback((q: string) => {
    clearTimeout(debounceRef.current);
    if (!q.trim()) { setResults([]); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await api.searchStores(buildingId, q);
        setResults(data);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 220);
  }, [buildingId]);

  useEffect(() => { run(query); }, [query, run]);

  const select = (s: StoreResult) => {
    onSelect(s.id, s.name, s.nameAr);
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  return (
    <div className="space-y-2">
      {/* Search pill */}
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl pointer-events-none rtl:left-auto rtl:right-4">⌕</span>
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={t("searchPlaceholder")}
          dir={locale === "ar" ? "rtl" : "ltr"}
          className="w-full bg-white border border-slate-200 rounded-full pl-12 pr-12 py-3.5 text-base placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 shadow-md rtl:pl-12 rtl:pr-12"
        />
        {query && (
          <button
            onClick={() => { setQuery(""); setResults([]); }}
            aria-label={t("clear")}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-slate-400 hover:text-slate-700 text-xl rtl:right-auto rtl:left-3"
          >
            ×
          </button>
        )}
        {loading && (
          <div className="absolute right-12 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin rtl:right-auto rtl:left-12" />
        )}
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
        {FILTERS.map((f) => {
          const active = activeFilter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => onFilterChange(f.key)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
                active
                  ? "bg-blue-500 text-white border-blue-500 shadow-sm"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
            >
              {t(f.tkey)}
            </button>
          );
        })}
      </div>

      {/* Search results dropdown */}
      {open && results.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xl divide-y divide-slate-100 max-h-80 overflow-y-auto">
          {results.map((s) => (
            <button
              key={s.id}
              onClick={() => select(s)}
              className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 active:bg-slate-100 text-left rtl:text-right transition-colors"
            >
              <span className="w-10 h-10 flex items-center justify-center bg-slate-100 rounded-xl text-slate-500 text-lg flex-shrink-0">
                📍
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-base text-slate-900 truncate">
                  {locale === "ar" ? s.nameAr : s.name}
                </div>
                <div className="text-sm text-slate-500 truncate" dir={locale === "ar" ? "ltr" : "rtl"}>
                  {locale === "ar" ? s.name : s.nameAr}
                </div>
                {s.floor && (
                  <div className="text-xs text-slate-400 mt-0.5">
                    {locale === "ar" && s.floor.nameAr ? s.floor.nameAr : s.floor.name}
                  </div>
                )}
              </div>
              <span className="text-slate-400 text-xl flex-shrink-0">
                {locale === "ar" ? "‹" : "›"}
              </span>
            </button>
          ))}
        </div>
      )}

      {open && query.length > 0 && results.length === 0 && !loading && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-md p-4 text-center">
          <p className="text-slate-500 text-sm">{t("noResults")}: "{query}"</p>
        </div>
      )}
    </div>
  );
}
