import { z } from "zod";
import { usernameSchema } from "./access-contract.ts";

export const commerceStockStatuses = [
  "in_stock",
  "low_stock",
  "out_of_stock",
] as const;

export const commerceOrderStatuses = [
  "pending",
  "confirmed",
  "dispatched",
  "delivered",
  "cancelled",
] as const;

export const commerceCategoryTypes = ["fabric_type", "design"] as const;

export const commerceCategoryInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(commerceCategoryTypes),
  active: z.boolean().default(true),
});

export const commerceVariantInputSchema = z.object({
  color: z.string().trim().min(1).max(80),
  sku: z.string().trim().min(1).max(80),
  pricePaise: z.number().int().positive().max(100_000_000),
  minimumOrderQuantity: z.number().int().positive().max(100_000),
  stockStatus: z.enum(commerceStockStatuses),
});

export const commerceProductInputSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    description: z.string().trim().max(2_000).optional(),
    fabricType: z.string().trim().max(100).optional(),
    design: z.string().trim().max(100).optional(),
    imageUrl: z.string().trim().url().max(2_000).optional().or(z.literal("")),
    fabricTypeId: z.number().int().positive().nullable().optional(),
    designId: z.number().int().positive().nullable().optional(),
    imageUrls: z
      .array(z.string().trim().url().max(2_000))
      .max(12)
      .default([]),
    active: z.boolean().default(true),
    variants: z.array(commerceVariantInputSchema).min(1).max(50),
  })
  .superRefine((value, context) => {
    const seen = new Set<string>();
    value.variants.forEach((variant, index) => {
      const sku = variant.sku.toUpperCase();
      if (seen.has(sku)) {
        context.addIssue({
          code: "custom",
          path: ["variants", index, "sku"],
          message: "Each variant SKU must be unique.",
        });
      }
      seen.add(sku);
    });
  });

export const placeCommerceOrderSchema = z.object({
  requestKey: z.string().uuid(),
  notes: z.string().trim().max(1_000).optional(),
  items: z
    .array(
      z.object({
        variantId: z.number().int().positive(),
        quantity: z.number().int().positive().max(100_000),
      }),
    )
    .min(1)
    .max(100),
});

export const updateCommerceOrderSchema = z.object({
  status: z.enum(commerceOrderStatuses),
});

export const createCommerceAccountSchema = z
  .object({
    username: usernameSchema,
    password: z.string().min(8).max(128),
    displayName: z.string().trim().min(2).max(120),
    role: z.enum(["retailer", "operations_staff"]),
    dealerId: z.number().int().positive().optional(),
    phone: z.string().trim().max(20).optional(),
    shopName: z.string().trim().max(160).optional(),
  })
  .superRefine((value, context) => {
    if (value.role === "retailer" && !value.dealerId) {
      context.addIssue({
        code: "custom",
        path: ["dealerId"],
        message: "Choose the dealer this retailer account belongs to.",
      });
    }
    if (value.role === "operations_staff" && value.dealerId) {
      context.addIssue({
        code: "custom",
        path: ["dealerId"],
        message: "Operations staff accounts cannot be linked to a dealer.",
      });
    }
  });

export const updateOperationsAccessSchema = z.object({
  authUserId: z.string().min(1),
  enabled: z.boolean(),
});

export const resetCommercePasswordSchema = z.object({
  authUserId: z.string().min(1),
  password: z.string().min(8).max(128),
});

export const setCommerceAccountActiveSchema = z.object({
  authUserId: z.string().min(1),
  active: z.boolean(),
});

export const deleteCommerceAccountSchema = z.object({
  authUserId: z.string().min(1),
});

export function canDeleteCommerceAccount({
  roles,
  salespersonId,
}: {
  roles: string[];
  salespersonId: number | null;
}) {
  return (
    salespersonId === null &&
    roles.length > 0 &&
    roles.every((role) => role === "retailer" || role === "operations_staff")
  );
}

export type CommerceProductInput = z.infer<typeof commerceProductInputSchema>;
export type CommerceOrderStatus = (typeof commerceOrderStatuses)[number];

export type CommerceCategory = {
  id: number;
  name: string;
  type: (typeof commerceCategoryTypes)[number];
  active: boolean;
};

export type CommerceVariant = {
  id: number;
  color: string;
  sku: string;
  pricePaise: number;
  minimumOrderQuantity: number;
  stockStatus: (typeof commerceStockStatuses)[number];
  active: boolean;
};

export type CommerceProduct = {
  id: number;
  name: string;
  description: string | null;
  fabricType: string | null;
  design: string | null;
  imageUrl: string | null;
  fabricTypeId: number | null;
  designId: number | null;
  imageUrls: string[];
  active: boolean;
  variants: CommerceVariant[];
};

export type CommerceOrder = {
  id: number;
  dealerId: number | null;
  dealer: string;
  status: CommerceOrderStatus;
  totalPaise: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  legacySupabaseId: string | null;
  items: Array<{
    id: number;
    variantId: number;
    product: string;
    color: string;
    sku: string;
    quantity: number;
    unitPricePaise: number;
  }>;
};

export type CommerceAccount = {
  authUserId: string;
  username: string;
  displayName: string;
  active: boolean;
  roles: string[];
  salespersonId: number | null;
  salesperson: string | null;
  dealerId: number | null;
  dealer: string | null;
  phone: string | null;
  shopName: string | null;
};

export type CommerceStats = {
  ordersToday: number;
  pendingOrders: number;
  revenueTodayPaise: number;
  revenueAllTimePaise: number;
};
