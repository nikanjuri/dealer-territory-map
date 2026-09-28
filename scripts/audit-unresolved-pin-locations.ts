import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pointInPinFeature, pointInsidePinFeature, type PinFeature } from "../lib/dealer-geography.ts";
import { normalizeIndianState } from "../lib/indian-states.ts";

const report = JSON.parse(await readFile(join(process.cwd(), "outputs/dealer-location-audit.json"), "utf8")) as {
  issues: Array<{ id: number; pincode: string; state: string; area: string; latitude: number; longitude: number }>;
};
const pins = [...new Set(report.issues.map((issue) => issue.pincode))];
const endpoint = "https://livingatlas.esri.in/server/rest/services/IAB2024/IN_Postal_Code_Boundaries_2024/MapServer/0/query";
const params = new URLSearchParams({
  where: `pin_code IN (${pins.map((pin) => `'${pin}'`).join(",")})`,
  outFields: "pin_code,office_name,state,circle_name",
  returnGeometry: "true", outSR: "4326", f: "geojson",
});
const response = await fetch(`${endpoint}?${params}`, { signal: AbortSignal.timeout(20_000) });
if (!response.ok) throw new Error(`Alternative boundary lookup failed (${response.status}).`);
const data = await response.json() as {
  features?: Array<PinFeature & { properties: { office_name?: string; circle_name?: string } }>;
  error?: unknown;
};
if (data.error || !Array.isArray(data.features)) throw new Error("Alternative boundary data is invalid.");
const results = report.issues.map((issue) => {
  const candidates = data.features!.filter((feature) => String(feature.properties.pin_code) === issue.pincode);
  const inside = candidates.some((feature) => pointInPinFeature([issue.longitude, issue.latitude], feature));
  const features = candidates.map((feature) => ({
    office: feature.properties.office_name,
    state: feature.properties.state,
    circle: feature.properties.circle_name,
    stateMatches: normalizeIndianState(String(feature.properties.state ?? "")) === issue.state,
    pointInside: pointInPinFeature([issue.longitude, issue.latitude], feature),
    interiorPoint: pointInsidePinFeature(feature),
  }));
  return { id: issue.id, pin: issue.pincode, area: issue.area, state: issue.state,
    current: [issue.longitude, issue.latitude], inside, features };
});
console.log(JSON.stringify({ source: endpoint, total: results.length,
  inside: results.filter((result) => result.inside).length,
  outside: results.filter((result) => !result.inside).length,
  results }, null, 2));
