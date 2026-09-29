import type { RouteStopStatus } from "./route-contract";

export type PendingVisit = {
  key: string;
  userId: string;
  planId: number;
  stopId: number;
  status: RouteStopStatus;
  queuedAt: string;
  revision?: string;
};

const DB_NAME = "dealer-ops-visit-outbox-v1";
const STORE = "visits";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = operation(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error("Offline visit storage transaction was aborted."));
    });
  } finally {
    db.close();
  }
}

export async function queueVisit(visit: Omit<PendingVisit, "key" | "queuedAt">) {
  await run("readwrite", (store) => store.put({
    ...visit,
    key: `${visit.userId}:${visit.planId}:${visit.stopId}`,
    queuedAt: new Date().toISOString(),
    revision: crypto.randomUUID(),
  } satisfies PendingVisit));
}

export async function pendingVisits(userId: string): Promise<PendingVisit[]> {
  const all = await run("readonly", (store) => store.getAll()) as PendingVisit[];
  return all.filter((visit) => visit.userId === userId).sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

export async function removePendingVisit(key: string, expected?: PendingVisit) {
  await run("readwrite", (store) => {
    const request = store.get(key);
    request.onsuccess = () => {
      const current = request.result as PendingVisit | undefined;
      if (!expected || (current && (expected.revision
        ? current.revision === expected.revision
        : !current.revision && current.queuedAt === expected.queuedAt && current.status === expected.status))) {
        store.delete(key);
      }
    };
    return request;
  });
}

export async function clearPendingVisits(userId: string) {
  if (typeof indexedDB === "undefined") return;
  await run("readwrite", (store) => {
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      if ((cursor.value as PendingVisit).userId === userId) cursor.delete();
      cursor.continue();
    };
    return request;
  });
}
