import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGeocodingQuery,
  geocodeDealerLocation,
} from "../lib/geocoding.ts";

test("builds a full-address query with postal context", () => {
  assert.equal(
    buildGeocodingQuery({
      address: "12 Market Road",
      area: "Nampally",
      pincode: "500001",
      state: "Telangana",
    }),
    "12 Market Road, Nampally, 500001, Telangana, India",
  );
});

test("uses checked-in PIN coordinates when no address is supplied", async () => {
  let requested = false;
  const result = await geocodeDealerLocation(
    {
      area: "Nampally",
      pincode: "500001",
      state: "Telangana",
      pincodeFallback: [78.47, 17.39],
    },
    (() => {
      requested = true;
      throw new Error("fetch should not run");
    }) as typeof fetch,
  );

  assert.equal(requested, false);
  assert.deepEqual(result, {
    coordinates: [78.47, 17.39],
    precision: "pincode",
  });
});

test("returns an address-derived point when the postcode agrees", async () => {
  let requestedUrl = "";
  const result = await geocodeDealerLocation(
    {
      address: "12 Market Road",
      area: "Nampally",
      pincode: "500001",
      state: "Telangana",
    },
    ((url: string | URL | Request) => {
      requestedUrl = String(url);
      return Promise.resolve(
        new Response(
          JSON.stringify([
            {
              lat: "17.391",
              lon: "78.472",
              display_name: "12 Market Road, Nampally, Hyderabad",
              address: { postcode: "500001" },
            },
          ]),
          { status: 200 },
        ),
      );
    }) as typeof fetch,
  );

  assert.match(requestedUrl, /12\+Market\+Road/);
  assert.deepEqual(result, {
    coordinates: [78.472, 17.391],
    precision: "address",
    resolvedAddress: "12 Market Road, Nampally, Hyderabad",
  });
});

test("rejects address results that only resolve to another postcode", async () => {
  const result = await geocodeDealerLocation(
    {
      address: "Wrong Address",
      area: "Nampally",
      pincode: "500001",
      state: "Telangana",
    },
    (() =>
      Promise.resolve(
        new Response(
          JSON.stringify([
            {
              lat: "17.4",
              lon: "78.5",
              address: { postcode: "500007" },
            },
          ]),
          { status: 200 },
        ),
      )) as typeof fetch,
  );

  assert.equal(result, null);
});
