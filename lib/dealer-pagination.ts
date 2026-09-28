import type { DealerFilters } from "./dealer-filters";

export function dealerFilterKey(filters: DealerFilters) {
  return JSON.stringify([
    filters.query,
    [...filters.salespeople].sort(),
    filters.state,
    filters.quality,
    filters.pincode,
    filters.area,
  ]);
}

export function pageForFilterRevision(saved: { revision: number; page: number }, currentRevision: number) {
  return saved.revision === currentRevision ? saved.page : 1;
}
