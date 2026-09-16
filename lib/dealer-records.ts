import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { dealers, salespeople } from "@/db/schema";
import type { Dealer } from "@/app/dealers";
import type { DealerInput } from "@/lib/dealer-contract";
import {
  dealerIdentitiesMatch,
  normalizeDealerIdentityText,
} from "@/lib/dealer-identity";

function normalizePerson(name: string) {
  return name.trim().replace(/\s+/g, " ").toUpperCase();
}

function toDealer(row: {
  dealer: typeof dealers.$inferSelect;
  salesperson: typeof salespeople.$inferSelect;
}): Dealer {
  return {
    id: row.dealer.id,
    salesperson: row.salesperson.normalizedName,
    dealer: row.dealer.name,
    pincode: row.dealer.pincode,
    area: row.dealer.area,
    address: row.dealer.address ?? undefined,
    state: row.dealer.state,
    latitude: row.dealer.latitude,
    longitude: row.dealer.longitude,
    locationPrecision: row.dealer.locationPrecision,
    googlePlaceId: row.dealer.googlePlaceId ?? undefined,
    geocodedAddress: row.dealer.geocodedAddress ?? undefined,
    reviewNote: row.dealer.reviewNote ?? undefined,
    postalSuggestions: row.dealer.postalSuggestions ?? undefined,
    validationStatus: row.dealer.validationStatus,
    validationSource: row.dealer.validationSource ?? undefined,
    validationCheckedAt: row.dealer.validationCheckedAt?.toISOString(),
    validationDataset: row.dealer.validationDataset ?? undefined,
  };
}

function dealerValues(input: DealerInput, salespersonId: number) {
  return {
    salespersonId,
    name: normalizeDealerIdentityText(input.dealer),
    pincode: input.pincode,
    area: input.area.trim().toUpperCase(),
    address: input.address ?? null,
    state: input.state,
    latitude: input.latitude,
    longitude: input.longitude,
    locationPrecision:
      input.locationPrecision ?? (input.address ? "address" : "pincode"),
    googlePlaceId: input.googlePlaceId ?? null,
    geocodedAddress: input.geocodedAddress ?? null,
    reviewNote: input.reviewNote ?? null,
    postalSuggestions: input.postalSuggestions ?? null,
    validationStatus: input.validationStatus ?? "unavailable",
    validationSource: input.validationSource ?? null,
    validationCheckedAt: input.validationCheckedAt
      ? new Date(input.validationCheckedAt)
      : null,
    validationDataset: input.validationDataset ?? null,
    updatedAt: new Date(),
  } as const;
}

export async function listDealerRecords(salespersonId?: number | null) {
  const database = getDb();
  const query = database
    .select({ dealer: dealers, salesperson: salespeople })
    .from(dealers)
    .innerJoin(salespeople, eq(dealers.salespersonId, salespeople.id))
    .orderBy(dealers.id);
  const rows = salespersonId
    ? await query.where(eq(dealers.salespersonId, salespersonId))
    : await query;
  return rows.map(toDealer);
}

export async function createDealerRecord(input: DealerInput) {
  const database = getDb();
  const person = await getSalesperson(input.salesperson);
  const [created] = await database
    .insert(dealers)
    .values(dealerValues(input, person.id))
    .returning();
  return toDealer({ dealer: created, salesperson: person });
}

export function isUniqueViolation(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505",
  );
}

export async function createDealerRecords(inputs: DealerInput[]) {
  const created: Dealer[] = [];
  const conflicts: Array<{
    dealer: string;
    pincode: string;
    salesperson?: string;
  }> = [];

  for (const input of inputs) {
    const duplicate = await findDealerDuplicate(input);
    if (duplicate) {
      conflicts.push({
        dealer: input.dealer,
        pincode: input.pincode,
        salesperson: duplicate.salesperson,
      });
      continue;
    }
    try {
      created.push(await createDealerRecord(input));
    } catch (error) {
      if (isUniqueViolation(error)) {
        const concurrentDuplicate = await findDealerDuplicate(input);
        conflicts.push({
          dealer: input.dealer,
          pincode: input.pincode,
          salesperson: concurrentDuplicate?.salesperson,
        });
        continue;
      }
      throw error;
    }
  }

  return { created, skipped: conflicts.length, conflicts };
}

export async function updateDealerRecord(input: DealerInput & { id: number }) {
  const database = getDb();
  const person = await getSalesperson(input.salesperson);
  const [updated] = await database
    .update(dealers)
    .set(dealerValues(input, person.id))
    .where(eq(dealers.id, input.id))
    .returning();
  return updated ? toDealer({ dealer: updated, salesperson: person }) : null;
}

async function getSalesperson(inputName: string) {
  const [person] = await getDb()
    .select()
    .from(salespeople)
    .where(eq(salespeople.normalizedName, normalizePerson(inputName)))
    .limit(1);
  if (!person?.active) {
    throw new Error("Create or reactivate the salesperson before assigning dealers.");
  }
  return person;
}

export async function deleteDealerRecord(id: number) {
  const database = getDb();
  const [deleted] = await database
    .delete(dealers)
    .where(eq(dealers.id, id))
    .returning({ id: dealers.id });
  return Boolean(deleted);
}

export async function findDealerDuplicate(input: DealerInput, excludeId?: number) {
  const database = getDb();
  const rows = await database
    .select({
      id: dealers.id,
      dealer: dealers.name,
      pincode: dealers.pincode,
      address: dealers.address,
      salesperson: salespeople.displayName,
    })
    .from(dealers)
    .innerJoin(salespeople, eq(dealers.salespersonId, salespeople.id))
    .where(eq(dealers.name, normalizeDealerIdentityText(input.dealer)));
  return (
    rows.find(
      (row) =>
        row.id !== excludeId &&
        dealerIdentitiesMatch(input, {
          dealer: row.dealer,
          pincode: row.pincode,
          address: row.address,
        }),
    ) ?? null
  );
}
