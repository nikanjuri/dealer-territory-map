import { z } from "zod";

export const routePlanRequestSchema = z
  .object({
    salesperson: z.string().trim().min(1).max(120),
    routeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startAddress: z.string().trim().min(3).max(500),
    endAddress: z.string().trim().max(500).optional(),
    returnToStart: z.boolean().default(true),
    workdayStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    workdayEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    dealerIds: z.array(z.number().int().positive()).min(1).max(25),
    includeApproximate: z.boolean().default(false),
  })
  .superRefine((value, context) => {
    if (!value.returnToStart && !value.endAddress?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endAddress"],
        message: "Enter an end location or return to the start.",
      });
    }
    if (value.workdayEnd <= value.workdayStart) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["workdayEnd"],
        message: "The workday must end after it starts.",
      });
    }
  });

export const routeStopStatusSchema = z.object({
  status: z.enum(["arrived", "completed", "skipped"]),
  notes: z.string().trim().max(2000).optional(),
});

export const routePreviewSaveSchema = z.object({
  token: z.string().min(1).max(50_000),
});

export type RoutePlanRequest = z.infer<typeof routePlanRequestSchema>;
export type RouteStopStatus = z.infer<typeof routeStopStatusSchema>["status"];

export type DealerSchedule = {
  dealerId: number;
  frequencyDays: number;
  nextDueAt: string | null;
  lastCompletedAt: string | null;
};

export type SavedRouteStop = {
  id: number;
  dealerId: number;
  sequence: number;
  plannedArrivalAt: string | null;
  plannedDepartureAt: string | null;
  travelSeconds: number | null;
  travelMeters: number | null;
  status: "planned" | "arrived" | "completed" | "skipped";
};

export type RoutePreviewStop = {
  dealerId: number;
  sequence: number;
  plannedArrivalAt: string;
  plannedDepartureAt: string;
  travelSeconds: number;
  travelMeters: number | null;
};

export type RoutePreview = {
  token: string;
  salesperson: string;
  routeDate: string;
  startAddress: string;
  endAddress: string;
  optimizationProvider: "google-routes" | "geometry-preview";
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  totalServiceSeconds: number;
  totalPlannedSeconds: number;
  estimatedEndAt: string;
  warning: string | null;
  encodedPolyline?: string;
  stops: RoutePreviewStop[];
};

export type SavedRoutePlan = {
  id: number;
  salesperson: string;
  routeDate: string;
  status: "draft" | "optimized" | "in_progress" | "completed" | "cancelled";
  startAddress: string;
  endAddress: string;
  optimizationProvider: string | null;
  totalDistanceMeters: number | null;
  totalDurationSeconds: number | null;
  totalServiceSeconds: number | null;
  totalPlannedSeconds: number | null;
  estimatedEndAt: string | null;
  warning: string | null;
  stops: SavedRouteStop[];
  createdAt: string;
};

export type RouteWorkspaceData = {
  schedules: DealerSchedule[];
  plans: SavedRoutePlan[];
  googleOptimizationConfigured: boolean;
};
