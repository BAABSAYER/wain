/**
 * King Saud Hospital — Unaizah · Second Floor (Saud-1)
 *
 * Faithfully follows the printed wayfinding board on the wall:
 *   - Building: rectangular with 4 green stair towers at the corners
 *   - Top wing: 3 colored department zones (M.S.1 | M.S.2 | M.M.W) — each a
 *     C-shape wrapping a court yard, with header strip + west wing + inner bay
 *   - M.M.W also has an east wing + Prayer Area embedded in its south-east
 *   - Middle band: elevators + stairs + nurses station + "أنت هنا" wall map +
 *     two meeting offices
 *   - Lower wing: P.I.C.U/P.D (yellow), F.S.W (pink) in C-shapes wrapping
 *     south court yards, plus CCU + Prison along the south strip
 *   - VIP wing: tall narrow column on the far-right wall (rooms 1-4)
 *
 *   Run: node scripts/seed-saud1.mjs
 *   Or:  WAIN_APP_URL=http://192.168.1.5:3000 node scripts/seed-saud1.mjs
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
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${method} ${path} → ${res.status}: ${txt}`);
  }
  return res.json();
}

// ─── Canvas (matches the photo's aspect ratio more closely) ──────────────────
const W = 2400;
const H = 1500;

// ─── Colors (taken from the printed plan) ────────────────────────────────────
const C = {
  surgM1:    "#7dd3fc",   // M.S.1   sky blue
  surgM2:    "#5eead4",   // M.S.2   teal
  internalM: "#fbbf24",   // M.M.W   yellow-orange
  pediatric: "#fde047",   // P.I.C.U / P.D  bright yellow
  surgW:     "#fda4af",   // F.S.W   pink
  ccu:       "#60a5fa",   // CCU     blue
  prison:    "#475569",   // dark slate
  vip:       "#38bdf8",   // VIP     cyan
  prayer:    "#22c55e",   // prayer area green
  courtyard: "#f8fafc",   // open court yard (off-white)
  service:   "#cbd5e1",   // services
  meeting:   "#93c5fd",   // meeting office (light blue, matching the speech-bubble icon)
  elevator:  "#fcd34d",   // amber
  stairs:    "#86efac",   // emergency-green (matches the stair towers in the photo)
  entrance:  "#4ade80",
  here:      "#0ea5e9",   // "You Are Here" marker
};

const rect = (x1, y1, x2, y2) => ([
  { x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 },
]);

async function createStores(floorId, defs) {
  const out = {};
  for (const d of defs) {
    const r = await req("POST", "/stores", {
      floorId, isSearchable: d.isSearchable !== false, extrudeHeight: d.extrudeHeight ?? 5, ...d,
    });
    out[d.name] = r;
    process.stdout.write(`  ✓ ${d.name}\n`);
  }
  return out;
}

async function createNodes(floorId, defs) {
  const out = {};
  for (const n of defs) {
    out[n.key] = await req("POST", "/nav/nodes", {
      floorId, x: n.x, y: n.y, type: n.type ?? "path",
    });
  }
  return out;
}

async function createEdges(nodes, pairs) {
  for (const [a, b] of pairs) {
    const na = nodes[a], nb = nodes[b];
    if (!na || !nb) { console.warn(`  ⚠ missing node ${a} or ${b}`); continue; }
    const dist = Math.sqrt((na.x - nb.x) ** 2 + (na.y - nb.y) ** 2);
    await req("POST", "/nav/edges", {
      fromNodeId: na.id, toNodeId: nb.id,
      distance: Math.round(dist), isAccessible: true,
    });
  }
}

async function linkStoreNodes(stores, nodes, map) {
  for (const [storeName, nodeKey] of Object.entries(map)) {
    const s = stores[storeName], n = nodes[nodeKey];
    if (s && n) await req("PATCH", `/stores/${s.id}`, { navNodeId: n.id });
  }
}

// ─── Building (Saud-1) ───────────────────────────────────────────────────────
async function seedBuilding() {
  console.log("Creating building…");
  const existing = await req("GET", "/buildings");
  const old = existing.find((b) => b.slug === "saud-1");
  if (old) {
    await req("DELETE", `/buildings/${old.id}`);
    console.log("  Deleted existing Saud-1 building.");
  }
  return req("POST", "/buildings", {
    name: "King Saud Hospital · Unaizah",
    nameAr: "مستشفى الملك سعود بعنيزة",
    slug: "saud-1",
    address: "Unaizah, Al-Qassim, Saudi Arabia",
  });
}

// ─── Floor: 2nd Floor (الدور الثاني) ────────────────────────────────────────
async function seedFloor2(buildingId) {
  console.log("\nCreating Floor 2 (الدور الثاني)…");
  const floor = await req("POST", "/floors", {
    buildingId,
    name: "Second Floor",
    nameAr: "الدور الثاني",
    level: 2,
    width: W, height: H,
  });

  // Department layout boundaries (matches the photo):
  //
  //   y=80 ────────────────────────────────────────────────────────────────
  //        │  M.S.1 north strip │  M.S.2 north strip │ M.M.W north strip │
  //   y=200 ───┬─────┬──────┬───┬─────┬──────┬───────┼───┬──────┬───┬────┤
  //         W  │     │   E  │ W │     │   E  │  W    │   │  E   │ P │    │
  //         W  │ NW  │   B  │ W │ NM  │   B  │  W    │ N │  W   │ R │    │
  //         G  │ CY  │   1  │ G │ CY  │   2  │  G    │ E │  G   │ A │    │
  //            │     │      │   │     │      │       │ C │      │ Y │    │
  //   y=720 ──┴─────┴──────┴───┴─────┴──────┴───────┴───┴──────┴───┘    │
  //   y=720 ────  HORIZONTAL CORRIDOR + ELEVATORS + YOU ARE HERE  ──────
  //   y=820 ──┬─────┬───────────┬─────┬──────────┬────────────┬───────┐
  //           │  W  │           │  W  │          │            │       │
  //           │  G  │   SW CY   │  G  │  SM CY   │  (open)    │  V    │
  //           │  P  │           │  W  │          │            │  I    │
  //           │  D  │           │ FSW │          │            │  P    │
  //   y=1180 ─┴─────┴───────────┴─────┴──────────┴────────────┤  W    │
  //           │  P.I.C.U + P.D south header │ F.S.W south │CCU│  I    │
  //   y=1320 ─────────────────────────────────────────────────┴───────┘

  const stores = await createStores(floor.id, [
    // ═══════════════ TOP WING — north walls and headers ═══════════════
    // M.S.1: north strip + west wing + small east bay (rooms 10-11)
    { name: "M.S.1 · Men's Surgery 1 (north strip, rooms 4-9)",
      nameAr: "جراحة رجال ١ — الشريط الشمالي", category: "medical",
      color: C.surgM1, polygon: rect(200, 80, 820, 200), extrudeHeight: 6 },
    { name: "M.S.1 · West Wing (rooms 1-3)",
      nameAr: "جراحة رجال ١ — الجناح الغربي", category: "medical",
      color: C.surgM1, polygon: rect(200, 200, 360, 720) },
    { name: "M.S.1 · East Bay (rooms 10-11)",
      nameAr: "جراحة رجال ١ — الجناح الشرقي", category: "medical",
      color: C.surgM1, polygon: rect(600, 220, 760, 430) },

    // M.S.2: north strip + west wing + central bay
    { name: "M.S.2 · Men's Surgery 2 (north strip, rooms 2-8)",
      nameAr: "جراحة رجال ٢ — الشريط الشمالي", category: "medical",
      color: C.surgM2, polygon: rect(840, 80, 1480, 200), extrudeHeight: 6 },
    { name: "M.S.2 · West Wing (room 1)",
      nameAr: "جراحة رجال ٢ — الجناح الغربي", category: "medical",
      color: C.surgM2, polygon: rect(840, 200, 1000, 720) },
    { name: "M.S.2 · Central Bay (rooms 9-10)",
      nameAr: "جراحة رجال ٢ — الجناح الأوسط", category: "medical",
      color: C.surgM2, polygon: rect(1230, 220, 1380, 430) },

    // M.M.W: north strip + west wing + east wing
    { name: "M.M.W · Men's Internal Medicine (north strip, rooms 2-6)",
      nameAr: "باطنية رجال — الشريط الشمالي", category: "medical",
      color: C.internalM, polygon: rect(1520, 80, 2000, 200), extrudeHeight: 6 },
    { name: "M.M.W · West Wing (room 1)",
      nameAr: "باطنية رجال — الجناح الغربي", category: "medical",
      color: C.internalM, polygon: rect(1520, 200, 1680, 720) },
    { name: "M.M.W · East Wing (rooms 7-10)",
      nameAr: "باطنية رجال — الجناح الشرقي", category: "medical",
      color: C.internalM, polygon: rect(1900, 200, 2060, 480) },

    // Prayer Area embedded in M.M.W's south-east corner
    { name: "Prayer Area",  nameAr: "مصلى",  category: "services",
      color: C.prayer, polygon: rect(1900, 500, 2060, 720), extrudeHeight: 5 },

    // ═══════════════ COURT YARDS (north band, open) ═══════════════════
    { name: "NW Court Yard",  nameAr: "منور شمالي غربي",  category: "other",
      color: C.courtyard, polygon: rect(380, 220, 580, 720), extrudeHeight: 1, isSearchable: false },
    { name: "NW Court Yard (east half)",  nameAr: "منور شمالي غربي (شرق)",  category: "other",
      color: C.courtyard, polygon: rect(780, 220, 820, 720), extrudeHeight: 1, isSearchable: false },
    { name: "NM Court Yard",  nameAr: "منور شمالي أوسط",  category: "other",
      color: C.courtyard, polygon: rect(1020, 220, 1210, 720), extrudeHeight: 1, isSearchable: false },
    { name: "NM Court Yard (east half)",  nameAr: "منور شمالي أوسط (شرق)",  category: "other",
      color: C.courtyard, polygon: rect(1400, 220, 1480, 720), extrudeHeight: 1, isSearchable: false },
    { name: "NE Court Yard",  nameAr: "منور شمالي شرقي",  category: "other",
      color: C.courtyard, polygon: rect(1700, 220, 1880, 720), extrudeHeight: 1, isSearchable: false },

    // ═══════════════ MIDDLE BAND — corridor services ═══════════════════
    { name: "You Are Here · Wall Map",  nameAr: "أنت هنا · مخطط الدور",
      category: "entrance",
      color: C.here, polygon: rect(820, 730, 940, 810), extrudeHeight: 4 },
    { name: "Main Elevator",   nameAr: "المصعد الرئيسي", category: "elevator",
      color: C.elevator, polygon: rect(1100, 730, 1230, 810), extrudeHeight: 6 },
    { name: "Central Stairs",  nameAr: "السلم المركزي",  category: "stairs",
      color: C.stairs,   polygon: rect(1250, 730, 1380, 810), extrudeHeight: 6 },
    { name: "Nurses Station",  nameAr: "محطة التمريض",   category: "services",
      color: C.service,  polygon: rect(1400, 730, 1620, 810), extrudeHeight: 4 },
    { name: "Meeting Office (West)",  nameAr: "مكتب اجتماعات — غرب", category: "services",
      color: C.meeting,  polygon: rect(380, 730, 580, 810), extrudeHeight: 4 },
    { name: "Meeting Office (East)",  nameAr: "مكتب اجتماعات — شرق", category: "services",
      color: C.meeting,  polygon: rect(1700, 730, 1880, 810), extrudeHeight: 4 },

    // ═══════════════ LOWER WING — patient room columns ═════════════════
    // P.D west wing (left column, mirror of M.S.1 west wing)
    { name: "P.D · West Wing (rooms 1-3)",
      nameAr: "قسم الأطفال — الجناح الغربي", category: "medical",
      color: C.pediatric, polygon: rect(200, 820, 360, 1180) },
    { name: "P.D · East Bay (rooms 12-13)",
      nameAr: "قسم الأطفال — الجناح الشرقي", category: "medical",
      color: C.pediatric, polygon: rect(600, 850, 760, 1070) },

    // F.S.W west wing + central bay
    { name: "F.S.W · West Wing",
      nameAr: "جراحة نساء — الجناح الغربي", category: "medical",
      color: C.surgW, polygon: rect(840, 820, 1000, 1180) },
    { name: "F.S.W · Central Bay (rooms 10-12, 7)",
      nameAr: "جراحة نساء — الجناح الأوسط", category: "medical",
      color: C.surgW, polygon: rect(1230, 850, 1380, 1100) },

    // ═══════════════ COURT YARDS (south band, open) ═══════════════════
    { name: "SW Court Yard",  nameAr: "منور جنوبي غربي",  category: "other",
      color: C.courtyard, polygon: rect(380, 820, 580, 1180), extrudeHeight: 1, isSearchable: false },
    { name: "SW Court Yard (east half)",  nameAr: "منور جنوبي غربي (شرق)",  category: "other",
      color: C.courtyard, polygon: rect(780, 820, 820, 1180), extrudeHeight: 1, isSearchable: false },
    { name: "SM Court Yard",  nameAr: "منور جنوبي أوسط",  category: "other",
      color: C.courtyard, polygon: rect(1020, 820, 1210, 1180), extrudeHeight: 1, isSearchable: false },
    { name: "SM Court Yard (east half)",  nameAr: "منور جنوبي أوسط (شرق)",  category: "other",
      color: C.courtyard, polygon: rect(1400, 820, 1480, 1180), extrudeHeight: 1, isSearchable: false },

    // ═══════════════ SOUTH HEADERS — bottom wall wards ════════════════
    { name: "P.I.C.U — Pediatric ICU",
      nameAr: "العناية المركزة للأطفال", category: "medical",
      color: C.pediatric, polygon: rect(200, 1180, 470, 1320), extrudeHeight: 6 },
    { name: "P.D — Pediatrics Ward",
      nameAr: "قسم الأطفال", category: "medical",
      color: C.pediatric, polygon: rect(490, 1180, 820, 1320), extrudeHeight: 6 },
    { name: "F.S.W — Women's Surgery",
      nameAr: "جراحة نساء", category: "medical",
      color: C.surgW, polygon: rect(840, 1180, 1480, 1320), extrudeHeight: 6 },
    { name: "CCU — Cardiac Care Unit",
      nameAr: "العناية القلبية", category: "medical",
      color: C.ccu, polygon: rect(1520, 1180, 1820, 1320), extrudeHeight: 6 },
    { name: "Prison Ward",
      nameAr: "جناح السجن", category: "medical",
      color: C.prison, polygon: rect(1820, 1180, 1900, 1320), extrudeHeight: 6 },

    // ═══════════════ VIP — tall narrow column on the far-right wall ═══
    { name: "VIP Wing (rooms 1-4)",
      nameAr: "جناح كبار الشخصيات", category: "medical",
      color: C.vip, polygon: rect(1920, 820, 2080, 1320), extrudeHeight: 6 },

    // ═══════════════ 4 STAIR TOWERS — green pills outside corners ═════
    { name: "NW Stair Tower",  nameAr: "سلم شمال غربي", category: "stairs",
      color: C.stairs, polygon: rect(50,   280,  180, 500), extrudeHeight: 6 },
    { name: "NE Stair Tower",  nameAr: "سلم شمال شرقي", category: "stairs",
      color: C.stairs, polygon: rect(2220, 280, 2350, 500), extrudeHeight: 6 },
    { name: "SW Stair Tower",  nameAr: "سلم جنوب غربي", category: "stairs",
      color: C.stairs, polygon: rect(50,   940,  180, 1160), extrudeHeight: 6 },
    { name: "SE Stair Tower",  nameAr: "سلم جنوب شرقي", category: "stairs",
      color: C.stairs, polygon: rect(2220, 940, 2350, 1160), extrudeHeight: 6 },
  ]);

  // ═══════════════════════ NAV GRAPH ════════════════════════════════════
  const nodes = await createNodes(floor.id, [
    // North corridor (between top wing and middle band), y=660
    { key: "nc_w",     x: 110,  y: 660 },
    { key: "nc_meet_w",x: 480,  y: 660 },
    { key: "nc_ms1",   x: 700,  y: 660 },
    { key: "nc_ms2",   x: 920,  y: 660 },
    { key: "nc_elev",  x: 1165, y: 660, type: "elevator" },
    { key: "nc_stair", x: 1315, y: 660, type: "stairs" },
    { key: "nc_nurse", x: 1510, y: 660 },
    { key: "nc_meet_e",x: 1790, y: 660 },
    { key: "nc_mmw",   x: 1980, y: 660 },
    { key: "nc_e",     x: 2160, y: 660 },

    // South corridor (between middle band and lower wing), y=840
    { key: "sc_w",     x: 110,  y: 840 },
    { key: "sc_pd_w",  x: 280,  y: 840 },
    { key: "sc_pd_e",  x: 700,  y: 840 },
    { key: "sc_fsw_w", x: 920,  y: 840 },
    { key: "sc_elev",  x: 1165, y: 840 },
    { key: "sc_stair", x: 1315, y: 840 },
    { key: "sc_nurse", x: 1510, y: 840 },
    { key: "sc_e",     x: 2160, y: 840 },

    // Middle band attachment nodes (inside services)
    { key: "n_here",   x: 880,  y: 770, type: "entrance" },
    { key: "n_meet_w",x: 480,  y: 770 },
    { key: "n_meet_e",x: 1790, y: 770 },
    { key: "n_elev",   x: 1165, y: 770, type: "elevator" },
    { key: "n_stair",  x: 1315, y: 770, type: "stairs" },
    { key: "n_nurse",  x: 1510, y: 770 },

    // Patient-room anchor nodes (top wing)
    { key: "n_ms1_n",  x: 510,  y: 140 },
    { key: "n_ms1_w",  x: 280,  y: 460 },
    { key: "n_ms1_e",  x: 680,  y: 325 },
    { key: "n_ms2_n",  x: 1160, y: 140 },
    { key: "n_ms2_w",  x: 920,  y: 460 },
    { key: "n_ms2_c",  x: 1305, y: 325 },
    { key: "n_mmw_n",  x: 1760, y: 140 },
    { key: "n_mmw_w",  x: 1600, y: 460 },
    { key: "n_mmw_e",  x: 1980, y: 340 },
    { key: "n_prayer", x: 1980, y: 610 },

    // Patient-room anchor nodes (lower wing)
    { key: "n_pd_w",   x: 280,  y: 1000 },
    { key: "n_pd_e",   x: 680,  y: 960 },
    { key: "n_fsw_w",  x: 920,  y: 1000 },
    { key: "n_fsw_c",  x: 1305, y: 975 },
    { key: "n_vip_n",  x: 2000, y: 950 },

    // South bottom-wall ward anchors
    { key: "n_picu",   x: 335,  y: 1250 },
    { key: "n_pd",     x: 655,  y: 1250 },
    { key: "n_fsw",    x: 1160, y: 1250 },
    { key: "n_ccu",    x: 1670, y: 1250 },
    { key: "n_prison", x: 1860, y: 1250 },
    { key: "n_vip",    x: 2000, y: 1250 },

    // Stair towers (corners)
    { key: "stair_nw", x: 115,  y: 390, type: "stairs" },
    { key: "stair_ne", x: 2285, y: 390, type: "stairs" },
    { key: "stair_sw", x: 115,  y: 1050, type: "stairs" },
    { key: "stair_se", x: 2285, y: 1050, type: "stairs" },
  ]);

  const edges = [
    // North corridor backbone
    ["nc_w","nc_meet_w"],["nc_meet_w","nc_ms1"],["nc_ms1","nc_ms2"],
    ["nc_ms2","nc_elev"],["nc_elev","nc_stair"],["nc_stair","nc_nurse"],
    ["nc_nurse","nc_meet_e"],["nc_meet_e","nc_mmw"],["nc_mmw","nc_e"],

    // South corridor backbone
    ["sc_w","sc_pd_w"],["sc_pd_w","sc_pd_e"],["sc_pd_e","sc_fsw_w"],
    ["sc_fsw_w","sc_elev"],["sc_elev","sc_stair"],["sc_stair","sc_nurse"],
    ["sc_nurse","sc_e"],

    // North–south crossings via services band
    ["nc_ms1","n_here"],["n_here","sc_pd_e"],
    ["nc_meet_w","n_meet_w"],["n_meet_w","sc_pd_w"],
    ["nc_elev","n_elev"],["n_elev","sc_elev"],
    ["nc_stair","n_stair"],["n_stair","sc_stair"],
    ["nc_nurse","n_nurse"],["n_nurse","sc_nurse"],
    ["nc_meet_e","n_meet_e"],["n_meet_e","sc_e"],

    // Top wing → north corridor
    ["nc_w","n_ms1_w"],["n_ms1_w","n_ms1_n"],["n_ms1_n","nc_ms1"],
    ["nc_ms1","n_ms1_e"],
    ["nc_ms2","n_ms2_w"],["n_ms2_w","n_ms2_n"],["n_ms2_n","nc_elev"],
    ["nc_elev","n_ms2_c"],
    ["nc_meet_e","n_mmw_w"],["n_mmw_w","n_mmw_n"],["n_mmw_n","nc_mmw"],
    ["nc_mmw","n_mmw_e"],["n_mmw_e","n_prayer"],["n_prayer","nc_e"],

    // Lower wing → south corridor
    ["sc_w","n_pd_w"],["n_pd_w","sc_pd_w"],
    ["sc_pd_e","n_pd_e"],
    ["sc_fsw_w","n_fsw_w"],["n_fsw_w","sc_fsw_w"],
    ["sc_elev","n_fsw_c"],
    ["sc_e","n_vip_n"],

    // South bottom-wall wards
    ["sc_w","n_picu"],["sc_pd_w","n_picu"],
    ["sc_pd_e","n_pd"],["n_pd","n_picu"],
    ["sc_fsw_w","n_fsw"],["n_fsw","n_pd"],
    ["sc_nurse","n_ccu"],["n_ccu","n_fsw"],
    ["n_ccu","n_prison"],["n_prison","n_vip"],
    ["sc_e","n_vip"],["n_vip","n_vip_n"],

    // Stair towers tied to nearest corridor end
    ["nc_w","stair_nw"],["nc_e","stair_ne"],
    ["sc_w","stair_sw"],["sc_e","stair_se"],
  ];
  await createEdges(nodes, edges);

  // Link stores to nav nodes (only the ones a visitor would search/route to)
  await linkStoreNodes(stores, nodes, {
    "M.S.1 · Men's Surgery 1 (north strip, rooms 4-9)": "n_ms1_n",
    "M.S.1 · West Wing (rooms 1-3)":                    "n_ms1_w",
    "M.S.1 · East Bay (rooms 10-11)":                   "n_ms1_e",
    "M.S.2 · Men's Surgery 2 (north strip, rooms 2-8)": "n_ms2_n",
    "M.S.2 · West Wing (room 1)":                       "n_ms2_w",
    "M.S.2 · Central Bay (rooms 9-10)":                 "n_ms2_c",
    "M.M.W · Men's Internal Medicine (north strip, rooms 2-6)": "n_mmw_n",
    "M.M.W · West Wing (room 1)":                       "n_mmw_w",
    "M.M.W · East Wing (rooms 7-10)":                   "n_mmw_e",
    "Prayer Area":                                      "n_prayer",
    "Main Elevator":                                    "n_elev",
    "Central Stairs":                                   "n_stair",
    "Nurses Station":                                   "n_nurse",
    "Meeting Office (West)":                            "n_meet_w",
    "Meeting Office (East)":                            "n_meet_e",
    "You Are Here · Wall Map":                          "n_here",
    "P.D · West Wing (rooms 1-3)":                      "n_pd_w",
    "P.D · East Bay (rooms 12-13)":                     "n_pd_e",
    "F.S.W · West Wing":                                "n_fsw_w",
    "F.S.W · Central Bay (rooms 10-12, 7)":             "n_fsw_c",
    "P.I.C.U — Pediatric ICU":                          "n_picu",
    "P.D — Pediatrics Ward":                            "n_pd",
    "F.S.W — Women's Surgery":                          "n_fsw",
    "CCU — Cardiac Care Unit":                          "n_ccu",
    "Prison Ward":                                      "n_prison",
    "VIP Wing (rooms 1-4)":                             "n_vip",
    "NW Stair Tower":                                   "stair_nw",
    "NE Stair Tower":                                   "stair_ne",
    "SW Stair Tower":                                   "stair_sw",
    "SE Stair Tower":                                   "stair_se",
  });

  return { floor, nodes, stores };
}

// ─── QR Codes ────────────────────────────────────────────────────────────────
async function seedQR(buildingId, floor, nodes) {
  console.log("\nGenerating QR codes…");
  const APP = process.env.WAIN_APP_URL ?? "http://localhost:3000";
  console.log(`  Encoding URLs against: ${APP}`);

  const items = [
    { nodeId: nodes.n_here.id,    label: "Floor 2 — You Are Here (wall map)" },
    { nodeId: nodes.n_elev.id,    label: "Floor 2 — Elevator Lobby" },
    { nodeId: nodes.n_nurse.id,   label: "Floor 2 — Nurses Station" },
    { nodeId: nodes.stair_nw.id,  label: "Floor 2 — NW Stair Tower" },
    { nodeId: nodes.stair_ne.id,  label: "Floor 2 — NE Stair Tower" },
    { nodeId: nodes.stair_sw.id,  label: "Floor 2 — SW Stair Tower" },
    { nodeId: nodes.stair_se.id,  label: "Floor 2 — SE Stair Tower" },
  ];

  const out = [];
  for (const q of items) {
    const r = await req("POST", "/qr", {
      buildingId, floorId: floor.id, nodeId: q.nodeId,
      label: q.label, appBaseUrl: APP,
    });
    out.push({ ...q, code: r.code, url: `${APP}/nav/${buildingId}/${floor.id}/${q.nodeId}` });
    process.stdout.write(`  ✓ ${q.label}\n`);
  }
  return out;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🏥  Seeding King Saud Hospital — Saud-1…\n");
  await login();
  const building = await seedBuilding();
  console.log(`  Building ID: ${building.id}\n`);

  const { floor, nodes } = await seedFloor2(building.id);
  const qrCodes = await seedQR(building.id, floor, nodes);

  console.log("\n" + "═".repeat(78));
  console.log("✅  Saud-1 ready: King Saud Hospital · Unaizah · Floor 2");
  console.log("📋  Building ID :", building.id);
  console.log("🏢  Floor 2 ID  :", floor.id);
  console.log("\n📱  Test URLs:\n");
  for (const qr of qrCodes) {
    console.log(`  ${qr.label}`);
    console.log(`  ${qr.url}\n`);
  }
  console.log(`🛠   Admin: http://localhost:3001/buildings/${building.id}`);
  console.log("═".repeat(78));
}

main().catch((e) => {
  console.error("\n❌  Seed failed:", e.message);
  process.exit(1);
});
