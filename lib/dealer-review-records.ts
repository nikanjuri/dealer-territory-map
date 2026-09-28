import "server-only";

import { and, count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { dealerImportReviews, salespeople } from "@/db/schema";
import type {
  DealerImportReview,
  DealerReviewUpdate,
} from "@/lib/dealer-review-contract";

function normalizePerson(name: string) {
  return name.trim().replace(/\s+/g, " ").toUpperCase();
}

function toReview(row: {
  review: typeof dealerImportReviews.$inferSelect;
  salesperson: typeof salespeople.$inferSelect;
}): DealerImportReview {
  return {
    id: row.review.id,
    salesperson: row.salesperson.normalizedName,
    dealer: row.review.name,
    pincode: row.review.pincode ?? "",
    area: row.review.area ?? "",
    address: row.review.address ?? "",
    state: row.review.state ?? "",
    reviewCategory: row.review.reviewCategory,
    reviewDetail: row.review.reviewDetail,
    sourceFile: row.review.sourceFile,
    sourceSheet: row.review.sourceSheet,
    sourceRow: row.review.sourceRow,
  };
}

export async function listPendingDealerImportReviews() {
  const rows = await getDb()
    .select({ review: dealerImportReviews, salesperson: salespeople })
    .from(dealerImportReviews)
    .innerJoin(salespeople, eq(dealerImportReviews.salespersonId, salespeople.id))
    .where(eq(dealerImportReviews.status, "pending"))
    .orderBy(dealerImportReviews.id);
  return rows.map(toReview);
}

export async function countPendingDealerImportReviews() {
  const [row] = await getDb()
    .select({ count: count() })
    .from(dealerImportReviews)
    .where(eq(dealerImportReviews.status, "pending"));
  return row?.count ?? 0;
}

export async function updateDealerImportReview(
  id: number,
  input: DealerReviewUpdate,
) {
  const [person] = await getDb()
    .select()
    .from(salespeople)
    .where(eq(salespeople.normalizedName, normalizePerson(input.salesperson)))
    .limit(1);
  if (!person?.active) {
    throw new Error("Create or reactivate the salesperson before assigning this dealer.");
  }

  const [updated] = await getDb()
    .update(dealerImportReviews)
    .set({
      salespersonId: person.id,
      name: input.dealer.trim(),
      pincode: input.pincode.trim() || null,
      area: input.area.trim() || null,
      address: input.address.trim() || null,
      state: input.state || null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(dealerImportReviews.id, id),
        eq(dealerImportReviews.status, "pending"),
      ),
    )
    .returning();
  return updated ? { ...toReview({ review: updated, salesperson: person }) } : null;
}

export async function markDealerImportReviewResolved(
  id: number,
  dealerId: number,
) {
  const [updated] = await getDb()
    .update(dealerImportReviews)
    .set({
      status: "resolved",
      resolvedDealerId: dealerId,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(dealerImportReviews.id, id),
        eq(dealerImportReviews.status, "pending"),
      ),
    )
    .returning({ id: dealerImportReviews.id });
  return Boolean(updated);
}
