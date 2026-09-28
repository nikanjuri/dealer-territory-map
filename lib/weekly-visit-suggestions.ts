import type { DealerSummary } from "./dealer-summary";
import type { DealerSchedule, SavedRoutePlan } from "./route-contract";

export type SuggestedDay = { date: string; dealerIds: number[] };

function addDays(day: string, offset: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function suggestVisitWeek({
  startDate,
  dealers,
  schedules,
  plans,
  dailyTarget,
}: {
  startDate: string;
  dealers: DealerSummary[];
  schedules: DealerSchedule[];
  plans: SavedRoutePlan[];
  dailyTarget: number;
}) {
  const dates = Array.from({ length: 7 }, (_, index) => addDays(startDate, index));
  const days: SuggestedDay[] = dates.map((date) => ({ date, dealerIds: [] }));
  const capacity = Math.min(25, Math.max(1, Math.floor(dailyTarget)));
  const lastDate = dates[6];
  const scheduleById = new Map(schedules.map((item) => [item.dealerId, item]));
  const pinByDealerId = new Map(dealers.map((dealer) => [dealer.id, dealer.pincode]));
  const alreadyPlanned = new Set(
    plans
      .filter((plan) => plan.status !== "cancelled" && plan.routeDate >= startDate && plan.routeDate <= lastDate)
      .flatMap((plan) => plan.stops.map((stop) => stop.dealerId)),
  );
  const due = dealers
    .filter((dealer) => {
      if (alreadyPlanned.has(dealer.id)) return false;
      const schedule = scheduleById.get(dealer.id);
      return !schedule?.lastCompletedAt || Boolean(schedule.nextDueAt && schedule.nextDueAt <= lastDate);
    })
    .sort((left, right) => {
      const a = scheduleById.get(left.id)?.nextDueAt ?? "0000-00-00";
      const b = scheduleById.get(right.id)?.nextDueAt ?? "0000-00-00";
      return a.localeCompare(b) || left.pincode.localeCompare(right.pincode) || left.dealer.localeCompare(right.dealer);
    });
  let unplaced = 0;
  for (const dealer of due) {
    const dueAt = scheduleById.get(dealer.id)?.nextDueAt;
    const eligible = days.filter((day) => day.dealerIds.length < capacity && (!dueAt || day.date >= dueAt));
    if (!eligible.length) {
      unplaced += 1;
      continue;
    }
    // Keep nearby PINs together when capacity allows. Google Routes still
    // chooses the road-aware stop order after the salesperson reviews a day.
    eligible.sort((a, b) => {
      const matches = (day: SuggestedDay) => day.dealerIds.filter((id) =>
        pinByDealerId.get(id) === dealer.pincode,
      ).length;
      return matches(b) - matches(a) || a.date.localeCompare(b.date);
    });
    eligible[0].dealerIds.push(dealer.id);
  }
  return { days, unplaced, dueCount: due.length };
}
