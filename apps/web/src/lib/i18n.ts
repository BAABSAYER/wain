"use client";
import { useCallback, useEffect, useSyncExternalStore } from "react";

export type Locale = "en" | "ar";

const STORAGE_KEY = "wain.locale";

const TRANSLATIONS = {
  // ── Generic ──
  loading:               { en: "Loading…",              ar: "جاري التحميل…" },
  loadingMap:            { en: "Loading map…",          ar: "جاري تحميل الخريطة…" },
  cancel:                { en: "Cancel",                ar: "إلغاء" },
  done:                  { en: "Done",                  ar: "إنهاء" },
  close:                 { en: "Close",                 ar: "إغلاق" },
  back:                  { en: "Back",                  ar: "رجوع" },
  retry:                 { en: "Retry",                 ar: "إعادة المحاولة" },
  minute:                { en: "min",                   ar: "د" },
  step:                  { en: "Step",                  ar: "خطوة" },
  of:                    { en: "of",                    ar: "من" },
  yes:                   { en: "Yes",                   ar: "نعم" },
  no:                    { en: "No",                    ar: "لا" },

  // ── Error / not-found pages ──
  errMapNotFound:        { en: "Map not found",         ar: "لم يتم العثور على الخريطة" },
  errScanAgain:          { en: "Please scan the QR code inside the building.", ar: "يرجى مسح رمز الاستجابة السريعة داخل المبنى." },
  errInvalidScan:        { en: "Invalid QR scan point", ar: "نقطة مسح غير صالحة" },
  errInvalidScanDesc:    { en: "The scan ID in this link does not match any entry point in this building.", ar: "معرّف المسح في هذا الرابط لا يطابق أي نقطة دخول في هذا المبنى." },
  errCouldNotGetDir:     { en: "Could not get directions", ar: "تعذّر الحصول على الاتجاهات" },
  errBuildingNotFound:   { en: "Building not found. Please scan the QR code again.", ar: "لم يتم العثور على المبنى. يرجى مسح الرمز مرة أخرى." },
  errSceneError:         { en: "3D scene error",        ar: "خطأ في عرض الخريطة ثلاثية الأبعاد" },

  // ── Floor / location ──
  floor:                 { en: "Floor",                 ar: "الطابق" },
  groundFloor:           { en: "Ground",                ar: "أرضي" },
  youAreHere:            { en: "You are here",          ar: "أنت هنا" },

  // ── Search bar ──
  searchPlaceholder:     { en: "Search…",               ar: "ابحث…" },
  clear:                 { en: "Clear",                 ar: "مسح" },
  noResults:             { en: "No results",            ar: "لا توجد نتائج" },
  filterAll:             { en: "View All",              ar: "الكل" },
  filterClinics:         { en: "Clinics",               ar: "العيادات" },
  filterServices:        { en: "Services",              ar: "خدمات" },
  filterPharmacy:        { en: "Pharmacy",              ar: "صيدلية" },
  filterFood:            { en: "Food",                  ar: "طعام" },
  filterRestrooms:       { en: "Restrooms",             ar: "دورات" },

  // ── Place detail sheet ──
  directions:            { en: "Directions",            ar: "الاتجاهات" },
  catClinic:             { en: "Clinic",                ar: "عيادة" },
  catPharmacy:           { en: "Pharmacy",              ar: "صيدلية" },
  catFood:               { en: "Food",                  ar: "طعام" },
  catService:            { en: "Service",               ar: "خدمة" },
  catRestroom:           { en: "Restroom",              ar: "دورة مياه" },
  catElevator:           { en: "Elevator",              ar: "مصعد" },
  catEntrance:           { en: "Entrance",              ar: "مدخل" },
  catPlace:              { en: "Place",                 ar: "مكان" },

  // ── Route preview card ──
  routeMinWalk:          { en: "min walk",              ar: "د سيرًا" },
  routeWaypoints:        { en: "waypoints",             ar: "نقاط" },
  start:                 { en: "Start",                 ar: "ابدأ" },

  // ── Navigation progress card ──
  headingTo:             { en: "Heading to",            ar: "متجه إلى" },
  arrived:               { en: "You have arrived!",     ar: "لقد وصلت!" },
  welcomeTo:             { en: "Welcome to",            ar: "مرحبًا بك في" },
  previous:              { en: "Previous",              ar: "السابق" },
  next:                  { en: "Next",                  ar: "التالي" },
  autoWalk:              { en: "Auto-walk",             ar: "تشغيل تلقائي" },
  pause:                 { en: "Pause",                 ar: "إيقاف مؤقت" },
  endNavigation:         { en: "End navigation",        ar: "إنهاء التنقل" },
  minLeft:               { en: "min left",              ar: "د متبقية" },

  // ── Bottom tab bar ──
  tabMap:                { en: "Map",                   ar: "الخريطة" },
  tabPlaces:             { en: "Places",                ar: "الأماكن" },
  tabHelp:               { en: "Help",                  ar: "مساعدة" },

  // ── Search header ──
  whereTo:               { en: "Where to?",             ar: "إلى أين؟" },
  quickAccess:           { en: "Quick access",          ar: "وصول سريع" },
} as const;

export type TKey = keyof typeof TRANSLATIONS;

/** Synchronous lookup that doesn't need the hook. Use only when locale is known. */
export function t(key: TKey, locale: Locale): string {
  return TRANSLATIONS[key][locale];
}

// ─── Shared locale store (module-level) ──────────────────────────────────────
// A single source of truth shared by EVERY component, so toggling the language
// in one place updates the whole app at once. (Previously each useLocale() had
// its own useState, so switching only updated the toggle itself.)
let currentLocale: Locale = "en";
let initialized = false;
const listeners = new Set<() => void>();

function emit() { listeners.forEach((l) => l()); }
function subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }
function getSnapshot(): Locale { return currentLocale; }
function getServerSnapshot(): Locale { return "en"; }

export function setGlobalLocale(next: Locale) {
  if (next === currentLocale) return;
  currentLocale = next;
  if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, next);
  emit();
}

/** React hook: returns current locale, setter, and translator. Shared globally. */
export function useLocale() {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // One-time client init from localStorage (after hydration → no SSR mismatch).
  useEffect(() => {
    if (initialized) return;
    initialized = true;
    const stored = window.localStorage.getItem(STORAGE_KEY) as Locale | null;
    if ((stored === "ar" || stored === "en") && stored !== currentLocale) {
      currentLocale = stored;
      emit();
    }
  }, []);

  // Keep <html dir> + <html lang> in sync so RTL layout + screen readers work.
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);

  const setLocale = useCallback((next: Locale) => setGlobalLocale(next), []);
  const toggle = useCallback(() => setGlobalLocale(currentLocale === "ar" ? "en" : "ar"), []);
  const translator = useCallback((key: TKey) => TRANSLATIONS[key][locale], [locale]);

  return { locale, setLocale, toggle, t: translator, isRTL: locale === "ar" };
}
