import { z } from "zod";
import { getAppSession, isAdmin } from "@/lib/authorization";
import { dealerInputSchema } from "@/lib/dealer-contract";
import {
  createDealerRecord,
  findDealerDuplicate,
  isUniqueViolation,
} from "@/lib/dealer-records";
import { markDealerImportReviewResolved } from "@/lib/dealer-review-records";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getAppSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id: rawId } = await context.params;
  const id = z.coerce.number().int().positive().safeParse(rawId);
  if (!id.success) return Response.json({ error: "Invalid review id." }, { status: 400 });
  const parsed = dealerInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: "Complete the dealer name, PIN, area, state and location first.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const duplicate = await findDealerDuplicate(parsed.data);
  if (duplicate) {
    return Response.json(
      { error: `${parsed.data.dealer} already exists under ${duplicate.salesperson}.` },
      { status: 409 },
    );
  }
  try {
    const dealer = await createDealerRecord(parsed.data);
    if (!(await markDealerImportReviewResolved(id.data, dealer.id))) {
      return Response.json(
        { error: "The review row was already resolved. Refresh the queue." },
        { status: 409 },
      );
    }
    return Response.json({ dealer }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return Response.json({ error: "This dealer already exists." }, { status: 409 });
    }
    throw error;
  }
}
