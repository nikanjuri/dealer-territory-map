import { validPinBoundary } from "./pin-boundary-geometry.ts";
import type { PincodeBoundaryData } from "./pincode-boundaries.ts";

// Public postal geometry only. Never put dealer identities or assignments here.
export const BOUNDARY_CACHE_VERSION = "india-pin-2025-plus-2024-v3";
export const BOUNDARY_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DB_NAME = "dealer-ops-public-pin-geometry";
const STORE = "polygons";
const MAX_PINS = 4000;
const STORAGE_TIMEOUT_MS = 2000;
type Feature = PincodeBoundaryData["features"][number];
type Entry = { pin: string; version: string; savedAt: number; features: Feature[] };

function usable(entry: Entry, now: number) {
  return entry?.version === BOUNDARY_CACHE_VERSION && /^\d{6}$/.test(entry.pin) &&
    Number.isFinite(entry.savedAt) && entry.savedAt <= now &&
    now - entry.savedAt < BOUNDARY_CACHE_TTL_MS && Array.isArray(entry.features) &&
    entry.features.length > 0 && entry.features.every((feature) => validPinBoundary(feature) &&
      String(feature.properties.pin_code) === entry.pin);
}

async function storage<T>(mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  if (typeof indexedDB === "undefined") return;
  let db: IDBDatabase | undefined;
  let transaction: IDBTransaction | undefined;
  try {
    return await new Promise<T>((resolve, reject) => {
      let settled = false;
      const finish = (error?: unknown, value?: T) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error); else resolve(value as T);
      };
      const timer = setTimeout(() => {
        finish(new Error("Boundary cache storage timed out."));
        transaction?.abort();
        db?.close();
      }, STORAGE_TIMEOUT_MS);
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "pin" });
      request.onerror = () => finish(request.error);
      request.onblocked = () => finish(new Error("Boundary cache is blocked."));
      request.onsuccess = () => {
        db = request.result;
        if (settled) { db.close(); return; }
        try {
          transaction = db.transaction(STORE, mode);
          const result = operation(transaction.objectStore(STORE));
          transaction.oncomplete = () => finish(undefined, result.result);
          transaction.onerror = () => finish(transaction?.error ?? new Error("Boundary cache failed."));
          transaction.onabort = () => finish(transaction?.error ?? new Error("Boundary cache aborted."));
          result.onerror = () => finish(result.error);
        } catch (error) { finish(error); }
      };
    });
  } catch {
    // Private mode, quota exhaustion and blocked storage must not break the map.
    return;
  } finally { db?.close(); }
}

export async function readPersistentPinBoundaries(): Promise<Feature[]> {
  const entries = await storage("readonly", (store) => store.getAll()) as Entry[] | undefined;
  const now = Date.now();
  return (entries ?? []).filter((entry) => usable(entry, now))
    .sort((a, b) => b.savedAt - a.savedAt).slice(0, MAX_PINS).flatMap((entry) => entry.features);
}

export async function writePersistentPinBoundaries(features: Feature[]) {
  const grouped = new Map<string, Feature[]>();
  for (const feature of features) {
    if (!validPinBoundary(feature)) continue;
    const pin = String(feature.properties.pin_code);
    const matches = grouped.get(pin) ?? [];
    matches.push(feature);
    grouped.set(pin, matches);
  }
  if (!grouped.size) return;
  const bounded = new Map([...grouped].slice(0, MAX_PINS));
  const now = Date.now();
  await storage("readwrite", (store) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const entries = request.result as Entry[];
      const retained = entries.filter((entry) => usable(entry, now) && !bounded.has(entry.pin))
        .sort((a, b) => b.savedAt - a.savedAt).slice(0, Math.max(0, MAX_PINS - bounded.size));
      const keep = new Set([...retained.map((entry) => entry.pin), ...bounded.keys()]);
      for (const entry of entries) if (!keep.has(entry.pin)) store.delete(entry.pin);
      for (const [pin, polygons] of bounded) {
        store.put({ pin, version: BOUNDARY_CACHE_VERSION, savedAt: now, features: polygons } satisfies Entry);
      }
    };
    return request;
  });
}
