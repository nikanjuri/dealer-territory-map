import type { Dealer } from "../app/dealers";
import type { DealerSummary } from "./dealer-summary";

export type StateFilter = "all" | Dealer["state"];
export type QualityFilter = "all" | "verified" | "review" | "unchecked";

export type DealerFilters = {
  query: string;
  salespeople: string[];
  state: StateFilter;
  quality: QualityFilter;
  pincode: string;
  area: string;
};

export function dealerQualityBucket(dealer: DealerSummary): Exclude<QualityFilter, "all"> {
  const status = dealer.validationStatus ?? (dealer.reviewNote ? "review" : "unchecked");
  if (status === "verified") return "verified";
  if (status === "review" || status === "invalid") return "review";
  return "unchecked";
}

export function filterDealerRecords<T extends DealerSummary>(dealers: T[], filters: DealerFilters): T[] {
  const normalized = filters.query.trim().toLowerCase();
  return dealers.filter((dealer) => {
    if (!filters.salespeople.includes(dealer.salesperson)) return false;
    if (filters.state !== "all" && dealer.state !== filters.state) return false;
    if (
      filters.quality !== "all" &&
      dealerQualityBucket(dealer) !== filters.quality
    ) {
      return false;
    }
    if (filters.pincode !== "all" && dealer.pincode !== filters.pincode)
      return false;
    if (filters.area !== "all" && dealer.area !== filters.area) return false;
    if (!normalized) return true;
    return [
      dealer.dealer,
      dealer.address,
      dealer.area,
      dealer.pincode,
      dealer.salesperson,
      dealer.state,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(normalized);
  });
}
