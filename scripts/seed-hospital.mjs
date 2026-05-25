/**
 * Hospital Demo Seed
 * Creates: King Faisal Medical Center (2 floors, rooms, nav graph, QR codes)
 * Run: node scripts/seed-hospital.mjs
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

// ─── Canvas dimensions ────────────────────────────────────────────────────────
const W = 1000;
const H = 800;

// ─── Building ─────────────────────────────────────────────────────────────────
async function seedBuilding() {
  console.log("Creating building…");
  // Delete if already exists (by slug)
  const existing = await req("GET", "/buildings");
  const old = existing.find((b) => b.slug === "king-faisal-medical");
  if (old) {
    await req("DELETE", `/buildings/${old.id}`);
    console.log("  Deleted existing demo building.");
  }

  return req("POST", "/buildings", {
    name: "King Faisal Medical Center",
    nameAr: "مستشفى الملك فيصل الطبي",
    slug: "king-faisal-medical",
    address: "King Fahd Road, Riyadh, Saudi Arabia",
  });
}

// ─── Floor 1: Ground Floor ────────────────────────────────────────────────────
//
//  ┌──────────────────────────────────────────────────────────────────────────┐
//  │ RECEPTION          │ PHARMACY         │ RADIOLOGY      │  LABORATORY     │
//  │                    │                  │                │                 │
//  ├────────────────────┴──────────────────┴────────────────┴─────────────────┤
//  │ ENT ──── MAIN CORRIDOR ──── ELEVATOR ──── CORRIDOR ──── CORRIDOR ─── →  │
//  ├────────────────────┬──────────────────┬────────────────┬─────────────────┤
//  │ EMERGENCY          │ RESTROOM M/F     │ CAFETERIA                        │
//  └──────────────────────────────────────────────────────────────────────────┘

async function seedFloor1(buildingId) {
  console.log("Creating Ground Floor…");
  const floor = await req("POST", "/floors", {
    buildingId,
    name: "Ground Floor",
    nameAr: "الطابق الأرضي",
    level: 0,
    width: W,
    height: H,
  });

  // ── Rooms ──────────────────────────────────────────────────────────────────
  const rooms = [
    {
      name: "Main Entrance",      nameAr: "المدخل الرئيسي",    category: "entrance",
      color: "#4ade80",  extrudeHeight: 5,
      polygon: [{x:0,y:330},{x:120,y:330},{x:120,y:470},{x:0,y:470}],
    },
    {
      name: "Reception",          nameAr: "الاستقبال",          category: "services",
      color: "#60a5fa",  extrudeHeight: 4,
      polygon: [{x:120,y:50},{x:360,y:50},{x:360,y:370},{x:120,y:370}],
    },
    {
      name: "Emergency",          nameAr: "الطوارئ",            category: "medical",
      color: "#f87171",  extrudeHeight: 5,
      polygon: [{x:0,y:470},{x:220,y:470},{x:220,y:780},{x:0,y:780}],
    },
    {
      name: "Pharmacy",           nameAr: "الصيدلية",           category: "medical",
      color: "#34d399",  extrudeHeight: 4,
      polygon: [{x:360,y:50},{x:560,y:50},{x:560,y:370},{x:360,y:370}],
    },
    {
      name: "Radiology",          nameAr: "الأشعة",             category: "medical",
      color: "#a78bfa",  extrudeHeight: 4,
      polygon: [{x:560,y:50},{x:780,y:50},{x:780,y:370},{x:560,y:370}],
    },
    {
      name: "Laboratory",         nameAr: "المختبر",            category: "medical",
      color: "#f59e0b",  extrudeHeight: 4,
      polygon: [{x:780,y:50},{x:1000,y:50},{x:1000,y:370},{x:780,y:370}],
    },
    {
      name: "Cafeteria",          nameAr: "الكافيتيريا",        category: "food",
      color: "#fb923c",  extrudeHeight: 4,
      polygon: [{x:560,y:430},{x:1000,y:430},{x:1000,y:780},{x:560,y:780}],
    },
    {
      name: "Men's Restroom",     nameAr: "دورة مياه رجال",     category: "restroom",
      color: "#94a3b8",  extrudeHeight: 3,
      polygon: [{x:360,y:430},{x:470,y:430},{x:470,y:580},{x:360,y:580}],
    },
    {
      name: "Women's Restroom",   nameAr: "دورة مياه نساء",     category: "restroom",
      color: "#94a3b8",  extrudeHeight: 3,
      polygon: [{x:360,y:580},{x:470,y:580},{x:470,y:720},{x:360,y:720}],
    },
    {
      name: "Elevator",           nameAr: "المصعد",             category: "elevator",
      color: "#fbbf24",  extrudeHeight: 4,
      polygon: [{x:470,y:370},{x:560,y:370},{x:560,y:430},{x:470,y:430}],
    },
  ];

  const createdRooms = {};
  for (const room of rooms) {
    const r = await req("POST", "/stores", { floorId: floor.id, isSearchable: true, ...room });
    createdRooms[room.name] = r;
    process.stdout.write(`  ✓ ${room.name}\n`);
  }

  // ── Nav nodes ─────────────────────────────────────────────────────────────
  // Main corridor runs horizontally at y=400 (between y=370 and y=430 is elevator/corridor)
  const nodeData = [
    { key: "entrance",   x: 60,  y: 400, type: "entrance" },
    { key: "n_recept",   x: 240, y: 400, type: "path" },
    { key: "n_recept_i", x: 240, y: 200, type: "path" },  // inside reception
    { key: "n_emerg",    x: 110, y: 600, type: "path" },  // inside emergency
    { key: "n_pharm",    x: 460, y: 200, type: "path" },  // inside pharmacy
    { key: "elevator_g", x: 515, y: 400, type: "elevator" },
    { key: "n_radio",    x: 670, y: 200, type: "path" },  // inside radiology
    { key: "n_lab",      x: 890, y: 200, type: "path" },  // inside lab
    { key: "n_cafe",     x: 780, y: 605, type: "path" },  // inside cafeteria
    { key: "n_wc_m",     x: 415, y: 505, type: "path" },  // men restroom
    { key: "n_wc_f",     x: 415, y: 650, type: "path" },  // women restroom
    { key: "corridor_e", x: 700, y: 400, type: "path" },  // east corridor
    { key: "corridor_ne",x: 700, y: 200, type: "path" },  // north-east junction
  ];

  const nodes = {};
  for (const n of nodeData) {
    const node = await req("POST", "/nav/nodes", { floorId: floor.id, x: n.x, y: n.y, type: n.type });
    nodes[n.key] = node;
  }

  // ── Edges (bidirectional stored as one edge, routing handles both) ─────────
  const edgePairs = [
    ["entrance",   "n_recept"],
    ["n_recept",   "n_recept_i"],
    ["n_recept",   "n_emerg"],
    ["n_recept",   "elevator_g"],
    ["elevator_g", "n_pharm"],
    ["n_pharm",    "n_recept_i"],
    ["elevator_g", "n_wc_m"],
    ["n_wc_m",     "n_wc_f"],
    ["elevator_g", "corridor_e"],
    ["corridor_e", "n_radio"],
    ["corridor_e", "corridor_ne"],
    ["corridor_ne","n_radio"],
    ["corridor_ne","n_lab"],
    ["corridor_e", "n_cafe"],
    ["n_radio",    "n_lab"],
  ];

  for (const [a, b] of edgePairs) {
    const na = nodes[a], nb = nodes[b];
    const dist = Math.sqrt((na.x-nb.x)**2 + (na.y-nb.y)**2);
    await req("POST", "/nav/edges", {
      fromNodeId: na.id, toNodeId: nb.id,
      distance: Math.round(dist), isAccessible: true,
    });
  }

  // ── Link stores to their nearest nav node ─────────────────────────────────
  const storeNodeMap = {
    "Main Entrance":    "entrance",
    "Reception":        "n_recept_i",
    "Emergency":        "n_emerg",
    "Pharmacy":         "n_pharm",
    "Radiology":        "n_radio",
    "Laboratory":       "n_lab",
    "Cafeteria":        "n_cafe",
    "Men's Restroom":   "n_wc_m",
    "Women's Restroom": "n_wc_f",
    "Elevator":         "elevator_g",
  };

  for (const [storeName, nodeKey] of Object.entries(storeNodeMap)) {
    const store = createdRooms[storeName];
    const node  = nodes[nodeKey];
    if (store && node) {
      await req("PATCH", `/stores/${store.id}`, { navNodeId: node.id });
    }
  }

  return { floor, nodes, createdRooms };
}

// ─── Floor 2: Outpatient Clinics ──────────────────────────────────────────────
async function seedFloor2(buildingId, floor1ElevatorNodeId) {
  console.log("Creating Floor 2 (Outpatient Clinics)…");
  const floor = await req("POST", "/floors", {
    buildingId,
    name: "Floor 1 — Outpatient Clinics",
    nameAr: "الطابق الأول — العيادات الخارجية",
    level: 1,
    width: W,
    height: H,
  });

  const rooms = [
    {
      name: "Cardiology Clinic",      nameAr: "عيادة أمراض القلب",  category: "medical",
      color: "#f87171",  extrudeHeight: 4,
      polygon: [{x:0,y:50},{x:250,y:50},{x:250,y:370},{x:0,y:370}],
    },
    {
      name: "Orthopedics Clinic",      nameAr: "عيادة العظام",        category: "medical",
      color: "#60a5fa",  extrudeHeight: 4,
      polygon: [{x:250,y:50},{x:500,y:50},{x:500,y:370},{x:250,y:370}],
    },
    {
      name: "Pediatrics Clinic",       nameAr: "عيادة الأطفال",       category: "medical",
      color: "#34d399",  extrudeHeight: 4,
      polygon: [{x:500,y:50},{x:750,y:50},{x:750,y:370},{x:500,y:370}],
    },
    {
      name: "Dermatology Clinic",      nameAr: "عيادة الجلدية",       category: "medical",
      color: "#a78bfa",  extrudeHeight: 4,
      polygon: [{x:750,y:50},{x:1000,y:50},{x:1000,y:370},{x:750,y:370}],
    },
    {
      name: "ENT Clinic",              nameAr: "عيادة الأنف والأذن",  category: "medical",
      color: "#f59e0b",  extrudeHeight: 4,
      polygon: [{x:0,y:430},{x:250,y:430},{x:250,y:780},{x:0,y:780}],
    },
    {
      name: "Ophthalmology Clinic",    nameAr: "عيادة طب العيون",     category: "medical",
      color: "#38bdf8",  extrudeHeight: 4,
      polygon: [{x:250,y:430},{x:500,y:430},{x:500,y:780},{x:250,y:780}],
    },
    {
      name: "Waiting Area",            nameAr: "منطقة الانتظار",      category: "services",
      color: "#94a3b8",  extrudeHeight: 3,
      polygon: [{x:500,y:430},{x:780,y:430},{x:780,y:780},{x:500,y:780}],
    },
    {
      name: "Elevator",                nameAr: "المصعد",              category: "elevator",
      color: "#fbbf24",  extrudeHeight: 4,
      polygon: [{x:470,y:370},{x:560,y:370},{x:560,y:430},{x:470,y:430}],
    },
    {
      name: "Restroom",                nameAr: "دورة المياه",         category: "restroom",
      color: "#94a3b8",  extrudeHeight: 3,
      polygon: [{x:780,y:430},{x:900,y:430},{x:900,y:780},{x:780,y:780}],
    },
  ];

  const createdRooms = {};
  for (const room of rooms) {
    const r = await req("POST", "/stores", { floorId: floor.id, isSearchable: true, ...room });
    createdRooms[room.name] = r;
    process.stdout.write(`  ✓ ${room.name}\n`);
  }

  const nodeData = [
    { key: "elevator_1",  x: 515, y: 400, type: "elevator", connectedFloorNodeId: floor1ElevatorNodeId },
    { key: "n_cardio",    x: 125, y: 210, type: "path" },
    { key: "n_ortho",     x: 375, y: 210, type: "path" },
    { key: "n_peds",      x: 625, y: 210, type: "path" },
    { key: "n_derm",      x: 875, y: 210, type: "path" },
    { key: "n_ent",       x: 125, y: 605, type: "path" },
    { key: "n_ophth",     x: 375, y: 605, type: "path" },
    { key: "n_wait",      x: 640, y: 605, type: "path" },
    { key: "n_wc_2",      x: 840, y: 605, type: "path" },
    { key: "corr_w",      x: 250, y: 400, type: "path" },
    { key: "corr_e",      x: 750, y: 400, type: "path" },
  ];

  const nodes = {};
  for (const n of nodeData) {
    const payload = { floorId: floor.id, x: n.x, y: n.y, type: n.type };
    if (n.connectedFloorNodeId) payload.connectedFloorNodeId = n.connectedFloorNodeId;
    const node = await req("POST", "/nav/nodes", payload);
    nodes[n.key] = node;
  }

  const edgePairs = [
    ["elevator_1", "corr_w"],
    ["elevator_1", "corr_e"],
    ["corr_w",     "n_cardio"],
    ["corr_w",     "n_ortho"],
    ["corr_w",     "n_ent"],
    ["corr_w",     "n_ophth"],
    ["elevator_1", "n_peds"],
    ["corr_e",     "n_peds"],
    ["corr_e",     "n_derm"],
    ["corr_e",     "n_wait"],
    ["corr_e",     "n_wc_2"],
    ["n_cardio",   "n_ortho"],
    ["n_peds",     "n_derm"],
    ["n_ent",      "n_ophth"],
    ["n_ophth",    "n_wait"],
    ["n_wait",     "n_wc_2"],
  ];

  for (const [a, b] of edgePairs) {
    const na = nodes[a], nb = nodes[b];
    const dist = Math.sqrt((na.x-nb.x)**2 + (na.y-nb.y)**2);
    await req("POST", "/nav/edges", {
      fromNodeId: na.id, toNodeId: nb.id,
      distance: Math.round(dist), isAccessible: true,
    });
  }

  const storeNodeMap = {
    "Cardiology Clinic":    "n_cardio",
    "Orthopedics Clinic":   "n_ortho",
    "Pediatrics Clinic":    "n_peds",
    "Dermatology Clinic":   "n_derm",
    "ENT Clinic":           "n_ent",
    "Ophthalmology Clinic": "n_ophth",
    "Waiting Area":         "n_wait",
    "Elevator":             "elevator_1",
    "Restroom":             "n_wc_2",
  };

  for (const [storeName, nodeKey] of Object.entries(storeNodeMap)) {
    const store = createdRooms[storeName];
    const node  = nodes[nodeKey];
    if (store && node) {
      await req("PATCH", `/stores/${store.id}`, { navNodeId: node.id });
    }
  }

  return { floor, nodes, createdRooms };
}

// ─── QR Codes ─────────────────────────────────────────────────────────────────
async function seedQR(buildingId, floor1, nodes1, floor2, nodes2) {
  console.log("\nGenerating QR codes…");
  const APP = process.env.WAIN_APP_URL ?? "http://localhost:3000";
  console.log(`  Encoding URLs against: ${APP}`);

  const qrPoints = [
    // Floor 1
    { floorId: floor1.id, nodeId: nodes1.entrance.id,   label: "Main Entrance — Scanner 1" },
    { floorId: floor1.id, nodeId: nodes1.n_recept.id,   label: "Reception Desk" },
    { floorId: floor1.id, nodeId: nodes1.elevator_g.id, label: "Ground Floor Elevator" },
    { floorId: floor1.id, nodeId: nodes1.n_emerg.id,    label: "Emergency Department" },
    // Floor 2
    { floorId: floor2.id, nodeId: nodes2.elevator_1.id, label: "Floor 1 Elevator" },
    { floorId: floor2.id, nodeId: nodes2.corr_w.id,     label: "West Wing — Clinics Corridor" },
  ];

  const results = [];
  for (const qr of qrPoints) {
    const result = await req("POST", "/qr", {
      buildingId,
      floorId: qr.floorId,
      nodeId: qr.nodeId,
      label: qr.label,
      appBaseUrl: APP,
    });
    results.push({ label: qr.label, code: result.code, url: `${APP}/nav/${buildingId}/${qr.floorId}/${qr.nodeId}` });
    process.stdout.write(`  ✓ ${qr.label}\n`);
  }

  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🏥  Seeding hospital demo data…\n");
  await login();

  const building = await seedBuilding();
  console.log(`  Building ID: ${building.id}\n`);

  const { floor: f1, nodes: n1, createdRooms: r1 } = await seedFloor1(building.id);
  const { floor: f2, nodes: n2, createdRooms: r2 } = await seedFloor2(building.id, n1.elevator_g.id);

  const qrCodes = await seedQR(building.id, f1, n1, f2, n2);

  console.log("\n" + "═".repeat(72));
  console.log("✅  Hospital demo ready!\n");
  console.log("📋  Building ID :", building.id);
  console.log("🏢  Floor G ID  :", f1.id);
  console.log("🏢  Floor 1 ID  :", f2.id);
  console.log("\n📱  Test URLs (scan these or open directly in browser):\n");
  for (const qr of qrCodes) {
    console.log(`  ${qr.label}`);
    console.log(`  ${qr.url}`);
    console.log(`  QR Code: ${qr.code}\n`);
  }

  console.log("🗺️   Admin map builder:");
  console.log(`  http://localhost:3001/buildings/${building.id}\n`);
  console.log("📖  API docs: http://localhost:4000/api/docs");
  console.log("═".repeat(72));
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
