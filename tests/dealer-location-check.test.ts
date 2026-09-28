import assert from "node:assert/strict";
import test from "node:test";
import { checkDealerLocations, type LocationInput } from "../lib/dealer-location-check.ts";
import type { PinFeature } from "../lib/dealer-geography.ts";
import type { PostalDirectory } from "../lib/postal-validation.ts";

const boundary: PinFeature = {
  type: "Feature",
  properties: { pin_code: "500089", state: "Telangana" },
  geometry: { type: "Polygon", coordinates: [
    [[78, 17], [79, 17], [79, 18], [78, 18], [78, 17]],
  ] },
};
const directory = {
  meta: {
    generatedAt: "", retrievedAt: "", sourceAuthority: "", sourceCatalog: "",
    deliveryMirror: "", license: "", sourceSha256: "",
  },
  records: { "500089": { Telangana: { state: "Telangana", districts: [], offices: [], blocks: [] } } },
} satisfies PostalDirectory;
const dealer: LocationInput = { pincode: "500089", state: "Telangana", latitude: 17.5, longitude: 78.5 };

test("accepts a point only inside its own PIN and state", () => {
  assert.deepEqual(checkDealerLocations([dealer], directory, new Map([["500089", [boundary]]])), []);
  const outside = checkDealerLocations([{ ...dealer, longitude: 91.5 }], directory, new Map([["500089", [boundary]]]));
  assert.match(outside[0].message, /outside its Telangana PIN boundary/);
});

test("does not mistake a valid area or PIN for geographic verification", () => {
  const missing = checkDealerLocations([dealer], directory, new Map());
  assert.match(missing[0].message, /no usable boundary/);
  const wrongStateBoundary = { ...boundary, properties: { ...boundary.properties, state: "Andhra Pradesh" } };
  const conflict = checkDealerLocations([dealer], directory, new Map([["500089", [wrongStateBoundary]]]));
  assert.match(conflict[0].message, /conflicting postal and boundary states/);
  const wrongPostalState = checkDealerLocations([{ ...dealer, state: "Karnataka" }], directory, new Map([["500089", [boundary]]]));
  assert.match(wrongPostalState[0].message, /not listed for Karnataka/);
});
