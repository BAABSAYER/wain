"use client";
import { useLocale } from "@/lib/i18n";

interface Props {
  originName: string;
  destinationName: string;
  destinationNameAr?: string;
  estimatedMinutes: number | null;
  totalSteps: number | null;
  onEnd: () => void;
}

// Slim, Google-Maps-style "now navigating" pill. Shows only the destination
// (origin is implicitly "you are here") and a compact End button — the route
// itself is on the map, so no extra hints or connector lines steal vertical
// space.
export default function DirectionsCard({
  destinationName, destinationNameAr, onEnd,
}: Props) {
  const { t, locale } = useLocale();
  const ar = locale === "ar";
  const primary = ar
    ? destinationNameAr || destinationName
    : destinationName || destinationNameAr || "";
  const alternate = ar ? destinationName : destinationNameAr;
  const secondary = alternate && alternate !== primary ? alternate : "";

  return (
    <div
      className="bg-white rounded-2xl shadow-xl border border-slate-200 px-3 py-2.5 flex items-center gap-3"
      dir={ar ? "rtl" : "ltr"}
    >
      {/* destination marker — small tinted square instead of a free diamond,
          so it reads as a single visual unit with the text */}
      <span className="w-9 h-9 rounded-lg bg-red-50 border-2 border-red-200 flex items-center justify-center flex-shrink-0">
        <span
          className="block w-4 h-4 bg-red-500"
          style={{ clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" }}
        />
      </span>

      {/* names — primary bold, bilingual secondary in a small line below */}
      <div className="flex-1 min-w-0">
        <p className="text-base font-bold text-slate-900 truncate leading-tight" dir={ar ? "rtl" : "ltr"}>
          {primary}
        </p>
        {secondary && (
          <p className="text-xs text-slate-500 truncate leading-tight mt-0.5" dir={ar ? "ltr" : "rtl"}>
            {secondary}
          </p>
        )}
      </div>

      {/* End navigation */}
      <button
        onClick={onEnd}
        aria-label={t("endNavigation")}
        className="w-9 h-9 rounded-full bg-slate-100 hover:bg-red-50 active:bg-red-100 text-red-500 flex items-center justify-center text-xl font-semibold leading-none flex-shrink-0 transition-colors"
      >
        ×
      </button>
    </div>
  );
}
