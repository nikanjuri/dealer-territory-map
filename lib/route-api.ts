import type {
  RoutePlanRequest,
  RoutePreview,
  RouteStopStatus,
  RouteWorkspaceData,
} from "@/lib/route-contract";

export class RouteApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
  } & T;
  if (!response.ok) throw new RouteApiError(body.error ?? "The route request failed.", response.status);
  return body;
}

export async function fetchRouteWorkspace() {
  return readResponse<RouteWorkspaceData>(
    await fetch("/api/routes", { cache: "no-store" }),
  );
}

export async function optimizeRoutePlan(input: RoutePlanRequest) {
  const response = await fetch("/api/routes/optimize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return readResponse<{ preview: RoutePreview }>(response);
}

export async function saveRoutePreview(token: string) {
  const response = await fetch("/api/routes/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  return readResponse<{ plan: import("@/lib/route-contract").SavedRoutePlan }>(
    response,
  );
}

export async function updateRouteStop(
  planId: number,
  stopId: number,
  status: RouteStopStatus,
) {
  return readResponse<RouteWorkspaceData>(
    await fetch(`/api/routes/${planId}/stops/${stopId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }),
  );
}
