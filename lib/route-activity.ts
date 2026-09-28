import type { Dealer } from "@/app/dealers";
import type {
  DealerSchedule,
  SavedRoutePlan,
} from "@/lib/route-contract";

export type ActivityPerson = {
  displayName: string;
  normalizedName: string;
  color: string;
  active?: boolean;
};

export type ActivityState =
  | "attention"
  | "active"
  | "scheduled"
  | "completed"
  | "no-route";

export type TeamRouteActivity = {
  salesperson: string;
  displayName: string;
  color: string;
  plans: SavedRoutePlan[];
  dealerCount: number;
  dueDealerCount: number;
  completedStops: number;
  totalStops: number;
  skippedStops: number;
  delayedStops: number;
  state: ActivityState;
  updatedAt: string | null;
};

function normalized(value: string) {
  return value.trim().toLocaleUpperCase("en-IN");
}

function isPending(status: string) {
  return status === "planned" || status === "arrived";
}

function delayedStopCount(
  plans: SavedRoutePlan[],
  routeDate: string,
  today: string,
  now: Date,
) {
  if (routeDate > today) return 0;
  return plans.flatMap((plan) => plan.stops).filter((stop) => {
    if (!isPending(stop.status)) return false;
    if (routeDate < today) return true;
    return Boolean(
      stop.plannedArrivalAt && new Date(stop.plannedArrivalAt).getTime() < now.getTime(),
    );
  }).length;
}

function activityState(
  plans: SavedRoutePlan[],
  routeDate: string,
  today: string,
  skippedStops: number,
  delayedStops: number,
): ActivityState {
  if (!plans.length) return "no-route";
  if (
    skippedStops > 0 ||
    delayedStops > 0 ||
    plans.some((plan) => plan.status === "cancelled")
  ) {
    return "attention";
  }
  if (plans.every((plan) => plan.status === "completed")) return "completed";
  if (plans.some((plan) => plan.status === "in_progress")) return "active";
  if (routeDate < today) return "attention";
  return "scheduled";
}

const stateRank: Record<ActivityState, number> = {
  attention: 0,
  "no-route": 1,
  active: 2,
  scheduled: 3,
  completed: 4,
};

export function buildTeamRouteActivity({
  people,
  dealers,
  schedules,
  plans,
  routeDate,
  today,
  now = new Date(),
}: {
  people: ActivityPerson[];
  dealers: Dealer[];
  schedules: DealerSchedule[];
  plans: SavedRoutePlan[];
  routeDate: string;
  today: string;
  now?: Date;
}) {
  const peopleByName = new Map(
    people
      .filter((person) => person.active !== false)
      .map((person) => [normalized(person.normalizedName), person]),
  );

  dealers.forEach((dealer) => {
    const key = normalized(dealer.salesperson);
    if (!peopleByName.has(key)) {
      peopleByName.set(key, {
        displayName: dealer.salesperson,
        normalizedName: dealer.salesperson,
        color: "#60706a",
      });
    }
  });

  const schedulesByDealer = new Map(
    schedules.map((schedule) => [schedule.dealerId, schedule]),
  );

  const rows: TeamRouteActivity[] = [...peopleByName.values()].map((person) => {
    const salesperson = normalized(person.normalizedName);
    const personDealers = dealers.filter(
      (dealer) => normalized(dealer.salesperson) === salesperson,
    );
    const personPlans = plans
      .filter(
        (plan) =>
          normalized(plan.salesperson) === salesperson &&
          plan.routeDate === routeDate,
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const stops = personPlans.flatMap((plan) => plan.stops);
    const completedStops = stops.filter(
      (stop) => stop.status === "completed",
    ).length;
    const skippedStops = stops.filter(
      (stop) => stop.status === "skipped",
    ).length;
    const delayedStops = delayedStopCount(
      personPlans,
      routeDate,
      today,
      now,
    );
    const dueDealerCount = personDealers.filter((dealer) => {
      const schedule = schedulesByDealer.get(dealer.id);
      return (
        !schedule?.lastCompletedAt ||
        Boolean(schedule.nextDueAt && schedule.nextDueAt <= routeDate)
      );
    }).length;

    return {
      salesperson,
      displayName: person.displayName,
      color: person.color,
      plans: personPlans,
      dealerCount: personDealers.length,
      dueDealerCount,
      completedStops,
      totalStops: stops.length,
      skippedStops,
      delayedStops,
      state: activityState(
        personPlans,
        routeDate,
        today,
        skippedStops,
        delayedStops,
      ),
      updatedAt: personPlans[0]?.updatedAt ?? null,
    };
  });

  return rows.sort(
    (a, b) =>
      stateRank[a.state] - stateRank[b.state] ||
      b.dueDealerCount - a.dueDealerCount ||
      a.displayName.localeCompare(b.displayName),
  );
}
