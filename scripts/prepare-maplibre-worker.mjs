import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const maplibreRoot = resolve(projectRoot, "node_modules/maplibre-gl");
const maplibreDist = resolve(maplibreRoot, "dist");
const pdfjsRoot = resolve(projectRoot, "node_modules/pdfjs-dist");
const publicDirectory = resolve(projectRoot, "public");

mkdirSync(publicDirectory, { recursive: true });

for (const [source, destination] of [
  [resolve(maplibreDist, "maplibre-gl-worker.mjs"), "maplibre-gl-worker.mjs"],
  [resolve(maplibreDist, "maplibre-gl-shared.mjs"), "maplibre-gl-shared.mjs"],
  [resolve(maplibreRoot, "LICENSE.txt"), "maplibre-gl.LICENSE.txt"],
  [resolve(pdfjsRoot, "legacy/build/pdf.worker.min.mjs"), "pdf.worker.min.mjs"],
  [resolve(pdfjsRoot, "LICENSE"), "pdfjs.LICENSE.txt"],
]) {
  copyFileSync(source, resolve(publicDirectory, destination));
}

console.log("Prepared the MapLibre and PDF worker assets in public/.");
