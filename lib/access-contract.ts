import { z } from "zod";

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must have at least 3 characters.")
  .max(40, "Username must have at most 40 characters.")
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/,
    "Use letters, numbers, dots, underscores, or hyphens.",
  );

export const createSalespersonSchema = z.object({
  username: usernameSchema,
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(2).max(120),
});

export const salespersonCredentialsSchema = z.object({
  username: usernameSchema.optional(),
  password: z.string().min(8).max(128),
});

export const assignDealersSchema = z.object({
  dealerIds: z.array(z.number().int().positive()).min(1).max(500),
});

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export function normalizeSalespersonName(name: string) {
  return name.trim().replace(/\s+/g, " ").toUpperCase();
}

export function authEmailForUsername(username: string) {
  return `${normalizeUsername(username)}@dealer-territory.invalid`;
}

export const appRoles = [
  "admin",
  "salesperson",
  "operations_staff",
  "retailer",
] as const;

export type AppRole = (typeof appRoles)[number];

export type AppSession = {
  userId: string;
  username: string;
  displayName: string;
  role: AppRole;
  roles: AppRole[];
  salespersonId: number | null;
  salesperson: string | null;
  dealerId: number | null;
  dealer: string | null;
};

export function hasRole(session: AppSession, role: AppRole) {
  return session.roles.includes(role);
}

export function canAccessFieldWorkspace(session: AppSession) {
  return hasRole(session, "admin") || hasRole(session, "salesperson");
}

export function canManageCommerce(session: AppSession) {
  return hasRole(session, "admin") || hasRole(session, "operations_staff");
}

export function canUseRetailShop(session: AppSession) {
  return hasRole(session, "retailer") && session.dealerId !== null;
}

export function canDeleteTeamLogin({
  actingUserId,
  targetUserId,
  targetRoles,
}: {
  actingUserId: string;
  targetUserId: string;
  targetRoles: AppRole[];
}) {
  return actingUserId !== targetUserId && !targetRoles.includes("admin");
}

export function landingPathForSession(session: AppSession) {
  if (canAccessFieldWorkspace(session)) return "/";
  if (canManageCommerce(session)) return "/?workspace=commerce";
  if (canUseRetailShop(session)) return "/?workspace=shop";
  return "/auth/sign-in";
}

export function canOperateOwnRoutes(
  session: AppSession,
): session is AppSession & {
  role: "salesperson";
  salespersonId: number;
  salesperson: string;
} {
  return (
    hasRole(session, "salesperson") &&
    session.salespersonId !== null &&
    session.salesperson !== null
  );
}

export type SalespersonAccount = {
  id: number;
  displayName: string;
  normalizedName: string;
  color: string;
  active: boolean;
  username: string | null;
  accountActive: boolean | null;
};
