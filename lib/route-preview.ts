import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  routePlanRequestSchema,
  type RoutePlanRequest,
} from "./route-contract.ts";
import type { OptimizedRoute } from "./route-optimizer.ts";

const TOKEN_LIFETIME_MS = 2 * 60 * 60 * 1_000;

const optimizedRouteSchema = z.object({
  dealerIds: z.array(z.number().int().positive()).min(1).max(25),
  legMeters: z.array(z.number().nonnegative()),
  legSeconds: z.array(z.number().nonnegative()),
  totalDistanceMeters: z.number().nonnegative(),
  totalDurationSeconds: z.number().nonnegative(),
});

const routePreviewPayloadSchema = z.object({
  version: z.literal(1),
  expiresAt: z.number().int().positive(),
  request: routePlanRequestSchema,
  optimized: optimizedRouteSchema,
  provider: z.enum(["google-routes", "geometry-preview"]),
  warning: z.string().nullable(),
  encodedPolyline: z.string().optional(),
  dealerFingerprint: z.string().optional(),
});

export type RoutePreviewPayload = {
  version: 1;
  expiresAt: number;
  request: RoutePlanRequest;
  optimized: OptimizedRoute;
  provider: "google-routes" | "geometry-preview";
  warning: string | null;
  encodedPolyline?: string;
  dealerFingerprint?: string;
};

// A signed preview must not survive a changed dealer pin or service duration.
export function routeDealerFingerprint(dealers: Array<{
  id: number; latitude: number; longitude: number;
  locationPrecision?: string; address?: string; googlePlaceId?: string;
  serviceMinutes: number;
}>) {
  const snapshot = dealers.map((dealer) => ({
    id: dealer.id, latitude: dealer.latitude, longitude: dealer.longitude,
    precision: dealer.locationPrecision ?? "pincode",
    address: dealer.address ?? "", placeId: dealer.googlePlaceId ?? "",
    serviceMinutes: dealer.serviceMinutes,
  })).sort((a, b) => a.id - b.id);
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

function signatureFor(value: string, secret: string) {
  return createHmac("sha256", `dealer-route-preview-v1\0${secret}`)
    .update(value)
    .digest("base64url");
}

export function routePreviewSecret() {
  const secret =
    process.env.ROUTE_PREVIEW_SECRET ??
    process.env.GOOGLE_ROUTES_API_KEY ??
    process.env.DATABASE_URL;
  if (!secret) {
    throw new Error("Route previews are not configured.");
  }
  return secret;
}

export function createRoutePreviewToken(
  payload: Omit<RoutePreviewPayload, "version" | "expiresAt">,
  secret: string,
  now = new Date(),
) {
  const value = Buffer.from(
    JSON.stringify({
      ...payload,
      version: 1,
      expiresAt: now.getTime() + TOKEN_LIFETIME_MS,
    } satisfies RoutePreviewPayload),
  ).toString("base64url");
  return `${value}.${signatureFor(value, secret)}`;
}

export function readRoutePreviewToken(
  token: string,
  secret: string,
  now = new Date(),
): RoutePreviewPayload {
  const [value, suppliedSignature, extra] = token.split(".");
  if (!value || !suppliedSignature || extra) {
    throw new Error("This route preview is invalid. Optimize it again.");
  }
  const expectedSignature = signatureFor(value, secret);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new Error("This route preview is invalid. Optimize it again.");
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new Error("This route preview is invalid. Optimize it again.");
  }
  const parsed = routePreviewPayloadSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new Error("This route preview is invalid. Optimize it again.");
  }
  if (parsed.data.expiresAt <= now.getTime()) {
    throw new Error("This route preview expired. Optimize it again before saving.");
  }
  return parsed.data;
}
