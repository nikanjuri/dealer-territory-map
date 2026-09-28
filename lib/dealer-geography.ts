export type PinFeature = {
  type: "Feature";
  properties: { pin_code?: unknown; state?: unknown; fname?: unknown; [key: string]: unknown };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
};

type Point = [number, number];
type Polygon = number[][][];

function polygons(feature: PinFeature): Polygon[] {
  return feature.geometry.type === "Polygon"
    ? [feature.geometry.coordinates as Polygon]
    : feature.geometry.coordinates as Polygon[];
}

function inRing(point: Point, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const dx = xj - xi;
    const dy = yj - yi;
    const cross = (point[0] - xi) * dy - (point[1] - yi) * dx;
    if (Math.abs(cross) < 1e-10 &&
      point[0] >= Math.min(xi, xj) && point[0] <= Math.max(xi, xj) &&
      point[1] >= Math.min(yi, yj) && point[1] <= Math.max(yi, yj)) return true;
    if ((yi > point[1]) !== (yj > point[1]) &&
      point[0] < (dx * (point[1] - yi)) / dy + xi) inside = !inside;
  }
  return inside;
}

export function pointInPinFeature(point: Point, feature: PinFeature): boolean {
  return polygons(feature).some((polygon) =>
    polygon.length > 0 && inRing(point, polygon[0]) &&
    !polygon.slice(1).some((hole) => inRing(point, hole)));
}

function ringAreaAndCenter(ring: number[][]): { area: number; center: Point } | null {
  let twiceArea = 0;
  let xSum = 0;
  let ySum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    const cross = x1 * y2 - x2 * y1;
    twiceArea += cross;
    xSum += (x1 + x2) * cross;
    ySum += (y1 + y2) * cross;
  }
  if (Math.abs(twiceArea) < 1e-12) return null;
  return { area: Math.abs(twiceArea) / 2, center: [xSum / (3 * twiceArea), ySum / (3 * twiceArea)] };
}

export function pointInsidePinFeature(feature: PinFeature): Point | null {
  const parts = polygons(feature).filter((part) => part[0]?.length >= 4)
    .sort((a, b) => (ringAreaAndCenter(b[0])?.area ?? 0) - (ringAreaAndCenter(a[0])?.area ?? 0));
  for (const part of parts) {
    const center = ringAreaAndCenter(part[0])?.center;
    if (center && pointInPinFeature(center, feature)) return center;
    const xs = part[0].map((point) => point[0]);
    const ys = part[0].map((point) => point[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    // An interior grid point avoids bounding-box centers landing outside concave polygons.
    for (const steps of [5, 11, 25, 51]) {
      for (let row = 0; row < steps; row++) {
        for (let col = 0; col < steps; col++) {
          const candidate: Point = [minX + ((col + 0.5) / steps) * (maxX - minX), minY + ((row + 0.5) / steps) * (maxY - minY)];
          if (pointInPinFeature(candidate, feature)) return candidate;
        }
      }
    }
  }
  return null;
}
