import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory, IDBDatabase } from "fake-indexeddb";
import { BOUNDARY_CACHE_TTL_MS, readPersistentPinBoundaries, writePersistentPinBoundaries } from "../lib/pin-boundary-cache.ts";
import type { PincodeBoundaryData } from "../lib/pincode-boundaries.ts";

const polygon = (pin: string): PincodeBoundaryData["features"][number] => ({
  type:"Feature", properties:{pin_code:pin,state:"Telangana"},
  geometry:{type:"Polygon",coordinates:[[[78,17],[79,17],[79,18],[78,17]]]},
});
test.beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });

test("IndexedDB round-trip retains multiple polygon pieces and replaces rather than appends on retry", async () => {
  await writePersistentPinBoundaries([polygon("500010"),polygon("500010"),polygon("500011")]);
  assert.equal((await readPersistentPinBoundaries()).length, 3);
  await writePersistentPinBoundaries([polygon("500010")]);
  assert.equal((await readPersistentPinBoundaries()).length, 2);
});

test("expired geometry is not restored", async () => {
  const now = Date.now;
  const savedAt = now();
  Date.now = () => savedAt;
  try {
    await writePersistentPinBoundaries([polygon("500010")]);
    Date.now = () => savedAt + BOUNDARY_CACHE_TTL_MS;
    assert.deepEqual(await readPersistentPinBoundaries(), []);
  } finally { Date.now = now; }
});

test("old dataset versions are not restored", async () => {
  await writePersistentPinBoundaries([polygon("500010")]);
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("dealer-ops-public-pin-geometry",1);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("polygons","readwrite");
      transaction.objectStore("polygons").put({pin:"500010",version:"old",savedAt:Date.now(),features:[polygon("500010")]});
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
    };
  });
  assert.deepEqual(await readPersistentPinBoundaries(), []);
});

test("malformed geometry cannot enter persistent storage", async () => {
  const invalid = polygon("500010");
  invalid.geometry.coordinates = [];
  await writePersistentPinBoundaries([invalid]);
  assert.deepEqual(await readPersistentPinBoundaries(), []);
});

test("unavailable, blocked and aborted storage degrade to in-memory/network operation", async () => {
  const factory = globalThis.indexedDB;
  const transaction = IDBDatabase.prototype.transaction;
  try {
    Object.defineProperty(globalThis, "indexedDB", { value:undefined, configurable:true,writable:true });
    assert.deepEqual(await readPersistentPinBoundaries(), []);
    await writePersistentPinBoundaries([polygon("500010")]);
    globalThis.indexedDB = factory;
    await writePersistentPinBoundaries([polygon("500010")]);
    IDBDatabase.prototype.transaction = () => { throw new Error("storage denied"); };
    assert.deepEqual(await readPersistentPinBoundaries(), []);
    await writePersistentPinBoundaries([polygon("500010")]);
    IDBDatabase.prototype.transaction = function (...args) {
      const result = transaction.apply(this,args);
      queueMicrotask(() => result.abort());
      return result;
    };
    assert.deepEqual(await readPersistentPinBoundaries(), []);
  } finally { globalThis.indexedDB = factory; IDBDatabase.prototype.transaction = transaction; }
});

test("persistent geometry is bounded to 4,000 PINs", async () => {
  await writePersistentPinBoundaries(Array.from({length:4001},(_,i)=>polygon(String(600000+i))));
  assert.equal((await readPersistentPinBoundaries()).length, 4000);
});
