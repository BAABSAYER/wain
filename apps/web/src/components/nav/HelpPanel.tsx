"use client";
import { useLocale } from "@/lib/i18n";

interface Section { icon: string; title: { en: string; ar: string }; body: { en: string; ar: string }; }

const SECTIONS: Section[] = [
  {
    icon: "🔍",
    title: { en: "Find a place", ar: "ابحث عن مكان" },
    body: {
      en: "Use the search bar at the top, tap a Quick-access filter (Clinics, Pharmacy…), or open the Places tab to browse the full directory. You can also tap any room on the map.",
      ar: "استخدم شريط البحث في الأعلى، أو اضغط على فلتر الوصول السريع (العيادات، الصيدلية…)، أو افتح تبويب الأماكن لتصفّح الدليل الكامل. يمكنك أيضًا الضغط على أي غرفة في الخريطة.",
    },
  },
  {
    icon: "🧭",
    title: { en: "Get directions", ar: "احصل على الاتجاهات" },
    body: {
      en: "Pick a destination, then tap Directions. A blue path appears from your location (the pulsing blue dot) to your destination. Just follow the blue line.",
      ar: "اختر وجهتك ثم اضغط على الاتجاهات. سيظهر مسار أزرق من موقعك (النقطة الزرقاء النابضة) إلى وجهتك. ما عليك سوى اتباع الخط الأزرق.",
    },
  },
  {
    icon: "✋",
    title: { en: "Move the map", ar: "تحريك الخريطة" },
    body: {
      en: "Drag with one finger to pan. Pinch (or scroll) to zoom. Use two fingers (or right-drag) to rotate and tilt. Tap the ⌖ button to re-center on yourself.",
      ar: "اسحب بإصبع واحد للتحريك. اضغط بإصبعين (أو مرّر) للتكبير. استخدم إصبعين (أو السحب بالزر الأيمن) للتدوير والإمالة. اضغط زر ⌖ لإعادة التمركز على موقعك.",
    },
  },
  {
    icon: "🔑",
    title: { en: "Map symbols", ar: "رموز الخريطة" },
    body: {
      en: "Tap the key (🔑) button to see what every icon means — restrooms, elevators, stairs, prayer rooms, and the you-are-here / destination markers.",
      ar: "اضغط زر المفتاح (🔑) لمعرفة معنى كل رمز — دورات المياه، المصاعد، السلالم، المصليات، وعلامات موقعك ووجهتك.",
    },
  },
  {
    icon: "🌐",
    title: { en: "Language", ar: "اللغة" },
    body: {
      en: "Switch between Arabic and English anytime using the AR / EN toggle at the top of the map.",
      ar: "بدّل بين العربية والإنجليزية في أي وقت باستخدام زر AR / EN أعلى الخريطة.",
    },
  },
];

export default function HelpPanel() {
  const { t, locale } = useLocale();
  const ar = locale === "ar";

  return (
    <div className="absolute inset-0 z-20 bg-slate-50 flex flex-col" dir={ar ? "rtl" : "ltr"}>
      <div className="px-5 pt-4 pb-2">
        <h2 className="text-xl font-bold text-slate-900">{t("tabHelp")}</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          {ar ? "كيفية استخدام خريطة التنقّل" : "How to use the navigation map"}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-6 space-y-3">
        {SECTIONS.map((s, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-2xl p-4 flex gap-3">
            <span className="text-2xl flex-shrink-0">{s.icon}</span>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 text-base">{ar ? s.title.ar : s.title.en}</h3>
              <p className="text-sm text-slate-600 mt-1 leading-relaxed">{ar ? s.body.ar : s.body.en}</p>
            </div>
          </div>
        ))}

        <div className="text-center text-xs text-slate-400 pt-2">
          وين · {ar ? "نظام التنقّل الداخلي" : "Indoor Navigation"}
        </div>
      </div>
    </div>
  );
}
