import { z } from "zod";
import { getAppSession, isAdmin } from "@/lib/authorization";
import { dealerReviewUpdateSchema } from "@/lib/dealer-review-contract";
import { updateDealerImportReview } from "@/lib/dealer-review-records";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getAppSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id: rawId } = await context.params;
  const id = z.coerce.number().int().positive().safeParse(rawId);
  if (!id.success) return Response.json({ error: "Invalid review id." }, { status: 400 });
  const parsed = dealerReviewUpdateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid review record.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    const review = await updateDealerImportReview(id.data, parsed.data);
    return review
      ? Response.json({ review })
      : Response.json({ error: "Pending review record not found." }, { status: 404 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Review could not be saved." },
      { status: 400 },
    );
  }
}
