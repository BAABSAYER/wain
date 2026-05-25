/**
 * One-shot database seeder for the Docker deploy. Runs as the compose `seed`
 * service once the API is healthy, so `docker compose up` feeds the DB in the
 * same command — no Node needed on the host.
 *
 * Idempotent: if the DB already has buildings it skips, so re-running
 * `docker compose up` never duplicates data.
 *
 * Env:
 *   WAIN_API_URL   internal API base (e.g. http://api:4000/api)
 *   WAIN_APP_URL   public base URL baked into the generated QR codes
 *   ADMIN_PASSWORD admin password used by each seed script to log in
 *   SEED_SCRIPTS   comma-separated list to run (default: mall + hospital + saud1)
 */
import { execSync } from "node:child_process";

const API = process.env.WAIN_API_URL || "http://localhost:4000/api";
const SEEDS = (process.env.SEED_SCRIPTS || "seed-mall.mjs,seed-hospital.mjs,seed-saud1.mjs")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

async function main() {
  // Idempotency guard — never reseed a populated database.
  try {
    const res = await fetch(`${API}/buildings`);
    if (res.ok) {
      const buildings = await res.json();
      if (Array.isArray(buildings) && buildings.length > 0) {
        console.log(`✅ Database already has ${buildings.length} building(s) — skipping seed.`);
        return;
      }
    }
  } catch (e) {
    console.error(`⚠ Could not reach API at ${API}: ${e.message}`);
    process.exit(1);
  }

  let ok = 0;
  for (const s of SEEDS) {
    try {
      console.log(`\n▶ Running ${s} ...`);
      execSync(`node scripts/${s}`, { stdio: "inherit", env: process.env, cwd: "/app" });
      ok++;
    } catch {
      console.error(`⚠ ${s} failed — continuing with the rest.`);
    }
  }
  console.log(`\n✅ Seeding done (${ok}/${SEEDS.length} demos loaded).`);
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
