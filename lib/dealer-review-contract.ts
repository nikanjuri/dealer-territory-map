import { z } from "zod";
import { INDIAN_STATES } from "./indian-states.ts";

export type DealerImportReview = {
  id: number;
  salesperson: string;
  dealer: string;
  pincode: string;
  area: string;
  address: string;
  state: string;
  reviewCategory: string;
  reviewDetail: string;
  sourceFile: string;
  sourceSheet: string;
  sourceRow: number;
};

export const dealerReviewUpdateSchema = z.object({
  salesperson: z.string().trim().min(1).max(120),
  dealer: z.string().trim().min(1).max(240),
  pincode: z.string().trim().max(20),
  area: z.string().trim().max(180),
  address: z.string().trim().max(500),
  state: z.union([z.enum(INDIAN_STATES), z.literal("")]),
});

export type DealerReviewUpdate = z.infer<typeof dealerReviewUpdateSchema>;
