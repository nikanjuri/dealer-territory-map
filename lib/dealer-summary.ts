import type { Dealer } from "@/app/dealers";

// Fields needed to draw, find, and describe every authorized dealer. Editing
// retrieves the complete current record separately.
export type DealerSummary = Pick<Dealer,
  | "id" | "salesperson" | "dealer" | "pincode" | "area" | "address"
  | "state" | "latitude" | "longitude" | "locationPrecision"
  | "reviewNote" | "postalSuggestions" | "validationStatus"
>;

export function dealerSummary(dealer: Dealer): DealerSummary {
  return {
    id: dealer.id,
    salesperson: dealer.salesperson,
    dealer: dealer.dealer,
    pincode: dealer.pincode,
    area: dealer.area,
    address: dealer.address,
    state: dealer.state,
    latitude: dealer.latitude,
    longitude: dealer.longitude,
    locationPrecision: dealer.locationPrecision,
    reviewNote: dealer.reviewNote,
    postalSuggestions: dealer.postalSuggestions,
    validationStatus: dealer.validationStatus,
  };
}
