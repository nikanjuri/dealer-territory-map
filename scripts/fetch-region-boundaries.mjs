import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { STATE_BOUNDARY_CODES } from "../lib/state-boundaries.ts";

const source =
  "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/IND/ADM1/geoBoundaries-IND-ADM1_simplified.geojson";
const response = await fetch(source);
if (!response.ok) throw new Error("Boundary download failed: " + response.status);
const text = await response.text();
const digest = createHash("sha256").update(text).digest("hex");
if (digest !== "4c63fe43294a391e8f2de4e9f86f3edb60f8688275b9fee90c61fb2aa0c26061") {
  throw new Error("Pinned state source changed; review its provenance before replacing assets.");
}
const geojson = JSON.parse(text);
const names = new Map(Object.entries(STATE_BOUNDARY_CODES).map(([name, code]) => [code, name]));
const features = geojson.features
  .filter((feature) => names.has(feature.properties?.shapeISO))
  .map((feature) => ({
    ...feature,
    properties: {
      ...feature.properties,
      displayName: names.get(feature.properties.shapeISO),
      coverage: "context",
    },
  }));
if (features.length !== names.size || new Set(features.map((feature) => feature.properties.shapeISO)).size !== names.size) {
  throw new Error("Expected one boundary for each of the 36 states and union territories.");
}
const directory = new URL("../public/state-boundaries/", import.meta.url);
await fs.mkdir(directory, { recursive: true });
for (const feature of features) {
  await fs.writeFile(new URL(`${feature.properties.shapeISO}.geojson`, directory),
    JSON.stringify({ type: "FeatureCollection", features: [feature] }));
}
// Retain the original two-state artifact for the existing audit/repair scripts.
const selected = features.filter((feature) => ["IN-TG", "IN-AP"].includes(feature.properties.shapeISO));
await fs.writeFile(
  new URL("../public/region-boundaries.geojson", import.meta.url),
  JSON.stringify({ type: "FeatureCollection", features: selected }),
);
console.log("Saved 36 on-demand state boundaries and retained the AP/Telangana audit artifact");
