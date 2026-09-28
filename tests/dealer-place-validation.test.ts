import assert from "node:assert/strict";
import test from "node:test";
import { validateSelectedDealerPlace } from "../lib/dealer-place-validation.ts";
import type { PinFeature } from "../lib/dealer-geography.ts";

const boundary: PinFeature = {
  type: "Feature", properties: { pin_code: "500001", state: "Telangana" },
  geometry: { type: "Polygon", coordinates: [[[78, 17], [79, 17], [79, 18], [78, 18], [78, 17]]] },
};
const place = { address: "Abids", placeId: "test", latitude: 17.5, longitude: 78.5, postalCode: "500001", state: "Telangana" };

test("accepts a selected place only when postal and boundary evidence agree", () => {
  assert.equal(validateSelectedDealerPlace(place, "500001", "Telangana", boundary), null);
  assert.match(validateSelectedDealerPlace({ ...place, longitude: 80 }, "500001", "Telangana", boundary) ?? "", /outside/);
  assert.match(validateSelectedDealerPlace({ ...place, postalCode: "500002" }, "500001", "Telangana", boundary) ?? "", /500002/);
  assert.match(validateSelectedDealerPlace({ ...place, state: "Karnataka" }, "500001", "Telangana", boundary) ?? "", /Karnataka/);
});
