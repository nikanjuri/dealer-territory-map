export const MAX_ROUTE_STOPS = 25;

export function selectRouteDealerIds(dealerIds: number[]) {
  return [...new Set(dealerIds)].slice(0, MAX_ROUTE_STOPS);
}

export function toggleRouteDealerId(current: number[], dealerId: number) {
  if (current.includes(dealerId)) {
    return current.filter((id) => id !== dealerId);
  }

  if (current.length >= MAX_ROUTE_STOPS) return current;
  return [...current, dealerId];
}
