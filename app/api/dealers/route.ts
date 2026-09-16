import { getAppSession, isAdmin } from "@/lib/authorization";
import {
  createDealerRecord,
  createDealerRecords,
  findDealerDuplicate,
  isUniqueViolation,
  listDealerRecords,
} from "@/lib/dealer-records";
import { dealerInputSchema } from "@/lib/dealer-contract";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAppSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json({
    dealers: await listDealerRecords(
      session.role === "salesperson" ? session.salespersonId : null,
    ),
  });
}

export async function POST(request: Request) {
  const session = await getAppSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session)) {
    return Response.json({ error: "Only an administrator can manage dealers." }, { status: 403 });
  }

  const body: unknown = await request.json();
  const values = Array.isArray(body)
    ? body
    : body && typeof body === "object" && "dealers" in body
      ? (body as { dealers: unknown }).dealers
      : body;

  if (Array.isArray(values)) {
    const parsed = dealerInputSchema.array().max(500).safeParse(values);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid dealer import.", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    return Response.json(await createDealerRecords(parsed.data), { status: 201 });
  }

  const parsed = dealerInputSchema.safeParse(values);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid dealer.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const duplicate = await findDealerDuplicate(parsed.data);
  if (duplicate) {
    return Response.json(
      {
        error: `${parsed.data.dealer} already exists under ${duplicate.salesperson}. Reassign the existing dealer instead.`,
      },
      { status: 409 },
    );
  }
  try {
    return Response.json(
      { dealer: await createDealerRecord(parsed.data) },
      { status: 201 },
    );
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const concurrentDuplicate = await findDealerDuplicate(parsed.data);
    return Response.json(
      {
        error: `${parsed.data.dealer} already exists${concurrentDuplicate ? ` under ${concurrentDuplicate.salesperson}` : ""}. Reassign the existing dealer instead.`,
      },
      { status: 409 },
    );
  }
}
