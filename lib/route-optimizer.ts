export type RoutePoint = {
  dealerId: number;
  latitude: number;
  longitude: number;
};

export type OptimizedRoute = {
  dealerIds: number[];
  legMeters: number[];
  legSeconds: number[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
};

const EARTH_RADIUS_METERS = 6_371_000;
const PREVIEW_ROAD_FACTOR = 1.24;
const PREVIEW_SPEED_METERS_PER_SECOND = 35_000 / 3_600;

export function haversineMeters(a: RoutePoint, b: RoutePoint) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(b.latitude - a.latitude);
  const longitudeDelta = toRadians(b.longitude - a.longitude);
  const latitudeA = toRadians(a.latitude);
  const latitudeB = toRadians(b.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeA) *
      Math.cos(latitudeB) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine));
}
function pathDistance(points: RoutePoint[]) {
  return points.slice(1).reduce(
    (total, point, index) => total + haversineMeters(points[index], point),
    0,
  );
}

function improveWithTwoOpt(points: RoutePoint[]) {
  if (points.length < 4) return points;
  let current = points;
  let improved = true;

  while (improved) {
    improved = false;
    const currentDistance = pathDistance(current);
    for (let start = 1; start < current.length - 2; start += 1) {
      for (let end = start + 1; end < current.length - 1; end += 1) {
        const candidate = [
          ...current.slice(0, start),
          ...current.slice(start, end + 1).reverse(),
          ...current.slice(end + 1),
        ];
        if (pathDistance(candidate) + 1 < currentDistance) {
          current = candidate;
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
  }
  return current;
}

export function optimizeRoutePreview(points: RoutePoint[]): OptimizedRoute {
  if (!points.length) {
    return {
      dealerIds: [],
      legMeters: [],
      legSeconds: [],
      totalDistanceMeters: 0,
      totalDurationSeconds: 0,
    };
  }

  const depot: RoutePoint = {
    dealerId: -1,
    latitude: points.reduce((sum, point) => sum + point.latitude, 0) / points.length,
    longitude:
      points.reduce((sum, point) => sum + point.longitude, 0) / points.length,
  };
  const remaining = [...points];
  const ordered: RoutePoint[] = [depot];

  while (remaining.length) {
    const current = ordered.at(-1) ?? depot;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    remaining.forEach((candidate, index) => {
      const distance = haversineMeters(current, candidate);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    ordered.push(remaining.splice(nearestIndex, 1)[0]);
  }
  ordered.push(depot);

  const improved = improveWithTwoOpt(ordered);
  const legMeters = improved.slice(1).map((point, index) =>
    Math.round(haversineMeters(improved[index], point) * PREVIEW_ROAD_FACTOR),
  );
  const legSeconds = legMeters.map((meters) =>
    Math.round(meters / PREVIEW_SPEED_METERS_PER_SECOND),
  );

  return {
    dealerIds: improved.slice(1, -1).map((point) => point.dealerId),
    legMeters,
    legSeconds,
    totalDistanceMeters: legMeters.reduce((sum, meters) => sum + meters, 0),
    totalDurationSeconds: legSeconds.reduce((sum, seconds) => sum + seconds, 0),
  };
}
