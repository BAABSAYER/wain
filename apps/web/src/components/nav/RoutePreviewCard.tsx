"use client";
import { useLocale } from "@/lib/i18n";

interface Props {
  originName: string;
  destinationName: string;
  destinationNameAr?: string;
  estimatedMinutes: number | null;
  totalSteps: number | null;
  onStart: () => void;
  onCancel: () => void;
}

export default function RoutePreviewCard({
  originName, destinationName, destinationNameAr,
  estimatedMinutes, totalSteps, onStart, onCancel,
}: Props) {
  const { t, locale } = useLocale();
  const primary = locale === "ar" && destinationNameAr ? destinationNameAr : destinationName;
  const secondary = locale === "ar" ? destinationName : destinationNameAr;

  return (
    <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
      <div className="py-4 px-5">
        <div className="flex items-center gap-3">
          <span className="w-6 h-6 rounded-full border-[3px] border-blue-500 flex-shrink-0" />
          <p className="text-base font-medium text-slate-700 truncate">{originName}</p>
        </div>
        <div className="my-1.5 ms-[11px] h-3 border-l-2 border-dotted border-slate-300" />
        <div className="flex items-center gap-3">
          <span className="w-6 h-6 flex items-center justify-center flex-shrink-0">
            <span className="block w-5 h-5 bg-red-500" style={{ clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" }} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-slate-900 truncate" dir={locale === "ar" ? "rtl" : "ltr"}>{primary}</p>
            {secondary && (
              <p className="text-sm text-slate-500 truncate" dir={locale === "ar" ? "ltr" : "rtl"}>{secondary}</p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-blue-50/70 border-t border-slate-100 px-5 py-2.5 flex items-center gap-4 text-sm">
        <div className="flex items-center gap-2 text-blue-700 font-semibold">
          <span className="text-lg">⏱</span>
          <span>{estimatedMinutes ?? "—"} {t("routeMinWalk")}</span>
        </div>
        {totalSteps !== null && (
          <>
            <span className="text-slate-300">·</span>
            <div className="flex items-center gap-2 text-slate-600">
              <span>📍</span>
              <span>{totalSteps} {t("routeWaypoints")}</span>
            </div>
          </>
        )}
      </div>

      <div className="px-4 py-3 flex gap-2 border-t border-slate-100">
        <button
          onClick={onCancel}
          className="flex-1 py-3 px-4 rounded-2xl border-2 border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 active:bg-slate-100 transition-colors"
        >
          {t("cancel")}
        </button>
        <button
          onClick={onStart}
          className="flex-[2] py-3 px-4 rounded-2xl bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white font-bold text-lg flex items-center justify-center gap-2 shadow-md transition-colors"
        >
          <span>▶</span>
          <span>{t("start")}</span>
        </button>
      </div>
    </div>
  );
}
