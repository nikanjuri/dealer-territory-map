import type { Dealer } from "@/app/dealers";

type ApiError = { error?: string };

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & ApiError;
  if (!response.ok) throw new Error(body.error ?? "The shared dealer store is unavailable.");
  return body;
}

export async function fetchDealers() {
  const response = await fetch("/api/dealers", { cache: "no-store" });
  const body = await readJson<{ dealers: Dealer[] }>(response);
  return body.dealers;
}

export async function createDealer(dealer: Omit<Dealer, "id">) {
  const response = await fetch("/api/dealers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(dealer),
  });
  const body = await readJson<{ dealer: Dealer }>(response);
  return body.dealer;
}

export async function createDealers(dealers: Array<Omit<Dealer, "id">>) {
  const response = await fetch("/api/dealers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dealers }),
  });
  return readJson<{
    created: Dealer[];
    skipped: number;
    conflicts: Array<{
      dealer: string;
      pincode: string;
      salesperson?: string;
    }>;
  }>(response);
}

export async function saveDealer(dealer: Dealer) {
  const response = await fetch(`/api/dealers/${dealer.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(dealer),
  });
  const body = await readJson<{ dealer: Dealer }>(response);
  return body.dealer;
}

export async function removeDealer(id: number) {
  const response = await fetch(`/api/dealers/${id}`, { method: "DELETE" });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiError;
    throw new Error(body.error ?? "The dealer could not be deleted.");
  }
}

export async function assignDealersToSalesperson(
  salespersonId: number,
  dealerIds: number[],
) {
  const response = await fetch(`/api/salespeople/${salespersonId}/dealers`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dealerIds }),
  });
  return readJson<{ dealers: Dealer[]; assigned: number }>(response);
}
