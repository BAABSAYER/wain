/**
 * Assigns `zone` / `zoneAr` to existing stores IN PLACE (preserves all IDs and
 * QR URLs — no re-seed). Groups rooms into departments so the visitor map can
 * draw big LEAP-style zone pills.
 *
 *   Run: node scripts/assign-zones.mjs
 */

const API = process.env.WAIN_API_URL || "http://localhost:4000/api";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "wain-admin";
let TOKEN = "";

async function login() {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login failed (${res.status}). Set ADMIN_PASSWORD if you changed it.`);
  TOKEN = (await res.json()).token;
}

async function req(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

// Department code prefix → friendly zone name (hospitals: Saud-1 etc.)
const ZONE_BY_CODE = [
  ["M.S.1",   { en: "Men's Surgery 1",  ar: "جراحة رجال ١" }],
  ["M.S.2",   { en: "Men's Surgery 2",  ar: "جراحة رجال ٢" }],
  ["M.M.W",   { en: "Internal Medicine", ar: "باطنية رجال" }],
  ["P.I.C.U", { en: "Pediatric ICU",    ar: "العناية المركزة للأطفال" }],
  ["P.D",     { en: "Pediatrics",       ar: "قسم الأطفال" }],
  ["F.S.W",   { en: "Women's Surgery",  ar: "جراحة نساء" }],
  ["CCU",     { en: "Cardiac Care",     ar: "العناية القلبية" }],
  ["VIP",     { en: "VIP Ward",         ar: "جناح كبار الشخصيات" }],
];

// Mall category → coarse zone (fallback when no department code matches)
const ZONE_BY_CATEGORY = {
  food:        { en: "Food & Dining",  ar: "المطاعم والمقاهي" },
  retail:      { en: "Shops",          ar: "المتاجر" },
  entertainment:{ en: "Entertainment", ar: "الترفيه" },
};

// Categories that should NOT get a zone pill (they get amenity icons instead)
const AMENITY_CATS = new Set(["restroom", "elevator", "stairs", "escalator", "entrance", "parking", "other"]);

function deriveZone(store) {
  const name = store.name || "";
  for (const [code, z] of ZONE_BY_CODE) {
    if (name.startsWith(code)) return z;
  }
  if (AMENITY_CATS.has(store.category)) return null;
  // Prayer / services that are amenities → no zone
  if (store.category === "services") {
    if (/prayer|مصل|nurse|تمريض|meeting|اجتماع|information|معلومات|atm|صراف|customer|عملاء/i.test(`${store.name} ${store.nameAr}`)) {
      return null;
    }
  }
  return ZONE_BY_CATEGORY[store.category] ?? null;
}

async function main() {
  console.log("🏷️   Assigning zones to existing stores…\n");
  await login();
  const buildings = await req("GET", "/buildings");
  let patched = 0, skipped = 0;

  for (const b of buildings) {
    const full = await req("GET", `/buildings/${b.id}`);
    console.log(`\n${b.name}`);
    for (const floor of full.floors ?? []) {
      for (const s of floor.stores ?? []) {
        const z = deriveZone(s);
        if (!z) { skipped++; continue; }
        await req("PATCH", `/stores/${s.id}`, { zone: z.en, zoneAr: z.ar });
        patched++;
        process.stdout.write(`  ✓ ${s.name}  →  ${z.en}\n`);
      }
    }
  }

  console.log(`\n✅  Done. ${patched} stores zoned, ${skipped} left unzoned (amenities/ungrouped).`);
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
