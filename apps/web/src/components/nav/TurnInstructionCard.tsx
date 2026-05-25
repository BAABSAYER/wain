"use client";
import { useLocale } from "@/lib/i18n";
import { dirArrow, dirLabel, type TurnDir } from "@/lib/turn-by-turn";

interface Props {
  dir: TurnDir;
  distanceMeters: number;
  /** Name of the landmark/room you'll arrive at after this turn. */
  landmark?: string | null;
}

export default function TurnInstructionCard({ dir, distanceMeters, landmark }: Props) {
  const { locale } = useLocale();
  const en = locale === "en";
  const label = dirLabel(dir, en);
  const arrow = dirArrow(dir);
  const distanceText =
    dir === "arrive"
      ? (en ? `${Math.round(distanceMeters)}m to destination` : `${Math.round(distanceMeters)} م إلى الوجهة`)
      : (en ? `In ${Math.round(distanceMeters)}m` : `بعد ${Math.round(distanceMeters)} م`);

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 px-4 py-3 flex items-center gap-3">
      <div className="w-12 h-12 rounded-xl bg-blue-500 text-white flex items-center justify-center text-3xl font-bold flex-shrink-0">
        {arrow}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{distanceText}</p>
        <p className="text-base font-bold text-slate-900 leading-tight truncate">{label}</p>
        {landmark && (
          <p className="text-xs text-slate-500 truncate">
            {en ? "near" : "بالقرب من"} <span className="font-medium text-slate-700">{landmark}</span>
          </p>
        )}
      </div>
    </div>
  );
}
