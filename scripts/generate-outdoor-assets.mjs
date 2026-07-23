import fs from "node:fs/promises";
import path from "node:path";
import * as THREE from "../apps/web/node_modules/three/build/three.module.js";
import { GLTFExporter } from "../apps/web/node_modules/three/examples/jsm/exporters/GLTFExporter.js";

globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((result) => { this.result = result; this.onloadend?.(); }); }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = `data:${blob.type};base64,${Buffer.from(result).toString("base64")}`;
      this.onloadend?.();
    });
  }
};

const material = (color, metalness = 0.1, roughness = 0.65, opacity = 1) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness, transparent: opacity < 1, opacity });
const addBox = (group, size, position, color, rotation = [0, 0, 0], opacity = 1) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material(color, 0.12, 0.58, opacity));
  mesh.position.set(...position); mesh.rotation.set(...rotation); group.add(mesh); return mesh;
};
const addCylinder = (group, radius, height, position, color, rotation = [0, 0, 0], segments = 16) => {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), material(color, 0.25, 0.5));
  mesh.position.set(...position); mesh.rotation.set(...rotation); group.add(mesh); return mesh;
};

function car() {
  const g = new THREE.Group();
  addBox(g, [4.2, 0.75, 1.8], [0, 0.75, 0], "#2563eb");
  addBox(g, [2.2, 0.7, 1.55], [-0.15, 1.45, 0], "#93c5fd");
  addBox(g, [0.08, 0.48, 1.4], [1.03, 1.45, 0], "#1e3a5f");
  for (const x of [-1.35, 1.35]) for (const z of [-0.92, 0.92]) {
    addCylinder(g, 0.38, 0.24, [x, 0.42, z], "#111827", [Math.PI / 2, 0, 0]);
  }
  addBox(g, [0.18, 0.25, 1.3], [2.12, 0.78, 0], "#f8fafc");
  addBox(g, [0.12, 0.22, 1.25], [-2.12, 0.76, 0], "#ef4444");
  return g;
}

function streetlight() {
  const g = new THREE.Group();
  addCylinder(g, 0.13, 5.6, [0, 2.8, 0], "#475569");
  addBox(g, [1.7, 0.13, 0.13], [0.78, 5.55, 0], "#475569");
  addBox(g, [0.75, 0.18, 0.42], [1.55, 5.42, 0], "#e2e8f0", [0, 0, -0.12]);
  addCylinder(g, 0.34, 0.12, [0, 0.06, 0], "#334155");
  return g;
}

function bollard() {
  const g = new THREE.Group();
  addCylinder(g, 0.2, 1.05, [0, 0.52, 0], "#475569");
  addCylinder(g, 0.21, 0.13, [0, 0.72, 0], "#f8fafc");
  addCylinder(g, 0.23, 0.12, [0, 1.07, 0], "#334155");
  return g;
}

function busShelter() {
  const g = new THREE.Group();
  for (const x of [-2, 2]) for (const z of [-0.7, 0.7]) addCylinder(g, 0.08, 2.7, [x, 1.35, z], "#334155");
  addBox(g, [4.5, 0.16, 1.8], [0, 2.75, 0], "#475569");
  addBox(g, [4, 1.9, 0.06], [0, 1.55, 0.72], "#7dd3fc", [0, 0, 0], 0.38);
  addBox(g, [3.2, 0.18, 0.65], [0, 0.75, 0.1], "#92400e");
  addBox(g, [0.12, 0.7, 0.12], [-1.3, 0.36, 0.1], "#475569");
  addBox(g, [0.12, 0.7, 0.12], [1.3, 0.36, 0.1], "#475569");
  return g;
}

function bikeRack() {
  const g = new THREE.Group();
  for (const x of [-0.9, 0, 0.9]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.07, 10, 24, Math.PI), material("#64748b", 0.65, 0.3));
    hoop.position.set(x, 0.65, 0); hoop.rotation.z = Math.PI; g.add(hoop);
    addCylinder(g, 0.07, 0.65, [x - 0.62, 0.32, 0], "#64748b");
    addCylinder(g, 0.07, 0.65, [x + 0.62, 0.32, 0], "#64748b");
  }
  return g;
}

function gate() {
  const g = new THREE.Group();
  addBox(g, [0.32, 2.8, 0.32], [-2.2, 1.4, 0], "#334155");
  addBox(g, [0.32, 2.8, 0.32], [2.2, 1.4, 0], "#334155");
  addBox(g, [4.1, 0.12, 0.12], [0, 2.35, 0], "#64748b");
  addBox(g, [4.1, 0.12, 0.12], [0, 0.45, 0], "#64748b");
  for (let x = -1.8; x <= 1.8; x += 0.45) addBox(g, [0.08, 1.9, 0.08], [x, 1.4, 0], "#64748b");
  return g;
}

const output = path.resolve("apps/web/public/models/map-assets");
await fs.mkdir(output, { recursive: true });
const exporter = new GLTFExporter();
for (const [name, object] of Object.entries({
  car: car(), streetlight: streetlight(), bollard: bollard(),
  "bus-shelter": busShelter(), "bike-rack": bikeRack(), gate: gate(),
})) {
  object.traverse((child) => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
  const result = await exporter.parseAsync(object, { binary: true, onlyVisible: true });
  await fs.writeFile(path.join(output, `${name}.glb`), Buffer.from(result));
  console.log(`generated ${name}.glb`);
}
