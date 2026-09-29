import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory, IDBDatabase } from "fake-indexeddb";
import { queueVisit, pendingVisits, removePendingVisit, clearPendingVisits } from "../lib/offline-visits.ts";

test.beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });

test("sign-out discards only that user's pending visits", async () => {
  await queueVisit({ userId: "alice", planId: 1, stopId: 2, status: "arrived" });
  await queueVisit({ userId: "bob", planId: 3, stopId: 4, status: "completed" });
  await clearPendingVisits("alice");
  assert.deepEqual(await pendingVisits("alice"), []);
  assert.equal((await pendingVisits("bob"))[0].status, "completed");
});

test("a slow sync acknowledgment cannot delete a newer update", async () => {
  const visit = { userId: "alice", planId: 1, stopId: 2 };
  await queueVisit({ ...visit, status: "arrived" });
  const [sent] = await pendingVisits("alice");
  await queueVisit({ ...visit, status: "completed" });
  await removePendingVisit(sent.key, sent);
  const [newer] = await pendingVisits("alice");
  assert.equal(newer.status, "completed");
  assert.notEqual(newer.revision, sent.revision);
  await removePendingVisit(newer.key, newer);
  assert.deepEqual(await pendingVisits("alice"), []);
});

test("same-status retries receive different revisions, even in one millisecond", async () => {
  const visit = { userId: "alice", planId: 1, stopId: 2, status: "completed" as const };
  await queueVisit(visit);
  const [sent] = await pendingVisits("alice");
  await queueVisit(visit);
  await removePendingVisit(sent.key, sent);
  assert.equal((await pendingVisits("alice")).length, 1);
});

test("explicit discard works and cannot remove another user's stop", async () => {
  await queueVisit({ userId: "alice", planId: 1, stopId: 2, status: "arrived" });
  await queueVisit({ userId: "bob", planId: 1, stopId: 2, status: "arrived" });
  await removePendingVisit("alice:1:2");
  assert.deepEqual(await pendingVisits("alice"), []);
  assert.equal((await pendingVisits("bob")).length, 1);
});

test("an aborted storage transaction rejects instead of hanging", async () => {
  const transaction = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (...args) {
    const result = transaction.apply(this, args);
    if (args[1] === "readonly") queueMicrotask(() => result.abort());
    return result;
  };
  try {
    await queueVisit({ userId: "alice", planId: 1, stopId: 2, status: "arrived" });
    await assert.rejects(pendingVisits("alice"));
  } finally {
    IDBDatabase.prototype.transaction = transaction;
  }
});
