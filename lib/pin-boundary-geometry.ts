import type { PincodeBoundaryData } from "./pincode-boundaries.ts";

export function validPinBoundary(feature: unknown): feature is PincodeBoundaryData["features"][number] {
  if (!feature || typeof feature !== "object") return false;
  const candidate = feature as PincodeBoundaryData["features"][number];
  if (candidate.type !== "Feature" || !candidate.properties ||
      !/^\d{6}$/.test(String(candidate.properties.pin_code ?? ""))) return false;
  const geometry = candidate.geometry;
  if (!geometry || !["Polygon", "MultiPolygon"].includes(geometry.type) ||
      !Array.isArray(geometry.coordinates)) return false;
  const polygons: unknown[] = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.length > 0 && polygons.every((polygon) => Array.isArray(polygon) &&
    polygon.length > 0 && polygon.every((ring: unknown) => Array.isArray(ring) && ring.length >= 4 &&
      ring.every((point: unknown) => Array.isArray(point) && point.length >= 2 &&
        Number.isFinite(point[0]) && Math.abs(point[0]) <= 180 &&
        Number.isFinite(point[1]) && Math.abs(point[1]) <= 90) &&
      ring[0][0] === ring.at(-1)?.[0] && ring[0][1] === ring.at(-1)?.[1]));
}
