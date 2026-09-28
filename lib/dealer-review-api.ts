import type { Dealer } from "@/app/dealers";
import type {
  DealerImportReview,
  DealerReviewUpdate,
} from "@/lib/dealer-review-contract";

type ApiError = { error?: string };

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & ApiError;
  if (!response.ok) throw new Error(body.error ?? "The review queue is unavailable.");
  return body;
}

export async function fetchDealerImportReviews() {
  const response = await fetch("/api/dealer-reviews", { cache: "no-store" });
  return (await readJson<{ reviews: DealerImportReview[] }>(response)).reviews;
}

export async function saveDealerImportReview(
  id: number,
  input: DealerReviewUpdate,
) {
  const response = await fetch(`/api/dealer-reviews/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return (await readJson<{ review: DealerImportReview }>(response)).review;
}

export async function resolveDealerImportReview(
  id: number,
  dealer: Omit<Dealer, "id">,
) {
  const response = await fetch(`/api/dealer-reviews/${id}/resolve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(dealer),
  });
  return (await readJson<{ dealer: Dealer }>(response)).dealer;
}
