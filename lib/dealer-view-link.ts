import { INDIAN_STATES } from "./indian-states.ts";
import type { DealerFilters, QualityFilter, StateFilter } from "./dealer-filters";

export function writeDealerViewUrl(url: URL, workspace: "map" | "dealers", filters: DealerFilters, allPeople: string[]) {
  for (const key of ["view", "q", "state", "pin", "area", "quality", "person", "peopleNone"]) url.searchParams.delete(key);
  url.searchParams.set("workspace", workspace);
  url.searchParams.set("view", "1");
  if (filters.query.trim()) url.searchParams.set("q", filters.query.trim());
  if (filters.state !== "all") url.searchParams.set("state", filters.state);
  if (filters.pincode !== "all") url.searchParams.set("pin", filters.pincode);
  if (filters.area !== "all") url.searchParams.set("area", filters.area);
  if (workspace === "dealers" && filters.quality !== "all") url.searchParams.set("quality", filters.quality);
  if (!filters.salespeople.length && allPeople.length) url.searchParams.set("peopleNone", "1");
  else if (filters.salespeople.length !== allPeople.length) {
    for (const person of filters.salespeople) url.searchParams.append("person", person);
  }
  return url;
}

export function readDealerViewUrl(url: URL, people: string[], pincodes: string[], areas: string[]): DealerFilters | null {
  if (url.searchParams.get("view") !== "1") return null;
  const state = url.searchParams.get("state") ?? "all";
  const quality = url.searchParams.get("quality") ?? "all";
  const pin = url.searchParams.get("pin") ?? "all";
  const area = url.searchParams.get("area") ?? "all";
  const requestedPeople = url.searchParams.getAll("person");
  return {
    query: (url.searchParams.get("q") ?? "").slice(0, 200),
    salespeople: url.searchParams.get("peopleNone") === "1" ? [] : requestedPeople.length
      ? people.filter((person) => requestedPeople.includes(person)) : people,
    state: (state === "all" || INDIAN_STATES.includes(state as typeof INDIAN_STATES[number]) ? state : "all") as StateFilter,
    quality: (["all", "verified", "review", "unchecked"].includes(quality) ? quality : "all") as QualityFilter,
    pincode: pincodes.includes(pin) ? pin : "all",
    area: areas.includes(area) ? area : "all",
  };
}
