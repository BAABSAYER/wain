#!/usr/bin/env node
// Copies web-ifc's WASM into apps/admin/public/web-ifc/ so Next.js serves it
// statically at /web-ifc/web-ifc.wasm. The CadImportModal sets that path on
// the IFC parser at runtime. Runs via the admin's postinstall hook.
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const dest = path.resolve(__dirname, "..", "public", "web-ifc");
fs.mkdirSync(dest, { recursive: true });

let srcDir;
try {
  // web-ifc doesn't expose ./package.json in its exports map, but the WASM sits
  // next to the main entry. Resolve that and take its directory.
  const require = createRequire(import.meta.url);
  srcDir = path.dirname(require.resolve("web-ifc"));
} catch (e) {
  console.warn("[copy-ifc-wasm] web-ifc not installed yet — skipping (will copy on next install).");
  process.exit(0);
}

const files = ["web-ifc.wasm"]; // single-threaded build is enough for our needs
for (const f of files) {
  const src = path.join(srcDir, f);
  if (!fs.existsSync(src)) {
    console.warn(`[copy-ifc-wasm] ${f} not found at ${src} — skipping.`);
    continue;
  }
  fs.copyFileSync(src, path.join(dest, f));
  console.log(`[copy-ifc-wasm] copied ${f}`);
}
