import { z } from "zod";
import { getAppSession, isAdmin } from "@/lib/authorization";
import {
  deleteDealerRecord,
  findDealerDuplicate,
  isUniqueViolation,
  updateDealerRecord,
} from "@/lib/dealer-records";
import { dealerUpdateSchema } from "@/lib/dealer-contract";

export const dynamic = "force-dynamic";

async function parseId(context: RouteContext<"/api/dealers/[id]">) {
  const { id } = await context.params;
  return z.coerce.number().int().positive().safeParse(id);
}

export async function PUT(
  request: Request,
  context: RouteContext<"/api/dealers/[id]">,
) {
  const session = await getAppSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session)) {
    return Response.json({ error: "Only an administrator can manage dealers." }, { status: 403 });
  }
  const id = await parseId(context);
  if (!id.success) return Response.json({ error: "Invalid dealer id." }, { status: 400 });

  const body: unknown = await request.json();
  const parsed = dealerUpdateSchema.safeParse({
    ...(body && typeof body === "object" ? body : {}),
    id: id.data,
  });
  if (!parsed.success) {
    return Response.json({ error: "Invalid dealer.", issues: parsed.error.flatten() }, { status: 400 });
  }
  const duplicate = await findDealerDuplicate(parsed.data, id.data);
  if (duplicate) {
    return Response.json(
      {
        error: `${parsed.data.dealer} already exists under ${duplicate.salesperson}. Reassign the existing dealer instead.`,
      },
      { status: 409 },
    );
  }
  try {
    const dealer = await updateDealerRecord(parsed.data);
    return dealer
      ? Response.json({ dealer })
      : Response.json({ error: "Dealer not found." }, { status: 404 });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const concurrentDuplicate = await findDealerDuplicate(parsed.data, id.data);
    return Response.json(
      {
        error: `${parsed.data.dealer} already exists${concurrentDuplicate ? ` under ${concurrentDuplicate.salesperson}` : ""}. Reassign the existing dealer instead.`,
      },
      { status: 409 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: RouteContext<"/api/dealers/[id]">,
) {
  const session = await getAppSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session)) {
    return Response.json({ error: "Only an administrator can manage dealers." }, { status: 403 });
  }
  const id = await parseId(context);
  if (!id.success) return Response.json({ error: "Invalid dealer id." }, { status: 400 });
  return (await deleteDealerRecord(id.data))
    ? new Response(null, { status: 204 })
    : Response.json({ error: "Dealer not found." }, { status: 404 });
}
