"use client";
import { useLocale } from "@/lib/i18n";

interface Props {
  className?: string;
}

export default function LocaleToggle({ className = "" }: Props) {
  const { locale, setLocale } = useLocale();

  return (
    <div className={`inline-flex bg-white border border-slate-200 rounded-full p-0.5 shadow-sm ${className}`}>
      <button
        onClick={() => setLocale("en")}
        aria-pressed={locale === "en"}
        aria-label="Switch to English"
        className={`px-3 py-1 text-xs font-bold rounded-full transition-colors ${
          locale === "en" ? "bg-blue-500 text-white" : "text-slate-600 hover:text-slate-900"
        }`}
      >
        EN
      </button>
      <button
        onClick={() => setLocale("ar")}
        aria-pressed={locale === "ar"}
        aria-label="التبديل إلى العربية"
        className={`px-3 py-1 text-xs font-bold rounded-full transition-colors ${
          locale === "ar" ? "bg-blue-500 text-white" : "text-slate-600 hover:text-slate-900"
        }`}
      >
        AR
      </button>
    </div>
  );
}
