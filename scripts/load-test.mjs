#!/usr/bin/env node

const DEFAULT_MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

function parseArgs(argv) {
  const args = {
    base: process.env.WAIN_LOAD_BASE || "http://localhost:8787",
    concurrency: 100,
    requests: 1000,
    duration: 0,
    timeout: 15000,
    includeWrites: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--base") { args.base = next; i++; }
    else if (arg === "--concurrency") { args.concurrency = Number(next); i++; }
    else if (arg === "--requests") { args.requests = Number(next); i++; }
    else if (arg === "--duration") { args.duration = Number(next); i++; }
    else if (arg === "--timeout") { args.timeout = Number(next); i++; }
    else if (arg === "--include-writes") { args.includeWrites = true; }
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  args.base = args.base.replace(/\/$/, "");
  if (!Number.isFinite(args.concurrency) || args.concurrency < 1) throw new Error("--concurrency must be >= 1");
  if (!Number.isFinite(args.requests) || args.requests < 1) throw new Error("--requests must be >= 1");
  if (!Number.isFinite(args.duration) || args.duration < 0) throw new Error("--duration must be >= 0");
  return args;
}

function printHelp() {
  console.log(`Wain load test

Usage:
  node scripts/load-test.mjs --base https://wain.example.com --concurrency 100 --requests 1000
  node scripts/load-test.mjs --base http://localhost:8787 --concurrency 100 --duration 60

Options:
  --base URL          Public Wain base URL. Default: http://localhost:8787
  --concurrency N    Number of simultaneous virtual users. Default: 100
  --requests N       Total requests for request-count mode. Default: 1000
  --duration SEC     Duration mode. If set, ignores --requests as a hard stop.
  --timeout MS       Per-request timeout. Default: 15000
  --include-writes   Also POST analytics events. Off by default to avoid DB noise.
`);
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": DEFAULT_MOBILE_UA, accept: "application/json" },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function discoverScenario(base, timeoutMs, includeWrites) {
  const buildings = await fetchJson(`${base}/api/buildings`, timeoutMs);
  const building = buildings[0];
  if (!building?.id) {
    return [
      { name: "home", method: "GET", path: "/", weight: 5 },
      { name: "buildings", method: "GET", path: "/api/buildings", weight: 5 },
    ];
  }

  const full = await fetchJson(`${base}/api/buildings/${building.id}`, timeoutMs);
  const floors = full.floors ?? [];
  const floor = floors.find((f) => (f.navNodes ?? []).length > 0) ?? floors[0];
  const node = floor?.navNodes?.[0];
  const stores = floors.flatMap((f) => (f.stores ?? []).map((s) => ({ ...s, floorId: f.id })));
  const searchable = stores.find((s) => s.name && s.navNodeId) ?? stores.find((s) => s.name);
  const routeStore = stores.find((s) => s.navNodeId);

  const scenario = [
    { name: "home", method: "GET", path: "/", weight: 4 },
    { name: "buildings", method: "GET", path: "/api/buildings", weight: 4 },
    { name: "building-detail", method: "GET", path: `/api/buildings/${building.id}`, weight: 10 },
  ];

  if (node) {
    scenario.push({ name: "nav-page", method: "GET", path: `/nav/${building.id}/${floor.id}/${node.id}`, weight: 20 });
    scenario.push({ name: "nav-graph", method: "GET", path: `/api/nav/graph/${building.id}`, weight: 8 });
  }

  if (searchable) {
    const q = encodeURIComponent(String(searchable.name).slice(0, 8));
    scenario.push({ name: "search", method: "GET", path: `/api/stores/search?buildingId=${building.id}&q=${q}`, weight: 8 });
  }

  if (node && routeStore) {
    scenario.push({
      name: "route",
      method: "GET",
      path: `/api/route?from=${node.id}&to=${routeStore.id}&accessible=false`,
      weight: 6,
    });
  }

  if (includeWrites) {
    scenario.push({
      name: "analytics-track",
      method: "POST",
      path: "/api/analytics/track",
      weight: 1,
      body: { buildingId: building.id, floorId: floor?.id, eventType: "qr_scan", qrCode: node?.id },
    });
  }

  return scenario;
}

function pickWeighted(items) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let n = Math.random() * total;
  for (const item of items) {
    n -= item.weight;
    if (n <= 0) return item;
  }
  return items[items.length - 1];
}

