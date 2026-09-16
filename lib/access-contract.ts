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

export type AppRole = "admin" | "salesperson";

export type AppSession = {
  userId: string;
  username: string;
  displayName: string;
  role: AppRole;
  salespersonId: number | null;
  salesperson: string | null;
};

export function canOperateOwnRoutes(
  session: AppSession,
): session is AppSession & {
  role: "salesperson";
  salespersonId: number;
  salesperson: string;
} {
  return (
    session.role === "salesperson" &&
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
