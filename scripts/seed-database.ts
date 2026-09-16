import nextEnv from "@next/env";
import { count, eq } from "drizzle-orm";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const [{ getDb }, schema, dealerModule] = await Promise.all([
  import("../db/index"),
  import("../db/schema"),
  import("../app/dealers"),
]);

const database = getDb();
const people = new Map<string, number>();

for (const dealer of dealerModule.INITIAL_DEALERS) {
  let salespersonId = people.get(dealer.salesperson);
  if (!salespersonId) {
    const [person] = await database
      .insert(schema.salespeople)
      .values({
        normalizedName: dealer.salesperson,
        displayName: dealer.salesperson,
        color: dealerModule.getSalespersonColor(dealer.salesperson),
      })
      .onConflictDoUpdate({
        target: schema.salespeople.normalizedName,
        set: { updatedAt: new Date() },
      })
      .returning({ id: schema.salespeople.id });
    salespersonId = person.id;
    people.set(dealer.salesperson, salespersonId);
  }

  const [created] = await database
    .insert(schema.dealers)
    .values({
      salespersonId,
      name: dealer.dealer,
      pincode: dealer.pincode,
      area: dealer.area,
      address: dealer.address,
      state: dealer.state,
      latitude: dealer.latitude,
      longitude: dealer.longitude,
      locationPrecision: dealer.locationPrecision ?? "pincode",
      geocodedAddress: dealer.geocodedAddress,
      reviewNote: dealer.reviewNote,
      postalSuggestions: dealer.postalSuggestions,
      validationStatus: dealer.reviewNote ? "review" : "verified",
      validationSource: "postal-directory",
      validationCheckedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: schema.dealers.id });

  const dealerId = created?.id ?? (
    await database
      .select({ id: schema.dealers.id })
      .from(schema.dealers)
      .where(eq(schema.dealers.name, dealer.dealer))
      .limit(1)
  )[0]?.id;

  if (dealerId) {
    await database
      .insert(schema.visitRules)
      .values({ dealerId, frequencyDays: 30, serviceMinutes: 30, priority: 3 })
      .onConflictDoNothing();
  }
}

const [{ total }] = await database
  .select({ total: count() })
  .from(schema.dealers)
  .limit(1);

console.log(`Dealer database seed complete. Dealer rows: ${total}.`);
