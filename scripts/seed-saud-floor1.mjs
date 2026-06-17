/**
 * Saud-1 — Floor 1 (extracted from wall map photo)
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  M.S.1   │   M.S.2   │       M.M.W    │ باطنية رجال      │
 *   ├──────────────────────────────────────────────────────────┤
 *   │ 1-3 │ 10-11│  Court  │ 9-10 │  Court  │ 1-10 │  PRY  │7-10│
 *   │     │      │  Yard 1 │      │  Yard 2 │      │ Area  │    │
 *   ├──────────────────────────────────────────────────────────┤
 *   │ PICU│ P.D  │  Court  │ F.S.W │  Court  │  ... │  VIP  │CCU │
 *   ├──────────────────────────────────────────────────────────┤
 *   │P.I.C.U│  P.D 4-10  │  F.S.W 1-9   │ PRISON │  CCU 6,7   │
 *   └──────────────────────────────────────────────────────────┘
 *
 *   WAIN_API_URL=http://localhost:8787/api ADMIN_PASSWORD=testadmin \
 *     node scripts/seed-saud-floor1.mjs
 *
 * Adds a new Floor 1 to the existing "saud-1" building (creates the building
 * if missing). Refuses to run if a level-1 floor already exists so re-runs
 * never silently duplicate rooms.
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
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`${method} ${path} → ${res.status}: ${t}`); }
  return res.json();
}

// ── Floor canvas dimensions ─────────────────────────────────────────────
const W = 2000;
const H = 1400;

// ── Department palette (matches the wall map's colours) ─────────────────
const Z = {
  ms1:  { code: "M.S.1",     ar: "جراحة رجال 1",       color: "#8aa7ff" },
  ms2:  { code: "M.S.2",     ar: "جراحة رجال 2",       color: "#6ddcd0" },
  mmw:  { code: "M.M.W",     ar: "باطنية رجال",        color: "#f7c977" },
  pd:   { code: "P.D",       ar: "قسم الأطفال",        color: "#fde481" },
  picu: { code: "P.I.C.U.",  ar: "العناية المركزة للأطفال", color: "#fbcd44" },
  fsw:  { code: "F.S.W",     ar: "جراحة نساء",         color: "#f8b6c0" },
  vip:  { code: "VIP",       ar: "كبار الشخصيات",      color: "#7ab3ee" },
  ccu:  { code: "CCU",       ar: "العناية القلبية",    color: "#4a8fcf" },
  pry:  { code: "Prayer Area", ar: "مصلى",             color: "#86e8b0" },
  prison: { code: "Prison",  ar: "سجن",                color: "#9aa3ad" },
};

const rect = (x, y, w, h) => [
  { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h },
];

const mkRoom = (z, num, x, y, w, h, opts = {}) => ({
  name: opts.name ?? `${z.code} ${num}`,
  nameAr: opts.nameAr ?? `${z.ar} ${num}`,
  category: opts.category ?? "medical",
  color: opts.color ?? z.color,
  polygon: rect(x, y, w, h),
  zone: z.code,
  zoneAr: z.ar,
  extrudeHeight: opts.extrudeHeight ?? 5,
  isSearchable: opts.isSearchable ?? true,
});

const mkYard = (label, x, y, w, h) => ({
  name: `Court Yard ${label}`,
  nameAr: `منور ${label}`,
  category: "other",
  color: "#fafafa",
  polygon: rect(x, y, w, h),
  zone: "Court Yard",
  zoneAr: "منور",
  extrudeHeight: 0,
  isSearchable: false,
});

// Lay out a horizontal strip of rooms numbered startNum…startNum+count-1
const hstrip = (z, startNum, count, x0, y0, w, h, gap = 5) => {
  const out = [];
  for (let i = 0; i < count; i++) out.push(mkRoom(z, startNum + i, x0 + i * (w + gap), y0, w, h));
  return out;
};
const vstrip = (z, startNum, count, x0, y0, w, h, gap = 5) => {
  const out = [];
  for (let i = 0; i < count; i++) out.push(mkRoom(z, startNum + i, x0, y0 + i * (h + gap), w, h));
  return out;
};

async function main() {
  await login();

  // Find or create the Saud-1 building.
  const buildings = await req("GET", "/buildings");
  let building = buildings.find((b) => b.slug === "saud-1");
  if (!building) {
    building = await req("POST", "/buildings", {
      name: "King Saud Hospital · Unaizah",
      nameAr: "مستشفى الملك سعود · عنيزة",
      slug: "saud-1",
      address: "Unaizah, Qassim",
    });
    console.log(`▶ Created building ${building.id}`);
  } else {
    console.log(`▶ Using existing building ${building.id}`);
  }

  const full = await req("GET", `/buildings/${building.id}`);
  if ((full.floors ?? []).some((f) => f.level === 1)) {
    console.error(`❌ Floor level=1 already exists on this building. Delete it from the admin first if you want to re-seed.`);
    process.exit(1);
  }

  const floor = await req("POST", "/floors", {
    buildingId: building.id,
    name: "Floor 1",
    nameAr: "الطابق الأول",
    level: 1,
    width: W,
    height: H,
  });
  console.log(`▶ Created floor ${floor.id}`);

  // ── ROOMS ─────────────────────────────────────────────────────────────
  const rooms = [];

  // Top strip (single row hanging from the north wall)
  rooms.push(...hstrip(Z.ms1, 4, 6,  70,  30, 92, 140));   // M.S.1: 4..9
  rooms.push(...hstrip(Z.ms2, 2, 7,  690, 30, 80, 140));   // M.S.2: 2..8
  rooms.push(...hstrip(Z.mmw, 2, 5,  1280, 30, 95, 140));  // M.M.W: 2..6

  // Left vertical wing — M.S.1 rooms 1..3 stacked
  rooms.push(...vstrip(Z.ms1, 1, 3, 30, 220, 130, 105));

  // Upper-middle row (between top corridor and the courtyards)
  rooms.push(mkRoom(Z.ms1, 10, 175, 220, 130, 105));
  rooms.push(mkRoom(Z.ms1, 11, 175, 335, 130, 105));
  rooms.push(mkRoom(Z.ms2, 9,  830, 220, 130, 105));
  rooms.push(mkRoom(Z.ms2, 10, 830, 335, 130, 105));
  rooms.push(mkRoom(Z.ms2, 1,  690, 220, 130, 220)); // tall single
  rooms.push(mkRoom(Z.mmw, 1,  1280, 220, 130, 105));
  rooms.push(mkRoom(Z.mmw, 10, 1280, 335, 130, 105));

  // Far-right amber vertical wing (M.M.W rooms 7..10)
  rooms.push(...vstrip(Z.mmw, 7, 4, 1820, 220, 130, 100));

  // Prayer Area (large green block on the right inner column)
  rooms.push({
    name: "Prayer Area", nameAr: "مصلى",
    category: "services",
    color: Z.pry.color,
    polygon: rect(1450, 280, 220, 200),
    zone: Z.pry.code, zoneAr: Z.pry.ar,
    extrudeHeight: 4, isSearchable: true,
  });

  // Court Yards in the middle band (open spaces, no extrusion)
  rooms.push(mkYard(1, 350,  220, 320, 350));
  rooms.push(mkYard(2, 980,  220, 280, 350));
  rooms.push(mkYard(3, 1110, 800, 320, 320));

  // Lower-middle row — left yellow wing (PICU 12,13)
  rooms.push(mkRoom(Z.picu, 13, 30,  800, 130, 130));
  rooms.push(mkRoom(Z.picu, 12, 30,  950, 130, 130));

  // P.D inner column (rooms 1,2,3 stacked)
  rooms.push(mkRoom(Z.pd, 1, 175, 800,  130, 90));
  rooms.push(mkRoom(Z.pd, 2, 175, 900,  130, 90));
  rooms.push(mkRoom(Z.pd, 3, 175, 1000, 130, 90));

  // F.S.W vertical column (left side of yard 3): 10,11,12 stacked
  rooms.push(mkRoom(Z.fsw, 12, 700, 800, 120, 90));
  rooms.push(mkRoom(Z.fsw, 11, 700, 900, 120, 90));
  rooms.push(mkRoom(Z.fsw, 10, 700, 1000, 120, 90));

  // F.S.W center room 7 (tall)
  rooms.push(mkRoom(Z.fsw, 7, 830, 800, 130, 290));

  // F.S.W right column (1,2,3 stacked)
  rooms.push(mkRoom(Z.fsw, 1, 970, 800, 120, 90));
  rooms.push(mkRoom(Z.fsw, 2, 970, 900, 120, 90));
  rooms.push(mkRoom(Z.fsw, 3, 970, 1000, 120, 90));

  // VIP on far right (vertical)
  rooms.push(mkRoom(Z.vip, 1, 1820, 460, 130, 80));
  rooms.push(mkRoom(Z.vip, 2, 1820, 545, 130, 80));
  rooms.push(mkRoom(Z.vip, 3, 1820, 630, 130, 80));
  rooms.push(mkRoom(Z.vip, 4, 1820, 800, 130, 90));

  // ── BOTTOM STRIP (south wall): single row of rooms ─────────────────────
  rooms.push(mkRoom(Z.picu, 11, 30, 1180, 100, 140));
  rooms.push(...hstrip(Z.pd,  4, 7, 140, 1180, 90,  140));   // P.D 4..10
  rooms.push(...hstrip(Z.fsw, 1, 9, 800, 1180, 84,  140));   // F.S.W 1..9
  rooms.push({
    name: "Prison Ward 8", nameAr: "السجن 8",
    category: "medical", color: Z.prison.color,
    polygon: rect(1600, 1180, 100, 140),
    zone: Z.prison.code, zoneAr: Z.prison.ar,
    extrudeHeight: 5, isSearchable: true,
  });
  rooms.push(mkRoom(Z.ccu, 7, 1720, 1180, 100, 140));
  rooms.push(mkRoom(Z.ccu, 6, 1830, 1180, 100, 140));

  console.log(`▶ Creating ${rooms.length} rooms…`);
  for (const r of rooms) {
    await req("POST", "/stores", { floorId: floor.id, ...r });
  }
  console.log(`✅ Created ${rooms.length} rooms`);

  // ── Nav graph: three horizontal corridors + three vertical risers ──────
  const corridorYs = [195, 770, 1155];
  const risers = [200, 1000, 1800];
  const cols = [150, 350, 550, 700, 850, 1000, 1150, 1300, 1500, 1700, 1900];

  // Place a node at every (col × corridor) intersection
  const nodeMap = new Map(); // `${x},${y}` → node id
  for (const y of corridorYs) {
    for (const x of cols) {
      const n = await req("POST", "/nav/nodes", { floorId: floor.id, x, y, type: "path" });
      nodeMap.set(`${x},${y}`, n);
    }
  }

  // Horizontal edges along each corridor
  for (const y of corridorYs) {
    for (let i = 0; i < cols.length - 1; i++) {
      const a = nodeMap.get(`${cols[i]},${y}`);
      const b = nodeMap.get(`${cols[i + 1]},${y}`);
      await req("POST", "/nav/edges", {
        fromNodeId: a.id, toNodeId: b.id,
        fromX: a.x, fromY: a.y, toX: b.x, toY: b.y,
      });
    }
  }

  // Vertical "risers" connecting the three corridors
  for (const x of risers) {
    for (let i = 0; i < corridorYs.length - 1; i++) {
      const a = nodeMap.get(`${x},${corridorYs[i]}`);
      const b = nodeMap.get(`${x},${corridorYs[i + 1]}`);
      if (!a || !b) continue;
      await req("POST", "/nav/edges", {
        fromNodeId: a.id, toNodeId: b.id,
        fromX: a.x, fromY: a.y, toX: b.x, toY: b.y,
      });
    }
  }
  console.log(`✅ Wired ${nodeMap.size} nav nodes across 3 corridors`);

  const appUrl = (process.env.WAIN_APP_URL || "http://localhost:8787").replace(/\/$/, "");
  console.log("");
  console.log("════════════════════════════════════════════════════════════════════");
  console.log("✅ Saud-1 Floor 1 ready");
  console.log("");
  console.log("Admin map builder:");
  console.log(`  ${appUrl}/console-test/buildings/${building.id}/floors/${floor.id}`);
  console.log("════════════════════════════════════════════════════════════════════");
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
