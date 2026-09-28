import { getAppSession, isAdmin } from "@/lib/authorization";
import { canAccessFieldWorkspace } from "@/lib/access-contract";
import { listDealerDirectoryPage } from "@/lib/dealer-records";
import { INDIAN_STATES } from "@/lib/indian-states";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const startedAt = performance.now();
  const session = await getAppSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessFieldWorkspace(session)) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!isAdmin(session) && session.salespersonId === null) return Response.json({ error: "Forbidden" }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const page = Number(params.get("page") ?? "1");
  const pageSize = Number(params.get("pageSize") ?? "100");
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    return Response.json({ error: "Invalid directory page." }, { status: 400 });
  }
  const state = params.get("state") ?? "all";
  const quality = params.get("quality") ?? "all";
  if (state !== "all" && !INDIAN_STATES.includes(state as typeof INDIAN_STATES[number])) {
    return Response.json({ error: "Invalid state filter." }, { status: 400 });
  }
  if (!["all", "verified", "review", "unchecked"].includes(quality)) {
    return Response.json({ error: "Invalid quality filter." }, { status: 400 });
  }
  const salespeople = params.getAll("salesperson").slice(0, 500);
  const pageResult = await listDealerDirectoryPage({
    page,
    pageSize,
    query: (params.get("query") ?? "").slice(0, 200),
    salespeople,
    state,
    quality: isAdmin(session) ? quality : "all",
    pincode: params.get("pincode") ?? "all",
    area: params.get("area") ?? "all",
  }, isAdmin(session) ? null : session.salespersonId);
  return Response.json(pageResult, {
    headers: {
      "Cache-Control": "private, no-store",
      "Server-Timing": `directory;dur=${(performance.now() - startedAt).toFixed(1)}`,
    },
  });
}
