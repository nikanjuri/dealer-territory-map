import fs from "node:fs/promises";

const source =
  "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/IND/ADM1/geoBoundaries-IND-ADM1_simplified.geojson";
const response = await fetch(source);
if (!response.ok) throw new Error("Boundary download failed: " + response.status);
const geojson = await response.json();
const selected = geojson.features
  .filter((feature) => ["IN-TG", "IN-AP"].includes(feature.properties?.shapeISO))
  .map((feature) => ({
    ...feature,
    properties: {
      ...feature.properties,
      displayName:
        feature.properties.shapeISO === "IN-TG" ? "Telangana" : "Andhra Pradesh",
      coverage: "unassigned",
    },
  }));
if (selected.length !== 2) throw new Error("Expected Telangana and Andhra Pradesh boundaries");
await fs.writeFile(
  new URL("../public/region-boundaries.geojson", import.meta.url),
  JSON.stringify({ type: "FeatureCollection", features: selected }),
);
console.log("Saved Telangana and Andhra Pradesh boundaries");
