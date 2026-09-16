import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((value) => value || undefined);

export const dealerInputSchema = z.object({
  salesperson: z.string().trim().min(1).max(120),
  dealer: z.string().trim().min(1).max(240),
  pincode: z.string().regex(/^\d{6}$/),
  area: z.string().trim().min(1).max(180),
  address: optionalText,
  state: z.enum(["Telangana", "Andhra Pradesh"]),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  locationPrecision: z.enum(["address", "pincode"]).optional(),
  googlePlaceId: optionalText,
  geocodedAddress: optionalText,
  reviewNote: optionalText,
  postalSuggestions: z.array(z.string()).optional().nullable(),
  validationStatus: z
    .enum(["verified", "review", "invalid", "unavailable"])
    .optional(),
  validationSource: z.enum(["postal-directory", "manual"]).optional().nullable(),
  validationCheckedAt: optionalText,
  validationDataset: optionalText,
});

export const dealerUpdateSchema = dealerInputSchema.extend({
  id: z.number().int().positive(),
});

export type DealerInput = z.infer<typeof dealerInputSchema>;
