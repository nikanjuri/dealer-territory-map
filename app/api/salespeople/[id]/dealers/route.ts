import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { dealers, salespeople } from "@/db/schema";
import { assignDealersSchema } from "@/lib/access-contract";
import { getAppSession, isAdmin } from "@/lib/authorization";
import { listDealerRecords } from "@/lib/dealer-records";

export const dynamic = "force-dynamic";

type SalespersonDealersRouteContext = {
  params: Promise<{ id: string }>;
};

async function parseId(
  context: SalespersonDealersRouteContext,
) {
  const { id } = await context.params;
  return z.coerce.number().int().positive().safeParse(id);
}

export async function PATCH(
  request: Request,
  context: SalespersonDealersRouteContext,
) {
  const session = await getAppSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session)) {
    return Response.json(
      { error: "Only an administrator can assign dealers." },
      { status: 403 },
    );
  }

  const id = await parseId(context);
  if (!id.success) {
    return Response.json({ error: "Invalid salesperson id." }, { status: 400 });
  }

  const parsed = assignDealersSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: "Select at least one valid dealer." },
      { status: 400 },
    );
  }

  const database = getDb();
  const [person] = await database
    .select({ id: salespeople.id, active: salespeople.active })
    .from(salespeople)
    .where(eq(salespeople.id, id.data))
    .limit(1);
  if (!person?.active) {
    return Response.json({ error: "Salesperson not found." }, { status: 404 });
  }

  try {
    const updated = await database
      .update(dealers)
      .set({ salespersonId: person.id, updatedAt: new Date() })
      .where(inArray(dealers.id, [...new Set(parsed.data.dealerIds)]))
      .returning({ id: dealers.id });

    return Response.json({
      dealers: await listDealerRecords(),
      assigned: updated.length,
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    ) {
      return Response.json(
        {
          error:
            "A matching dealer is already assigned to this salesperson.",
        },
        { status: 409 },
      );
    }
    throw error;
  }
}
