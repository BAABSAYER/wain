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

export default function DirectionsCard({
  originName, destinationName, destinationNameAr, onEnd,
}: Props) {
  const { t, locale } = useLocale();
  const ar = locale === "ar";
  const primary = ar && destinationNameAr ? destinationNameAr : destinationName;
  const secondary = ar ? destinationName : destinationNameAr;

  return (
    <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
      {/* Origin → destination rows (LEAP layout) */}
      <div className="flex items-stretch">
        <div className="flex-1 py-4 px-5 min-w-0">
          <div className="flex items-center gap-3">
            <span className="w-6 h-6 rounded-full border-[3px] border-blue-500 flex-shrink-0" />
            <p className="text-base font-medium text-slate-700 truncate flex-1" dir={ar ? "rtl" : "ltr"}>{originName}</p>
          </div>
          <div className="my-1.5 ms-[11px] h-3 border-l-2 border-dotted border-slate-300" />
          <div className="flex items-center gap-3">
            <span className="w-6 h-6 flex items-center justify-center flex-shrink-0">
              <span className="block w-5 h-5 bg-red-500" style={{ clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" }} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-slate-900 truncate" dir={ar ? "rtl" : "ltr"}>{primary}</p>
              {secondary && (
                <p className="text-sm text-slate-500 truncate" dir={ar ? "ltr" : "rtl"}>{secondary}</p>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={onEnd}
          aria-label={t("endNavigation")}
          className="px-5 flex items-center justify-center text-red-500 hover:bg-red-50 active:bg-red-100 text-2xl font-semibold border-s border-slate-100"
        >
          ×
        </button>
      </div>

      {/* Follow-the-path hint (no ETA / minutes) */}
      <div className="bg-blue-50/70 border-t border-slate-100 px-5 py-2.5 text-sm text-blue-700 font-medium" dir={ar ? "rtl" : "ltr"}>
        {ar ? "اتبع المسار الأزرق إلى وجهتك" : "Follow the blue path to your destination"}
      </div>
    </div>
  );
}
