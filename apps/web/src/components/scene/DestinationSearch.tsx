"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { api } from "@/lib/api";

interface Props {
  buildingId: string;
  onSelect: (storeId: string, storeName: string, storeNameAr: string) => void;
  destinationName: string | null;
  destinationNameAr: string | null;
  estimatedMinutes: number | null;
  totalSteps: number | null;
  onClear: () => void;
}

interface StoreSearchResult {
  id: string;
  name: string;
  nameAr: string;
  category: string;
  floor?: { id: string; name: string; nameAr?: string };
}

// ─── Category meta ───────────────────────────────────────────────────────────

const CATEGORIES: Array<{
  key: string;
  label: string;
  labelAr: string;
  icon: string;
  color: string;
}> = [
  { key: "medical",   label: "Clinics",    labelAr: "العيادات",   icon: "⚕",  color: "bg-rose-500/20 text-rose-300 border-rose-500/30" },
  { key: "services",  label: "Reception",  labelAr: "الاستقبال",  icon: "ⓘ",  color: "bg-sky-500/20 text-sky-300 border-sky-500/30" },
  { key: "retail",    label: "Pharmacy",   labelAr: "صيدلية",     icon: "℞",  color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  { key: "food",      label: "Cafeteria",  labelAr: "الكافتيريا", icon: "☕", color: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  { key: "restroom",  label: "Restrooms",  labelAr: "دورات المياه", icon: "WC", color: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30" },
  { key: "elevator",  label: "Elevators",  labelAr: "المصاعد",    icon: "▦",  color: "bg-violet-500/20 text-violet-300 border-violet-500/30" },
];

const CATEGORY_GLYPH: Record<string, string> = {
  medical: "⚕", services: "ⓘ", retail: "℞", food: "☕",
  restroom: "WC", restroom_male: "M", restroom_female: "F", elevator: "▦", stairs: "↗", escalator: "⇅",
  entrance: "⌂", parking: "🅿", education: "🎓", other: "•",
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function DestinationSearch({
  buildingId,
  onSelect,
  destinationName,
  destinationNameAr,
  estimatedMinutes,
  totalSteps,
  onClear,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StoreSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const runSearch = useCallback(
    (q: string) => {
      clearTimeout(debounceRef.current);
      if (!q.trim()) { setResults([]); setLoading(false); return; }
      setLoading(true);
      debounceRef.current = setTimeout(async () => {
        try {
          const data = await api.searchStores(buildingId, q);
          setResults(data);
        } catch { setResults([]); }
        finally { setLoading(false); }
      }, 250);
    },
    [buildingId],
  );

  useEffect(() => { runSearch(query); }, [query, runSearch]);

  const selectStore = (s: StoreSearchResult) => {
    onSelect(s.id, s.name, s.nameAr);
    setQuery("");
    setResults([]);
    setExpanded(false);
  };

  const selectCategory = async (cat: string) => {
    setLoading(true);
    try {
      const data = await api.searchStores(buildingId, cat);
      setResults(data);
      setExpanded(true);
    } finally { setLoading(false); }
  };

  // ─── ACTIVE NAVIGATION CARD (when a destination is set) ───────────────────
  if (destinationName) {
    return (
      <div className="absolute bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-xl border-t-2 border-brand-500/40 rounded-t-3xl shadow-2xl">
        <div className="px-5 pt-4 pb-6">
          {/* Top row: ETA + clear */}
          <div className="flex items-center gap-4 mb-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                Navigating to · الوجهة
              </p>
              <p className="font-bold text-2xl text-white truncate mt-1">{destinationName}</p>
              {destinationNameAr && (
                <p className="text-slate-300 text-lg truncate" dir="rtl">{destinationNameAr}</p>
              )}
            </div>
            <button
              onClick={onClear}
              aria-label="End navigation"
              className="flex flex-col items-center justify-center w-16 h-16 bg-red-500/20 hover:bg-red-500/30 active:bg-red-500/40 border-2 border-red-500/40 text-red-300 rounded-2xl transition-colors"
            >
              <span className="text-2xl leading-none">×</span>
              <span className="text-[10px] mt-0.5 font-medium">End</span>
            </button>
          </div>

          {/* ETA + steps row */}
          <div className="flex items-center gap-3 mb-2">
            <div className="flex-1 bg-brand-500/10 border border-brand-500/30 rounded-2xl p-4 flex items-center gap-3">
              <div className="text-4xl">⏱</div>
              <div>
                <p className="text-3xl font-bold text-brand-300 leading-none">
                  {estimatedMinutes ?? "—"}<span className="text-lg font-medium text-brand-400 ml-1">min</span>
                </p>
                <p className="text-xs text-slate-400 mt-1">Estimated walk · المدة المتوقعة</p>
              </div>
            </div>
            {totalSteps !== null && (
              <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-4 text-center min-w-[88px]">
                <p className="text-2xl font-bold text-slate-200 leading-none">{totalSteps}</p>
                <p className="text-[10px] text-slate-400 mt-1 uppercase">steps</p>
              </div>
            )}
          </div>

          <p className="text-center text-sm text-slate-400 mt-3">
            Follow the blue path · اتبع المسار الأزرق
          </p>
        </div>
      </div>
    );
  }

  // ─── IDLE STATE (search + categories) ─────────────────────────────────────
  return (
    <div
      className={`absolute bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-xl border-t-2 border-slate-700/50 rounded-t-3xl shadow-2xl transition-[max-height] duration-300 ${
        expanded ? "max-h-[80vh]" : "max-h-[50vh]"
      } overflow-hidden`}
    >
      <div className="px-5 pt-3 pb-6 overflow-y-auto max-h-[80vh]">
        {/* drag handle */}
        <button
          onClick={() => setExpanded(!expanded)}
          aria-label="Toggle panel"
          className="block mx-auto w-14 h-1.5 bg-slate-600 hover:bg-slate-500 rounded-full mb-4"
        />

        {/* Heading */}
        <div className="mb-4 text-center">
          <h2 className="text-2xl font-bold text-white">Where to?</h2>
          <p className="text-base text-slate-400 mt-0.5" dir="rtl">إلى أين تريد الذهاب؟</p>
        </div>

        {/* Search input — big */}
        <div className="relative mb-5">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-2xl pointer-events-none">⌕</span>
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setExpanded(true); }}
            onFocus={() => setExpanded(true)}
            placeholder="Search… ابحث"
            className="w-full bg-slate-800 border-2 border-slate-700 focus:border-brand-500 rounded-2xl pl-14 pr-12 py-4 text-lg placeholder-slate-500 outline-none transition-colors text-white"
          />
          {query && (
            <button
              onClick={() => { setQuery(""); setResults([]); }}
              aria-label="Clear"
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-slate-400 hover:text-white text-2xl"
            >
              ×
            </button>
          )}
          {loading && (
            <div className="absolute right-12 top-1/2 -translate-y-1/2 w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          )}
        </div>

        {/* Quick category tiles (only when nothing typed) */}
        {!query && (
          <>
            <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3 px-1">
              Quick access · وصول سريع
            </p>
            <div className="grid grid-cols-3 gap-3 mb-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => selectCategory(cat.key)}
                  className={`flex flex-col items-center justify-center gap-1.5 py-4 px-2 rounded-2xl border-2 ${cat.color} active:scale-95 transition-transform`}
                >
                  <span className="text-3xl leading-none">{cat.icon}</span>
                  <span className="text-xs font-semibold leading-tight">{cat.label}</span>
                  <span className="text-[10px] opacity-80 leading-tight" dir="rtl">{cat.labelAr}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Results list */}
        {results.length > 0 && (
          <div className="mt-4 space-y-2">
            {results.map((s) => (
              <button
                key={s.id}
                onClick={() => selectStore(s)}
                className="w-full flex items-center gap-4 p-4 bg-slate-800/80 hover:bg-slate-700 active:bg-slate-600 border border-slate-700 rounded-2xl text-left transition-colors"
              >
                <span className="w-12 h-12 flex items-center justify-center text-2xl bg-slate-700/70 rounded-xl flex-shrink-0">
                  {CATEGORY_GLYPH[s.category] ?? "•"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-lg text-white truncate">{s.name}</div>
                  <div className="text-sm text-slate-300 truncate" dir="rtl">{s.nameAr}</div>
                  {s.floor && (
                    <div className="text-xs text-slate-500 mt-0.5">📍 {s.floor.name}</div>
                  )}
                </div>
                <span className="text-slate-400 text-2xl flex-shrink-0">›</span>
              </button>
            ))}
          </div>
        )}

        {/* Empty state */}
        {query.length > 0 && results.length === 0 && !loading && (
          <div className="text-center py-6">
            <p className="text-slate-400 text-base">No results for "{query}"</p>
            <p className="text-slate-500 text-sm mt-1" dir="rtl">لا توجد نتائج</p>
          </div>
        )}
      </div>
    </div>
  );
}