async function requestOnce(base, endpoint, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = performance.now();
  try {
    const res = await fetch(`${base}${endpoint.path}`, {
      method: endpoint.method,
      signal: controller.signal,
      headers: {
        "user-agent": DEFAULT_MOBILE_UA,
        accept: endpoint.method === "GET" ? "text/html,application/json" : "application/json",
        ...(endpoint.body ? { "content-type": "application/json" } : {}),
      },
      body: endpoint.body ? JSON.stringify(endpoint.body) : undefined,
    });
    const text = await res.text();
    return {
      name: endpoint.name,
      status: res.status,
      ok: res.status >= 200 && res.status < 400,
      ms: performance.now() - start,
      bytes: Buffer.byteLength(text),
    };
  } catch (err) {
    return {
      name: endpoint.name,
      status: 0,
      ok: false,
      ms: performance.now() - start,
      bytes: 0,
      error: err?.name || err?.message || "error",
    };
  } finally {
    clearTimeout(timer);
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

function summarize(results, startedAt, finishedAt) {
  const latencies = results.map((r) => r.ms).sort((a, b) => a - b);
  const ok = results.filter((r) => r.ok).length;
  const failed = results.length - ok;
  const seconds = (finishedAt - startedAt) / 1000;
  const bytes = results.reduce((sum, r) => sum + r.bytes, 0);
  const byName = new Map();
  const byStatus = new Map();

  for (const r of results) {
    const group = byName.get(r.name) ?? { count: 0, ok: 0, latencies: [] };
    group.count++;
    if (r.ok) group.ok++;
    group.latencies.push(r.ms);
    byName.set(r.name, group);
    byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
  }

  console.log("\nSummary");
  console.log(`  Requests: ${results.length}`);
  console.log(`  Success:  ${ok}`);
  console.log(`  Failed:   ${failed}`);
  console.log(`  RPS:      ${(results.length / seconds).toFixed(2)}`);
  console.log(`  Transfer: ${(bytes / 1024 / 1024).toFixed(2)} MiB`);
  console.log(`  Latency:  avg ${avg(latencies).toFixed(0)}ms | p50 ${percentile(latencies, 50).toFixed(0)}ms | p95 ${percentile(latencies, 95).toFixed(0)}ms | p99 ${percentile(latencies, 99).toFixed(0)}ms`);
  console.log(`  Status:   ${[...byStatus.entries()].sort((a, b) => a[0] - b[0]).map(([s, c]) => `${s}:${c}`).join(" ")}`);

  console.log("\nBy endpoint");
  for (const [name, group] of [...byName.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    group.latencies.sort((a, b) => a - b);
    console.log(`  ${name.padEnd(16)} count ${String(group.count).padStart(5)} | ok ${String(group.ok).padStart(5)} | p95 ${percentile(group.latencies, 95).toFixed(0)}ms`);
  }
}

function avg(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}

async function main() {
  const args = parseArgs(process.argv);
  console.log(`Target:      ${args.base}`);
  console.log(`Concurrency: ${args.concurrency}`);
  console.log(args.duration > 0 ? `Duration:    ${args.duration}s` : `Requests:    ${args.requests}`);
  console.log(`Writes:      ${args.includeWrites ? "enabled" : "disabled"}`);

  const scenario = await discoverScenario(args.base, args.timeout, args.includeWrites);
  console.log("Scenario:");
  for (const item of scenario) console.log(`  ${item.method.padEnd(4)} ${item.path} (${item.name}, weight ${item.weight})`);

  const results = [];
  let issued = 0;
  const startedAt = performance.now();
  const endAt = args.duration > 0 ? startedAt + args.duration * 1000 : Infinity;

  async function worker() {
    while (performance.now() < endAt) {
      if (args.duration === 0) {
        if (issued >= args.requests) break;
        issued++;
      } else {
        issued++;
      }
      results.push(await requestOnce(args.base, pickWeighted(scenario), args.timeout));
      if (issued % 100 === 0) process.stdout.write(".");
    }
  }

  await Promise.all(Array.from({ length: args.concurrency }, () => worker()));
  const finishedAt = performance.now();
  summarize(results, startedAt, finishedAt);

  const failed = results.filter((r) => !r.ok).length;
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
