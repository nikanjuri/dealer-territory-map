import { getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

type AuthRouteContext = { params: Promise<{ path: string[] }> };

export function GET(request: Request, context: AuthRouteContext) {
  return getAuth().handler().GET(request, context);
}

export async function POST(request: Request, context: AuthRouteContext) {
  const { path } = await context.params;
  if (["sign-up/email", "sign-in/email"].includes(path.join("/"))) {
    return Response.json(
      { error: "Use the workspace username sign-in." },
      { status: 403 },
    );
  }
  return getAuth().handler().POST(request, context);
}

export function PUT(request: Request, context: AuthRouteContext) {
  return getAuth().handler().PUT(request, context);
}

export function PATCH(request: Request, context: AuthRouteContext) {
  return getAuth().handler().PATCH(request, context);
}

export function DELETE(request: Request, context: AuthRouteContext) {
  return getAuth().handler().DELETE(request, context);
}
