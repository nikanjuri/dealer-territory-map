import type { RouteStopStatus } from "./route-contract";

export type PendingVisit = {
  key: string;
  userId: string;
  planId: number;
  stopId: number;
  status: RouteStopStatus;
  queuedAt: string;
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
  } satisfies PendingVisit));
}

export async function pendingVisits(userId: string): Promise<PendingVisit[]> {
  const all = await run("readonly", (store) => store.getAll()) as PendingVisit[];
  return all.filter((visit) => visit.userId === userId).sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

export async function removePendingVisit(key: string) {
  await run("readwrite", (store) => store.delete(key));
}

export async function clearPendingVisits() {
  if (!("indexedDB" in window)) return;
  await run("readwrite", (store) => store.clear());
}
