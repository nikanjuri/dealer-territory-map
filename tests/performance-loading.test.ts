import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchWorkspaceBootstrap,
  invalidateWorkspaceBootstraps,
} from "../lib/session-api.ts";
import { loadMissingPincodeBoundaries } from "../lib/pincode-boundaries.ts";
import { dealerFilterKey, pageForFilterRevision } from "../lib/dealer-pagination.ts";

test("bootstrap shares concurrent work, but never retains a settled response", async () => {
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return Response.json({ session: { userId: `user-${requests}` }, dealers: [], salespeople: [], access: { field: true, commerce: false, shop: false }, pendingDealerReviewCount: 0 });
  };
  try {
    invalidateWorkspaceBootstraps();
    const [first, concurrent] = await Promise.all([fetchWorkspaceBootstrap(), fetchWorkspaceBootstrap()]);
    assert.equal(requests, 1);
    assert.equal(first.session.userId, concurrent.session.userId);
    const next = await fetchWorkspaceBootstrap();
    assert.equal(requests, 2);
    assert.notEqual(next.session.userId, first.session.userId);
  } finally {
    invalidateWorkspaceBootstraps();
    globalThis.fetch = original;
  }
});

test("invalidating an in-flight bootstrap starts a new session request", async () => {
  const original = globalThis.fetch;
  let resolveFirst: ((response: Response) => void) | undefined;
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    if (requests === 1) return new Promise<Response>((resolve) => { resolveFirst = resolve; });
    return Response.json({ session: { userId: "new" } });
  };
  try {
    invalidateWorkspaceBootstraps();
    const oldRequest = fetchWorkspaceBootstrap();
    invalidateWorkspaceBootstraps();
    const newRequest = fetchWorkspaceBootstrap();
    resolveFirst?.(Response.json({ session: { userId: "old" } }));
    assert.equal((await newRequest).session.userId, "new");
    assert.equal((await oldRequest).session.userId, "old");
    assert.equal(requests, 2);
  } finally {
    invalidateWorkspaceBootstraps();
    globalThis.fetch = original;
  }
});

test("a failed boundary batch remains retryable while a successful batch stays cached", async () => {
  const original = globalThis.fetch;
  const pins = Array.from({ length: 31 }, (_, index) => String(870000 + index));
  let failLast = true;
  let calls = 0;
  globalThis.fetch = async (input) => {
    calls += 1;
    const url = new URL(String(input));
    const requested = [...(url.searchParams.get("where") ?? "").matchAll(/'(\d{6})'/g)].map((match) => match[1]);
    if (failLast && requested.includes(pins[30])) return new Response(null, { status: 503 });
    return Response.json({ type: "FeatureCollection", features: requested.map((pin) => ({ type: "Feature", properties: { pin_code: pin }, geometry: { type: "Polygon", coordinates: [[[78,17],[79,17],[79,18],[78,17]]] } })) });
  };
  try {
    const batches: number[] = [];
    const first = await loadMissingPincodeBoundaries(pins, (data) => batches.push(data.features.length));
    assert.equal(first.failedBatches, 1);
    assert.deepEqual(batches, [30]);
    failLast = false;
    const retry = await loadMissingPincodeBoundaries(pins, (data) => batches.push(data.features.length));
    assert.equal(retry.failedBatches, 0);
    assert.equal(calls, 4); // Two primary batches, failed-batch backup, then only that PIN on retry.
    assert.deepEqual(batches, [30, 1]);
  } finally {
    globalThis.fetch = original;
  }
});

test("filter identity avoids delimiter collisions and pages reset when a filter changes back", () => {
  const base = { query: "A|B", salespeople: ["A", "B"], state: "all" as const, quality: "all" as const, pincode: "all", area: "all" };
  assert.notEqual(dealerFilterKey(base), dealerFilterKey({ ...base, query: "A", salespeople: ["B|A", "B"] }));
  assert.equal(pageForFilterRevision({ revision: 3, page: 4 }, 3), 4);
  assert.equal(pageForFilterRevision({ revision: 3, page: 4 }, 5), 1);
});
