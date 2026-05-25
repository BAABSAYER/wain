"use client";
import { useLocale } from "@/lib/i18n";

interface Props {
  destinationName: string;
  destinationNameAr?: string;
  currentStep: number;            // 0-indexed
  totalSteps: number;
  remainingMinutes: number;
  arrived: boolean;
  autoAdvance: boolean;
  onNext: () => void;
  onPrev: () => void;
  onToggleAutoAdvance: () => void;
  onEnd: () => void;
}

export default function NavigationProgressCard({
  destinationName, destinationNameAr,
  currentStep, totalSteps, remainingMinutes,
  arrived, autoAdvance,
  onNext, onPrev, onToggleAutoAdvance, onEnd,
}: Props) {
  const { t, locale, isRTL } = useLocale();
  const progress = totalSteps > 1 ? Math.min(100, (currentStep / (totalSteps - 1)) * 100) : 100;
  const primary = locale === "ar" && destinationNameAr ? destinationNameAr : destinationName;

  if (arrived) {
    return (
      <div className="bg-white rounded-2xl shadow-lg border-2 border-green-300 overflow-hidden">
        <div className="bg-green-500 px-4 py-2.5 text-white flex items-center gap-3">
          <span className="text-2xl">🎉</span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-base leading-tight">{t("arrived")}</p>
            <p className="text-xs opacity-90 truncate">{t("welcomeTo")} {primary}</p>
          </div>
          <button
            onClick={onEnd}
            className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg font-semibold text-sm"
          >
            {t("done")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
      {/* Row 1: destination + ETA + close */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
        <span className="text-blue-500 text-base flex-shrink-0">{isRTL ? "←" : "→"}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-900 truncate leading-tight" dir={locale === "ar" ? "rtl" : "ltr"}>{primary}</p>
          <p className="text-[11px] text-slate-500 truncate leading-tight">{t("headingTo")}</p>
        </div>
        <div className="flex items-center gap-1 text-blue-600 font-semibold text-sm flex-shrink-0">
          <span>⏱</span>
          <span>{remainingMinutes}{t("minute")}</span>
        </div>
        <button
          onClick={onEnd}
          aria-label={t("endNavigation")}
          className="w-8 h-8 flex items-center justify-center rounded-full text-red-500 hover:bg-red-50 text-xl leading-none"
        >×</button>
      </div>

      {/* Row 2: progress bar + step counter + inline controls */}
      <div className="px-3 py-2 bg-slate-50/80 flex items-center gap-2">
        <span className="text-[11px] font-semibold text-blue-600 flex-shrink-0">
          {currentStep + 1}/{totalSteps}
        </span>
        <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <button
          onClick={onPrev}
          disabled={currentStep <= 0}
          aria-label={t("previous")}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-slate-200 text-slate-700 text-base disabled:opacity-30 hover:bg-slate-50"
        >{isRTL ? "›" : "‹"}</button>
        <button
          onClick={onToggleAutoAdvance}
          aria-label={autoAdvance ? t("pause") : t("autoWalk")}
          className={`w-8 h-8 flex items-center justify-center rounded-full text-base ${
            autoAdvance
              ? "bg-blue-500 text-white hover:bg-blue-600"
              : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
          }`}
        >
          {autoAdvance ? "⏸" : "▶"}
        </button>
        <button
          onClick={onNext}
          aria-label={t("next")}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-500 text-white text-base hover:bg-blue-600"
        >{isRTL ? "‹" : "›"}</button>
      </div>
    </div>
  );
}
