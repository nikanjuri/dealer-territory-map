import type { PinFeature } from "./dealer-geography.ts";

export const PRIMARY_PIN_BOUNDARY_QUERY =
  "https://livingatlas.esri.in/server1/rest/services/India/Pincode_Boundary_2025/MapServer/0/query";
export const FALLBACK_PIN_BOUNDARY_QUERY =
  "https://livingatlas.esri.in/server/rest/services/IAB2024/IN_Postal_Code_Boundaries_2024/MapServer/0/query";

export function normalizePinBoundaryFeature<T extends PinFeature>(feature: T): T {
  const pin = String(feature.properties.pin_code ?? "");
  const circle = String(feature.properties.circle ?? feature.properties.circle_name ?? "");
  // Both Esri vintages retain an obsolete AP state label for Bhadrachalam.
  // Their Telangana Circle, the current postal directory, India Post's own
  // listing, and the independent state outline agree on Telangana.
  if (pin === "507111" && feature.properties.state === "Andhra Pradesh" &&
      (circle === "Telangana" || circle === "Telangana Circle")) {
    return {
      ...feature,
      properties: { ...feature.properties, state: "Telangana", original_state: "Andhra Pradesh" },
    };
  }
  return feature;
}
