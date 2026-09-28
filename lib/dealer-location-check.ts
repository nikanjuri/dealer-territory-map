import type { DealerInput } from "./dealer-contract.ts";
import { pointInPinFeature, type PinFeature } from "./dealer-geography.ts";
import { normalizeIndianState } from "./indian-states.ts";
import type { PostalDirectory } from "./postal-validation.ts";

export type LocationInput = Pick<DealerInput, "pincode" | "state" | "latitude" | "longitude">;
export type LocationIssue = { index: number; pincode: string; message: string };

export function checkDealerLocations(
  inputs: LocationInput[],
  directory: PostalDirectory,
  boundaries: Map<string, PinFeature[]>,
): LocationIssue[] {
  const issues: LocationIssue[] = [];
  inputs.forEach((input, index) => {
    const fail = (message: string) => issues.push({ index, pincode: input.pincode, message });
    if (!directory.records[input.pincode]?.[input.state]) {
      fail(`PIN ${input.pincode} is not listed for ${input.state} in the postal directory.`);
      return;
    }
    const features = boundaries.get(input.pincode) ?? [];
    if (!features.length) {
      fail(`PIN ${input.pincode} has no usable boundary; its map location needs review before saving.`);
      return;
    }
    const inState = features.filter((feature) =>
      normalizeIndianState(String(feature.properties.state ?? "")) === input.state);
    if (!inState.length) {
      fail(`PIN ${input.pincode} has conflicting postal and boundary states; review its location before saving.`);
      return;
    }
    if (!inState.some((feature) => pointInPinFeature([input.longitude, input.latitude], feature))) {
      fail(`The coordinates for PIN ${input.pincode} fall outside its ${input.state} PIN boundary. Check the PIN, area and address before saving.`);
    }
  });
  return issues;
}
