/**
 * Mall Demo Seed — Al Rawdah Plaza
 * A realistic 2-floor mall: anchor stores, fashion/electronics rows,
 * food court, cinema, restrooms, prayer rooms, multiple entrances.
 *
 *   Run: node scripts/seed-mall.mjs
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

// ─── Canvas dimensions (mall is bigger than hospital) ────────────────────────
const W = 2000;
const H = 1400;

// ─── Palette ─────────────────────────────────────────────────────────────────
const C = {
  anchor:     "#14b8a6",   // teal
  fashion:    "#f472b6",   // pink
  electronics:"#3b82f6",   // blue
  jewelry:    "#fbbf24",   // amber
  beauty:     "#ec4899",   // hot pink
  sports:     "#84cc16",   // lime
  kids:       "#a78bfa",   // violet
  food:       "#fb923c",   // orange
  restaurant: "#ef4444",   // red
  cafe:       "#a16207",   // brown
  cinema:     "#a855f7",   // purple
  entertain:  "#d946ef",   // fuchsia
  services:   "#64748b",   // slate
  bank:       "#0891b2",   // cyan-700
  telecom:    "#0ea5e9",   // sky
  pharmacy:   "#10b981",   // emerald
  restroom:   "#94a3b8",   // slate-light
  prayer:     "#22c55e",   // green
  elevator:   "#fcd34d",   // amber-light
  escalator:  "#fde68a",   // amber-pale
  entrance:   "#4ade80",   // green
};

// ─── Building ────────────────────────────────────────────────────────────────
async function seedBuilding() {
  console.log("Creating building…");
  const existing = await req("GET", "/buildings");
  const old = existing.find((b) => b.slug === "al-rawdah-plaza");
  if (old) {
    await req("DELETE", `/buildings/${old.id}`);
    console.log("  Deleted existing demo mall.");
  }
  return req("POST", "/buildings", {
    name: "Al Rawdah Plaza",
    nameAr: "الروضة بلازا",
    slug: "al-rawdah-plaza",
    address: "King Abdullah Road, Riyadh, Saudi Arabia",
  });
}

// ─── helpers ─────────────────────────────────────────────────────────────────
const rect = (x1, y1, x2, y2) => ([
  { x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 },
]);

async function createStores(floorId, defs) {
  const out = {};
  for (const d of defs) {
    const r = await req("POST", "/stores", {
      floorId,
      isSearchable: true,
      extrudeHeight: d.extrudeHeight ?? 5,
      ...d,
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

// ═════════════════════════════════════════════════════════════════════════════
// GROUND FLOOR — fashion / electronics / anchor stores
// ═════════════════════════════════════════════════════════════════════════════
//
// Layout (W=2000, H=1400). Two horizontal store rows separated by a wide
// central corridor (y=600–800) housing restrooms, prayer rooms, elevators.
//
//   y=50 ┌────────────────────────────────────────────────────────────────┐
//        │ Centrepoint │ Zara │ Mango │ Mssmo │ Apple │ Sephora │Carrefour │
//        │  (anchor)   │      │       │       │       │         │ (anchor) │
//   y=550└────────────┴──────┴───────┴───────┴───────┴─────────┴─────────┘
//                                  central corridor y=600..800
//                       (restrooms, prayer rooms, elevators)
//   y=850┌────────────────────────────────────────────────────────────────┐
//        │ H&M (anchor)│ Nike │ Adidas│ Forever│ Foot │  STC   │  Jarir   │
//        │             │      │       │  21    │ Lockr│        │ (anchor) │
//   y=1350└────────────┴──────┴───────┴───────┴───────┴───────┴──────────┘
//
async function seedGround(buildingId) {
  console.log("\nCreating Ground Floor…");
  const floor = await req("POST", "/floors", {
    buildingId,
    name: "Ground Floor",
    nameAr: "الطابق الأرضي",
    level: 0, width: W, height: H,
  });

  // ── Stores ─────────────────────────────────────────────────────────────
  const G_TOP_Y1 = 50, G_TOP_Y2 = 550;
  const G_BOT_Y1 = 850, G_BOT_Y2 = 1350;

  const stores = await createStores(floor.id, [
    // ── Top row (south-facing) ──
    { name: "Centrepoint",        nameAr: "سنتر بوينت",       category: "retail",      color: C.anchor,      polygon: rect(50,   G_TOP_Y1, 350,  G_TOP_Y2), extrudeHeight: 7 },
    { name: "Zara",               nameAr: "زارا",              category: "retail",      color: C.fashion,     polygon: rect(370,  G_TOP_Y1, 560,  G_TOP_Y2) },
    { name: "Mango",              nameAr: "مانجو",             category: "retail",      color: C.fashion,     polygon: rect(580,  G_TOP_Y1, 760,  G_TOP_Y2) },
    { name: "Massimo Dutti",      nameAr: "ماسيمو دوتي",       category: "retail",      color: C.fashion,     polygon: rect(780,  G_TOP_Y1, 960,  G_TOP_Y2) },
    { name: "Apple Store",        nameAr: "متجر أبل",          category: "retail",      color: C.electronics, polygon: rect(980,  G_TOP_Y1, 1280, G_TOP_Y2), extrudeHeight: 6 },
    { name: "Sephora",            nameAr: "سيفورا",            category: "retail",      color: C.beauty,      polygon: rect(1300, G_TOP_Y1, 1490, G_TOP_Y2) },
    { name: "Damas Jewellery",    nameAr: "مجوهرات داماس",      category: "retail",      color: C.jewelry,     polygon: rect(1510, G_TOP_Y1, 1640, G_TOP_Y2) },
    { name: "Carrefour",          nameAr: "كارفور",            category: "retail",      color: C.anchor,      polygon: rect(1660, G_TOP_Y1, 1950, G_TOP_Y2), extrudeHeight: 7 },

    // ── Bottom row (north-facing) ──
    { name: "H&M",                nameAr: "اتش اند ام",        category: "retail",      color: C.anchor,      polygon: rect(50,   G_BOT_Y1, 350,  G_BOT_Y2), extrudeHeight: 7 },
    { name: "Nike",               nameAr: "نايك",              category: "retail",      color: C.sports,      polygon: rect(370,  G_BOT_Y1, 560,  G_BOT_Y2) },
    { name: "Adidas",             nameAr: "أديداس",            category: "retail",      color: C.sports,      polygon: rect(580,  G_BOT_Y1, 760,  G_BOT_Y2) },
    { name: "Forever 21",         nameAr: "فوريفر 21",         category: "retail",      color: C.fashion,     polygon: rect(780,  G_BOT_Y1, 960,  G_BOT_Y2) },
    { name: "Foot Locker",        nameAr: "فوت لوكر",          category: "retail",      color: C.sports,      polygon: rect(980,  G_BOT_Y1, 1170, G_BOT_Y2) },
    { name: "Bath & Body Works",  nameAr: "باث آند بادي ووركس",category: "retail",      color: C.beauty,      polygon: rect(1190, G_BOT_Y1, 1380, G_BOT_Y2) },
    { name: "STC",                nameAr: "إس تي سي",          category: "services",    color: C.telecom,     polygon: rect(1400, G_BOT_Y1, 1590, G_BOT_Y2) },
    { name: "Jarir Bookstore",    nameAr: "مكتبة جرير",         category: "retail",      color: C.anchor,      polygon: rect(1610, G_BOT_Y1, 1950, G_BOT_Y2), extrudeHeight: 6 },

    // ── Central corridor cluster (services) ──
    { name: "Men's Restroom",     nameAr: "دورة مياه رجال",     category: "restroom",    color: C.restroom,    polygon: rect(370,  610, 510, 790) },
    { name: "Women's Restroom",   nameAr: "دورة مياه نساء",     category: "restroom",    color: C.restroom,    polygon: rect(520,  610, 660, 790) },
    { name: "Family Restroom",    nameAr: "دورة مياه عائلية",   category: "restroom",    color: C.restroom,    polygon: rect(670,  610, 770, 790) },
    { name: "Men's Prayer Room",  nameAr: "مصلى الرجال",        category: "services",    color: C.prayer,      polygon: rect(1230, 610, 1390, 790) },
    { name: "Women's Prayer Room",nameAr: "مصلى النساء",        category: "services",    color: C.prayer,      polygon: rect(1400, 610, 1560, 790) },

    // Elevator / escalator / info / ATM in middle
    { name: "Main Elevator",      nameAr: "المصعد الرئيسي",     category: "elevator",    color: C.elevator,    polygon: rect(820,  640, 960, 760), extrudeHeight: 6 },
    { name: "Main Escalator",     nameAr: "السلم المتحرك",      category: "escalator",   color: C.escalator,   polygon: rect(980,  640, 1130, 760), extrudeHeight: 6 },
    { name: "Information Desk",   nameAr: "مكتب المعلومات",     category: "services",    color: C.services,    polygon: rect(1150, 660, 1210, 740), extrudeHeight: 3 },
    { name: "ATM Centre",         nameAr: "مركز الصرافات",      category: "services",    color: C.bank,        polygon: rect(1580, 660, 1700, 740), extrudeHeight: 3 },
    { name: "Customer Service",   nameAr: "خدمة العملاء",       category: "services",    color: C.services,    polygon: rect(1720, 660, 1880, 740), extrudeHeight: 3 },

    // Entrances (slim slices on walls)
    { name: "Main Entrance",      nameAr: "المدخل الرئيسي",     category: "entrance",    color: C.entrance,    polygon: rect(900,  1355, 1100, 1400), extrudeHeight: 2 },
    { name: "North Entrance",     nameAr: "المدخل الشمالي",     category: "entrance",    color: C.entrance,    polygon: rect(900,  0,    1100, 50),   extrudeHeight: 2 },
    { name: "West Entrance",      nameAr: "المدخل الغربي",      category: "entrance",    color: C.entrance,    polygon: rect(0,    660,  50,   800),  extrudeHeight: 2 },
    { name: "East Entrance",      nameAr: "المدخل الشرقي",      category: "entrance",    color: C.entrance,    polygon: rect(1950, 660,  2000, 800),  extrudeHeight: 2 },
  ]);

  // ── Nav nodes ─────────────────────────────────────────────────────────
  // Central spine is two horizontal corridors at y=580 (north of services) and y=820 (south).
  // Plus a backbone through the middle at y=700.
  const nodes = await createNodes(floor.id, [
    // North corridor (between top stores and services)
    { key: "nc_w",     x: 100,  y: 580 },
    { key: "nc_1",     x: 460,  y: 580 },
    { key: "nc_2",     x: 670,  y: 580 },
    { key: "nc_3",     x: 870,  y: 580 },
    { key: "nc_4",     x: 1130, y: 580 },
    { key: "nc_5",     x: 1390, y: 580 },
    { key: "nc_6",     x: 1550, y: 580 },
    { key: "nc_e",     x: 1850, y: 580 },

    // South corridor (between services and bottom stores)
    { key: "sc_w",     x: 100,  y: 820 },
    { key: "sc_1",     x: 460,  y: 820 },
    { key: "sc_2",     x: 670,  y: 820 },
    { key: "sc_3",     x: 870,  y: 820 },
    { key: "sc_4",     x: 1130, y: 820 },
    { key: "sc_5",     x: 1390, y: 820 },
    { key: "sc_6",     x: 1550, y: 820 },
    { key: "sc_e",     x: 1850, y: 820 },

    // Mid (in front of elevator/escalator) — vertical connectors
    { key: "mid_elev", x: 890,  y: 700, type: "elevator" },
    { key: "mid_esc",  x: 1050, y: 700, type: "escalator" },
    { key: "mid_info", x: 1180, y: 700 },

    // Inside-store anchor nodes for the navNode-linked stores
    { key: "n_center",  x: 200,  y: 300 },
    { key: "n_zara",    x: 465,  y: 300 },
    { key: "n_mango",   x: 670,  y: 300 },
    { key: "n_mass",    x: 870,  y: 300 },
    { key: "n_apple",   x: 1130, y: 300 },
    { key: "n_seph",    x: 1395, y: 300 },
    { key: "n_dam",     x: 1575, y: 300 },
    { key: "n_carr",    x: 1805, y: 300 },

    { key: "n_hm",      x: 200,  y: 1100 },
    { key: "n_nike",    x: 465,  y: 1100 },
    { key: "n_adi",     x: 670,  y: 1100 },
    { key: "n_f21",     x: 870,  y: 1100 },
    { key: "n_foot",    x: 1075, y: 1100 },
    { key: "n_bbw",     x: 1285, y: 1100 },
    { key: "n_stc",     x: 1495, y: 1100 },
    { key: "n_jarir",   x: 1780, y: 1100 },

    { key: "n_wc_m",    x: 440,  y: 700 },
    { key: "n_wc_f",    x: 590,  y: 700 },
    { key: "n_wc_fam",  x: 720,  y: 700 },
    { key: "n_pr_m",    x: 1310, y: 700 },
    { key: "n_pr_f",    x: 1480, y: 700 },
    { key: "n_atm",     x: 1640, y: 700 },
    { key: "n_cs",      x: 1800, y: 700 },

    // Entrances (also QR scan points)
    { key: "main_ent",  x: 1000, y: 1370, type: "entrance" },
    { key: "north_ent", x: 1000, y: 25,   type: "entrance" },
    { key: "west_ent",  x: 25,   y: 730,  type: "entrance" },
    { key: "east_ent",  x: 1975, y: 730,  type: "entrance" },
  ]);

  // ── Edges ─────────────────────────────────────────────────────────────
  const edges = [
    // Backbone corridors
    ["nc_w", "nc_1"], ["nc_1", "nc_2"], ["nc_2", "nc_3"], ["nc_3", "nc_4"],
    ["nc_4", "nc_5"], ["nc_5", "nc_6"], ["nc_6", "nc_e"],
    ["sc_w", "sc_1"], ["sc_1", "sc_2"], ["sc_2", "sc_3"], ["sc_3", "sc_4"],
    ["sc_4", "sc_5"], ["sc_5", "sc_6"], ["sc_6", "sc_e"],

    // North–south crossings (through the central services band)
    ["nc_w", "sc_w"], ["nc_e", "sc_e"],
    ["nc_3", "mid_elev"], ["mid_elev", "sc_3"],
    ["nc_3", "mid_esc"],  ["mid_esc", "sc_4"],
    ["nc_4", "mid_info"], ["mid_info", "sc_4"],

    // Restroom / prayer connections
    ["nc_1", "n_wc_m"], ["n_wc_m", "sc_1"],
    ["nc_2", "n_wc_f"], ["n_wc_f", "n_wc_fam"], ["n_wc_fam", "sc_2"],
    ["nc_5", "n_pr_m"], ["n_pr_m", "n_pr_f"], ["n_pr_f", "sc_5"],
    ["nc_6", "n_atm"], ["n_atm", "n_cs"], ["n_cs", "sc_6"],

    // Top stores → north corridor
    ["nc_w", "n_center"], ["nc_1", "n_zara"], ["nc_2", "n_mango"],
    ["nc_3", "n_mass"], ["mid_elev", "n_apple"], ["nc_4", "n_apple"],
    ["nc_5", "n_seph"], ["nc_6", "n_dam"], ["nc_e", "n_carr"],

    // Bottom stores → south corridor
    ["sc_w", "n_hm"], ["sc_1", "n_nike"], ["sc_2", "n_adi"],
    ["sc_3", "n_f21"], ["mid_esc", "n_foot"], ["sc_4", "n_bbw"],
    ["sc_5", "n_stc"], ["sc_e", "n_jarir"],

    // Entrances
    ["main_ent", "sc_3"], ["main_ent", "sc_4"],
    ["north_ent", "nc_3"], ["north_ent", "nc_4"],
    ["west_ent", "nc_w"], ["west_ent", "sc_w"],
    ["east_ent", "nc_e"], ["east_ent", "sc_e"],
  ];
  await createEdges(nodes, edges);

  // ── Link stores to nodes ──────────────────────────────────────────────
  await linkStoreNodes(stores, nodes, {
    "Centrepoint": "n_center", "Zara": "n_zara", "Mango": "n_mango",
    "Massimo Dutti": "n_mass", "Apple Store": "n_apple", "Sephora": "n_seph",
    "Damas Jewellery": "n_dam", "Carrefour": "n_carr",
    "H&M": "n_hm", "Nike": "n_nike", "Adidas": "n_adi",
    "Forever 21": "n_f21", "Foot Locker": "n_foot",
    "Bath & Body Works": "n_bbw", "STC": "n_stc", "Jarir Bookstore": "n_jarir",
    "Men's Restroom": "n_wc_m", "Women's Restroom": "n_wc_f",
    "Family Restroom": "n_wc_fam",
    "Men's Prayer Room": "n_pr_m", "Women's Prayer Room": "n_pr_f",
    "Main Elevator": "mid_elev", "Main Escalator": "mid_esc",
    "Information Desk": "mid_info", "ATM Centre": "n_atm",
    "Customer Service": "n_cs",
    "Main Entrance": "main_ent", "North Entrance": "north_ent",
    "West Entrance": "west_ent", "East Entrance": "east_ent",
  });

  return { floor, nodes, stores };
}

// ═════════════════════════════════════════════════════════════════════════════
// FLOOR 1 — food court / cinema / restaurants / kids
// ═════════════════════════════════════════════════════════════════════════════
async function seedFirst(buildingId, groundMidElevNodeId) {
  console.log("\nCreating Floor 1 (Food Court & Cinema)…");
  const floor = await req("POST", "/floors", {
    buildingId,
    name: "Floor 1",
    nameAr: "الطابق الأول",
    level: 1, width: W, height: H,
  });

  const stores = await createStores(floor.id, [
    // Top wall: cinema + premium retail
    { name: "VOX Cinemas",        nameAr: "سينما فوكس",         category: "entertainment", color: C.cinema,     polygon: rect(50,   50,  600, 550),  extrudeHeight: 8 },
    { name: "Pandora",            nameAr: "باندورا",           category: "retail",        color: C.jewelry,    polygon: rect(620,  50,  790, 350) },
    { name: "Swarovski",          nameAr: "سواروفسكي",         category: "retail",        color: C.jewelry,    polygon: rect(810,  50,  980, 350) },
    { name: "Calvin Klein",       nameAr: "كالفن كلاين",       category: "retail",        color: C.fashion,    polygon: rect(1000, 50,  1170, 350) },
    { name: "Tommy Hilfiger",     nameAr: "تومي هيلفيغر",      category: "retail",        color: C.fashion,    polygon: rect(1190, 50,  1360, 350) },
    { name: "GAP",                nameAr: "غاب",                category: "retail",        color: C.fashion,    polygon: rect(1380, 50,  1550, 350) },
    { name: "Lacoste",            nameAr: "لاكوست",            category: "retail",        color: C.fashion,    polygon: rect(1570, 50,  1740, 350) },
    { name: "Lego Store",         nameAr: "متجر ليغو",         category: "retail",        color: C.kids,       polygon: rect(1760, 50,  1950, 350) },

    // 2nd band: kids stores + cafes
    { name: "Toys R Us",          nameAr: "تويز آر أص",        category: "retail",        color: C.kids,       polygon: rect(620,  380, 980, 600), extrudeHeight: 6 },
    { name: "Hamleys",            nameAr: "هاملي",             category: "retail",        color: C.kids,       polygon: rect(1000, 380, 1240, 600) },
    { name: "Starbucks",          nameAr: "ستاربكس",           category: "food",          color: C.cafe,       polygon: rect(1260, 380, 1430, 600) },
    { name: "Tim Hortons",        nameAr: "تيم هورتنز",        category: "food",          color: C.cafe,       polygon: rect(1450, 380, 1620, 600) },
    { name: "Krispy Kreme",       nameAr: "كريسبي كريم",       category: "food",          color: C.cafe,       polygon: rect(1640, 380, 1950, 600) },

    // Central corridor services (food court access from here)
    { name: "Men's Restroom",     nameAr: "دورة مياه رجال",     category: "restroom",      color: C.restroom,   polygon: rect(50,   620, 200, 780) },
    { name: "Women's Restroom",   nameAr: "دورة مياه نساء",     category: "restroom",      color: C.restroom,   polygon: rect(210,  620, 360, 780) },
    { name: "Main Elevator",      nameAr: "المصعد الرئيسي",     category: "elevator",      color: C.elevator,   polygon: rect(820,  640, 960, 760), extrudeHeight: 6 },
    { name: "Main Escalator",     nameAr: "السلم المتحرك",      category: "escalator",     color: C.escalator,  polygon: rect(980,  640, 1130, 760), extrudeHeight: 6 },
    { name: "Family Prayer Room", nameAr: "مصلى عائلي",         category: "services",      color: C.prayer,     polygon: rect(1650, 620, 1950, 780) },

    // ── FOOD COURT ─ y=820..1100 grid of small kiosks ─
    { name: "McDonald's",         nameAr: "ماكدونالدز",        category: "food",          color: C.food,       polygon: rect(50,   820, 230, 1100), extrudeHeight: 5 },
    { name: "KFC",                nameAr: "كنتاكي",            category: "food",          color: C.food,       polygon: rect(250,  820, 430, 1100), extrudeHeight: 5 },
    { name: "Albaik",             nameAr: "البيك",              category: "food",          color: C.food,       polygon: rect(450,  820, 630, 1100), extrudeHeight: 5 },
    { name: "Burger King",        nameAr: "برغر كنغ",          category: "food",          color: C.food,       polygon: rect(650,  820, 830, 1100), extrudeHeight: 5 },
    { name: "Shake Shack",        nameAr: "شيك شاك",           category: "food",          color: C.food,       polygon: rect(850,  820, 1030, 1100), extrudeHeight: 5 },
    { name: "Pizza Hut",          nameAr: "بيتزا هت",          category: "food",          color: C.food,       polygon: rect(1050, 820, 1230, 1100), extrudeHeight: 5 },
    { name: "Subway",             nameAr: "صب واي",            category: "food",          color: C.food,       polygon: rect(1250, 820, 1430, 1100), extrudeHeight: 5 },
    { name: "Panda Express",      nameAr: "باندا إكسبرس",      category: "food",          color: C.food,       polygon: rect(1450, 820, 1630, 1100), extrudeHeight: 5 },
    { name: "Texas Chicken",      nameAr: "تكساس تشيكن",       category: "food",          color: C.food,       polygon: rect(1650, 820, 1830, 1100), extrudeHeight: 5 },
    { name: "Cinnabon",           nameAr: "سينابون",           category: "food",          color: C.cafe,       polygon: rect(1850, 820, 1950, 1100), extrudeHeight: 5 },

    // ── Sit-down restaurants along bottom wall ─
    { name: "Cheesecake Factory", nameAr: "تشيز كيك فاكتوري",   category: "food",          color: C.restaurant, polygon: rect(50,   1130, 480, 1370), extrudeHeight: 6 },
    { name: "PF Chang's",         nameAr: "بي إف تشانغز",      category: "food",          color: C.restaurant, polygon: rect(500,  1130, 900, 1370), extrudeHeight: 6 },
    { name: "Najd Village",       nameAr: "قرية نجد",          category: "food",          color: C.restaurant, polygon: rect(920,  1130, 1320, 1370), extrudeHeight: 6 },
    { name: "Texas Roadhouse",    nameAr: "تكساس رودهاوس",     category: "food",          color: C.restaurant, polygon: rect(1340, 1130, 1700, 1370), extrudeHeight: 6 },
    { name: "Olive Garden",       nameAr: "أوليف غاردن",       category: "food",          color: C.restaurant, polygon: rect(1720, 1130, 1950, 1370), extrudeHeight: 6 },
  ]);

  const nodes = await createNodes(floor.id, [
    // Main horizontal corridors
    { key: "nc_w", x: 100,  y: 580 },
    { key: "nc_1", x: 700,  y: 580 },
    { key: "nc_2", x: 870,  y: 580 },
    { key: "nc_3", x: 1130, y: 580 },
    { key: "nc_4", x: 1350, y: 580 },
    { key: "nc_5", x: 1620, y: 580 },
    { key: "nc_e", x: 1850, y: 580 },

    // Corridor between restrooms and food court (just south of services)
    { key: "sc_w", x: 400,  y: 800 },
    { key: "sc_1", x: 700,  y: 800 },
    { key: "sc_2", x: 870,  y: 800 },
    { key: "sc_3", x: 1130, y: 800 },
    { key: "sc_4", x: 1350, y: 800 },
    { key: "sc_5", x: 1620, y: 800 },
    { key: "sc_e", x: 1900, y: 800 },

    // Food court alley between kiosks and restaurants
    { key: "fc_w", x: 100,  y: 1115 },
    { key: "fc_1", x: 340,  y: 1115 },
    { key: "fc_2", x: 740,  y: 1115 },
    { key: "fc_3", x: 1140, y: 1115 },
    { key: "fc_4", x: 1540, y: 1115 },
    { key: "fc_e", x: 1900, y: 1115 },

    // Mid (front of vertical connectors)
    { key: "mid_elev", x: 890,  y: 700, type: "elevator" },
    { key: "mid_esc",  x: 1050, y: 700, type: "escalator" },

    // Per-store anchor nodes
    { key: "n_vox",    x: 325,  y: 300 },
    { key: "n_pand",   x: 705,  y: 200 },
    { key: "n_swar",   x: 895,  y: 200 },
    { key: "n_ck",     x: 1085, y: 200 },
    { key: "n_th",     x: 1275, y: 200 },
    { key: "n_gap",    x: 1465, y: 200 },
    { key: "n_lac",    x: 1655, y: 200 },
    { key: "n_lego",   x: 1855, y: 200 },

    { key: "n_toys",   x: 800,  y: 490 },
    { key: "n_haml",   x: 1120, y: 490 },
    { key: "n_sb",     x: 1345, y: 490 },
    { key: "n_tim",    x: 1535, y: 490 },
    { key: "n_kk",     x: 1795, y: 490 },

    { key: "n_wc_m",   x: 125,  y: 700 },
    { key: "n_wc_f",   x: 285,  y: 700 },
    { key: "n_pr",     x: 1800, y: 700 },

    // Food court kiosk anchors
    { key: "n_mac",    x: 140,  y: 960 },
    { key: "n_kfc",    x: 340,  y: 960 },
    { key: "n_alb",    x: 540,  y: 960 },
    { key: "n_bk",     x: 740,  y: 960 },
    { key: "n_ssh",    x: 940,  y: 960 },
    { key: "n_pizza",  x: 1140, y: 960 },
    { key: "n_sub",    x: 1340, y: 960 },
    { key: "n_panda",  x: 1540, y: 960 },
    { key: "n_tex",    x: 1740, y: 960 },
    { key: "n_cinna",  x: 1900, y: 960 },

    // Restaurant anchors
    { key: "n_cf",     x: 265,  y: 1250 },
    { key: "n_pf",     x: 700,  y: 1250 },
    { key: "n_najd",   x: 1120, y: 1250 },
    { key: "n_tex_rh", x: 1520, y: 1250 },
    { key: "n_og",     x: 1835, y: 1250 },
  ]);

  const edges = [
    // North corridor
    ["nc_w","nc_1"],["nc_1","nc_2"],["nc_2","nc_3"],["nc_3","nc_4"],
    ["nc_4","nc_5"],["nc_5","nc_e"],
    // South corridor
    ["sc_w","sc_1"],["sc_1","sc_2"],["sc_2","sc_3"],["sc_3","sc_4"],
    ["sc_4","sc_5"],["sc_5","sc_e"],
    // Food-court alley
    ["fc_w","fc_1"],["fc_1","fc_2"],["fc_2","fc_3"],["fc_3","fc_4"],["fc_4","fc_e"],

    // North-south crossings via services band
    ["nc_2","mid_elev"],["mid_elev","sc_2"],
    ["nc_3","mid_esc"],["mid_esc","sc_3"],

    // Restrooms and prayer
    ["nc_w","n_wc_m"],["n_wc_m","n_wc_f"],["n_wc_f","sc_w"],
    ["nc_e","n_pr"],["n_pr","sc_e"],

    // Top stores -> north corridor
    ["nc_w","n_vox"],["nc_1","n_pand"],["nc_2","n_swar"],
    ["nc_3","n_ck"],["nc_3","n_th"],["nc_4","n_gap"],["nc_5","n_lac"],["nc_e","n_lego"],

    // Second band stores -> south corridor
    ["sc_1","n_toys"],["sc_2","n_toys"],
    ["sc_3","n_haml"],["sc_4","n_sb"],["sc_4","n_tim"],["sc_5","n_kk"],

    // South corridor -> food court alley
    ["sc_w","fc_w"],["sc_1","fc_1"],["sc_2","fc_2"],
    ["sc_3","fc_3"],["sc_4","fc_4"],["sc_e","fc_e"],

    // Food court kiosks -> alley
    ["fc_w","n_mac"],["fc_1","n_kfc"],["fc_1","n_alb"],["fc_2","n_bk"],
    ["fc_2","n_ssh"],["fc_3","n_pizza"],["fc_3","n_sub"],
    ["fc_4","n_panda"],["fc_4","n_tex"],["fc_e","n_cinna"],

    // Restaurants connect off the food-court alley
    ["fc_1","n_cf"],["fc_2","n_pf"],["fc_3","n_najd"],
    ["fc_4","n_tex_rh"],["fc_e","n_og"],
  ];
  await createEdges(nodes, edges);

  await linkStoreNodes(stores, nodes, {
    "VOX Cinemas": "n_vox", "Pandora": "n_pand", "Swarovski": "n_swar",
    "Calvin Klein": "n_ck", "Tommy Hilfiger": "n_th", "GAP": "n_gap",
    "Lacoste": "n_lac", "Lego Store": "n_lego",
    "Toys R Us": "n_toys", "Hamleys": "n_haml",
    "Starbucks": "n_sb", "Tim Hortons": "n_tim", "Krispy Kreme": "n_kk",
    "Men's Restroom": "n_wc_m", "Women's Restroom": "n_wc_f",
    "Family Prayer Room": "n_pr",
    "Main Elevator": "mid_elev", "Main Escalator": "mid_esc",
    "McDonald's": "n_mac", "KFC": "n_kfc", "Albaik": "n_alb",
    "Burger King": "n_bk", "Shake Shack": "n_ssh", "Pizza Hut": "n_pizza",
    "Subway": "n_sub", "Panda Express": "n_panda", "Texas Chicken": "n_tex",
    "Cinnabon": "n_cinna",
    "Cheesecake Factory": "n_cf", "PF Chang's": "n_pf",
    "Najd Village": "n_najd", "Texas Roadhouse": "n_tex_rh", "Olive Garden": "n_og",
  });

  // Inter-floor edge: ground elevator <-> first elevator
  const dist = 50; // virtual cost of taking the elevator
  await req("POST", "/nav/edges", {
    fromNodeId: groundMidElevNodeId, toNodeId: nodes.mid_elev.id,
    distance: dist, isAccessible: true,
  });

  return { floor, nodes, stores };
}

// ─── QR Codes ────────────────────────────────────────────────────────────────
async function seedQR(buildingId, gFloor, gNodes, f1Floor, f1Nodes) {
  console.log("\nGenerating QR codes…");
  // Override with: WAIN_APP_URL=http://192.168.1.5:3000 node scripts/seed-mall.mjs
  const APP = process.env.WAIN_APP_URL ?? "http://localhost:3000";
  console.log(`  Encoding URLs against: ${APP}`);
  const items = [
    { floorId: gFloor.id, nodeId: gNodes.main_ent.id,  label: "Ground — Main Entrance" },
    { floorId: gFloor.id, nodeId: gNodes.north_ent.id, label: "Ground — North Entrance" },
    { floorId: gFloor.id, nodeId: gNodes.west_ent.id,  label: "Ground — West Entrance" },
    { floorId: gFloor.id, nodeId: gNodes.east_ent.id,  label: "Ground — East Entrance" },
    { floorId: gFloor.id, nodeId: gNodes.mid_elev.id,  label: "Ground — Elevator Lobby" },
    { floorId: f1Floor.id, nodeId: f1Nodes.mid_elev.id, label: "Floor 1 — Elevator Lobby" },
    { floorId: f1Floor.id, nodeId: f1Nodes.fc_2.id,    label: "Floor 1 — Food Court" },
  ];
  const out = [];
  for (const q of items) {
    const r = await req("POST", "/qr", {
      buildingId, floorId: q.floorId, nodeId: q.nodeId,
      label: q.label, appBaseUrl: APP,
    });
    out.push({ ...q, code: r.code, url: `${APP}/nav/${buildingId}/${q.floorId}/${q.nodeId}` });
    process.stdout.write(`  ✓ ${q.label}\n`);
  }
  return out;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🛍️   Seeding mall demo data…\n");
  await login();
  const building = await seedBuilding();
  console.log(`  Building ID: ${building.id}\n`);

  const { floor: gFloor, nodes: gNodes } = await seedGround(building.id);
  const { floor: f1Floor, nodes: f1Nodes } = await seedFirst(building.id, gNodes.mid_elev.id);
  const qrCodes = await seedQR(building.id, gFloor, gNodes, f1Floor, f1Nodes);

  console.log("\n" + "═".repeat(78));
  console.log("✅  Mall demo ready: Al Rawdah Plaza\n");
  console.log("📋  Building ID :", building.id);
  console.log("🏢  Ground ID   :", gFloor.id);
  console.log("🏢  Floor 1 ID  :", f1Floor.id);
  console.log("\n📱  Test URLs:\n");
  for (const qr of qrCodes) {
    console.log(`  ${qr.label}`);
    console.log(`  ${qr.url}\n`);
  }
  console.log("═".repeat(78));
}

main().catch((e) => {
  console.error("\n❌  Seed failed:", e.message);
  process.exit(1);
});
