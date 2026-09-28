"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  ExternalLink,
  Fuel,
  History,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  RefreshCw,
  Route as RouteIcon,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react";
import type { DealerSummary } from "@/lib/dealer-summary";
import { getReadableTextColor, getSalespersonColor } from "@/app/dealers";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { RoutePreviewMap } from "@/components/route-preview-map";
import { GooglePlaceAutocomplete } from "@/components/google-place-autocomplete";
import {
  RouteApiError,
  fetchRouteWorkspace,
  optimizeRoutePlan,
  saveRoutePreview,
  updateRouteStop,
} from "@/lib/route-api";
import { queueVisit, pendingVisits, removePendingVisit } from "@/lib/offline-visits";
import type {
  DealerSchedule,
  RoutePreview,
  RouteWorkspaceData,
  SavedRoutePlan,
  SavedRouteStop,
} from "@/lib/route-contract";
import { buildGoogleMapsRouteSegments } from "@/lib/google-maps-url";
import type { SalespersonAccount } from "@/lib/access-contract";
import {
  buildTeamRouteActivity,
  type ActivityState,
  type TeamRouteActivity,
} from "@/lib/route-activity";
import {
  MAX_ROUTE_STOPS,
  selectRouteDealerIds,
  toggleRouteDealerId,
} from "@/lib/route-selection";
import { routeWarningForDisplay } from "@/lib/route-warning";
import { suggestVisitWeek } from "@/lib/weekly-visit-suggestions";
import { toast } from "sonner";

function localDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function formatDistance(meters: number | null) {
  if (meters == null) return "—";
  return meters < 1_000
    ? `${Math.round(meters)} m`
    : `${(meters / 1_000).toFixed(1)} km`;
}

function formatDuration(seconds: number | null) {
  if (seconds == null) return "—";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function formatTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function dueLabel(schedule: DealerSchedule | undefined, routeDate: string) {
  if (!schedule?.lastCompletedAt) return { text: "Never visited", tone: "amber" };
  if (!schedule.nextDueAt) return { text: "No due date", tone: "slate" };
  if (schedule.nextDueAt <= routeDate) return { text: "Due", tone: "red" };
  return {
    text: `Due ${new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
    }).format(new Date(`${schedule.nextDueAt}T12:00:00+05:30`))}`,
    tone: "green",
  };
}

function StopStatus({ status }: { status: SavedRouteStop["status"] }) {
  const styles = {
    planned: "border-slate-200 bg-slate-50 text-slate-700",
    arrived: "border-blue-200 bg-blue-50 text-blue-700",
    completed: "border-emerald-200 bg-emerald-50 text-emerald-800",
    skipped: "border-amber-200 bg-amber-50 text-amber-800",
  }[status];
  return (
    <span className={`rounded-full border px-2 py-1 text-[11px] font-bold uppercase tracking-[0.06em] ${styles}`}>
      {status.replace("_", " ")}
    </span>
  );
}

const activityStateDetails: Record<
  ActivityState,
  { label: string; className: string; dotClassName: string }
> = {
  attention: {
    label: "Needs attention",
    className: "border-red-200 bg-red-50 text-red-800",
    dotClassName: "bg-red-500",
  },
  active: {
    label: "In progress",
    className: "border-blue-200 bg-blue-50 text-blue-800",
    dotClassName: "bg-blue-500",
  },
  scheduled: {
    label: "Scheduled",
    className: "border-slate-200 bg-slate-50 text-slate-700",
    dotClassName: "bg-slate-500",
  },
  completed: {
    label: "Completed",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    dotClassName: "bg-emerald-500",
  },
  "no-route": {
    label: "No route",
    className: "border-amber-200 bg-amber-50 text-amber-900",
    dotClassName: "bg-amber-500",
  },
};

function formatUpdatedAt(value: string | null) {
  if (!value) return "No activity";
  const date = new Date(value);
  return `Updated ${new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date)}`;
}

function ActivityStatus({ state }: { state: ActivityState }) {
  const details = activityStateDetails[state];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold ${details.className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${details.dotClassName}`} />
      {details.label}
    </span>
  );
}

function AdminRouteActivity({
  active,
  dealers,
  salespeople,
  workspace,
  loading,
  refreshing,
  lastRefreshedAt,
  onRefresh,
}: {
  active: boolean;
  dealers: DealerSummary[];
  salespeople: SalespersonAccount[];
  workspace: RouteWorkspaceData | null;
  loading: boolean;
  refreshing: boolean;
  lastRefreshedAt: Date | null;
  onRefresh: () => void;
}) {
  type ActivityFilter = "all" | "needs-attention" | ActivityState;
  const [activityDate, setActivityDate] = useState(localDate);
  const [salespersonFilter, setSalespersonFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<ActivityFilter>("all");
  const [selectedSalesperson, setSelectedSalesperson] = useState<string | null>(
    null,
  );
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);

  const rows = useMemo(
    () =>
      buildTeamRouteActivity({
        people: salespeople,
        dealers,
        schedules: workspace?.schedules ?? [],
        plans: workspace?.plans ?? [],
        routeDate: activityDate,
        today: localDate(),
      }),
    [activityDate, dealers, salespeople, workspace],
  );
  const filteredRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          (salespersonFilter === "all" ||
            row.salesperson === salespersonFilter) &&
          (statusFilter === "all" ||
            (statusFilter === "needs-attention"
              ? row.state === "attention" || row.state === "no-route"
              : row.state === statusFilter)),
      ),
    [rows, salespersonFilter, statusFilter],
  );
  const selectedRow =
    filteredRows.find((row) => row.salesperson === selectedSalesperson) ??
    filteredRows[0] ??
    null;
  const selectedPlan =
    selectedRow?.plans.find((plan) => plan.id === selectedPlanId) ??
    selectedRow?.plans[0] ??
    null;
  const dealersById = useMemo(
    () => new Map(dealers.map((dealer) => [dealer.id, dealer])),
    [dealers],
  );
  const mapSegments = selectedPlan
    ? buildGoogleMapsRouteSegments(selectedPlan, dealersById)
    : [];
  const completedVisits = rows.reduce(
    (count, row) => count + row.completedStops,
    0,
  );
  const totalVisits = rows.reduce((count, row) => count + row.totalStops, 0);
  const needsAttention = rows.filter(
    (row) => row.state === "attention" || row.state === "no-route",
  ).length;
  const scheduledPeople = rows.filter((row) => row.plans.length > 0).length;
  const activePeople = rows.filter((row) => row.state === "active").length;

  function selectRow(row: TeamRouteActivity) {
    setSelectedSalesperson(row.salesperson);
    setSelectedPlanId(row.plans[0]?.id ?? null);
    if (window.matchMedia("(max-width: 1023px)").matches) {
      requestAnimationFrame(() => {
        document.getElementById("activity-route-detail")?.scrollIntoView({
          block: "start",
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
        });
      });
    }
  }

  const refreshedLabel = lastRefreshedAt
    ? `Updated ${new Intl.DateTimeFormat("en-IN", {
        hour: "numeric",
        minute: "2-digit",
      }).format(lastRefreshedAt)}`
    : "Not refreshed yet";

  return (
    <section
      id="routes-workspace-panel"
      role="tabpanel"
      hidden={!active}
      aria-labelledby="workspace-routes-tab"
      className="h-[calc(100svh-120px)] overflow-y-auto bg-[#f7f3ea]"
    >
      <div className="mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#6f6a65]">
              Operations
            </p>
            <h2
              id="routes-workspace-title"
              className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[#252a30] sm:text-3xl"
            >
              Team activity
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6f6a65]">
              See who is scheduled, who is in the field, and which routes need follow-up. Route planning and visit updates remain with each salesperson.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-xs text-[#6f6a65]">{refreshedLabel}</span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Refresh team activity"
              title="Refresh team activity"
              disabled={refreshing}
              onClick={onRefresh}
              className="h-11 w-11 bg-white"
            >
              <RefreshCw className={refreshing ? "animate-spin" : ""} />
            </Button>
          </div>
        </div>

        <section
          aria-label="Activity filters"
          className="mt-5 grid gap-3 rounded-2xl border border-[#ded7cc] bg-white p-3 shadow-[0_8px_24px_rgba(37,42,68,0.04)] sm:grid-cols-3 sm:p-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="activity-date">Route date</Label>
            <DatePicker
              id="activity-date"
              value={activityDate}
              ariaLabel="Route date"
              onValueChange={(value) => {
                setActivityDate(value);
                setSelectedSalesperson(null);
                setSelectedPlanId(null);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="activity-salesperson">Salesperson</Label>
            <Select
              value={salespersonFilter}
              onValueChange={(value) => {
                setSalespersonFilter(value);
                setSelectedSalesperson(null);
                setSelectedPlanId(null);
              }}
            >
              <SelectTrigger id="activity-salesperson" className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All salespeople</SelectItem>
                {rows.map((row) => (
                  <SelectItem key={row.salesperson} value={row.salesperson}>
                    {row.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="activity-status">Status</Label>
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value as ActivityFilter);
                setSelectedSalesperson(null);
                setSelectedPlanId(null);
              }}
            >
              <SelectTrigger id="activity-status" className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="needs-attention">Needs attention</SelectItem>
                <SelectItem value="attention">Delayed or skipped</SelectItem>
                <SelectItem value="no-route">No route</SelectItem>
                <SelectItem value="active">In progress</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </section>

        <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[
            {
              label: "People scheduled",
              value: String(scheduledPeople),
              detail: `of ${rows.length} active`,
              filter: "all" as const,
            },
            {
              label: "In progress",
              value: String(activePeople),
              detail: "routes now",
              filter: "active" as const,
            },
            {
              label: "Visits completed",
              value: `${completedVisits}/${totalVisits}`,
              detail: "scheduled stops",
              filter: "completed" as const,
            },
            {
              label: "Needs attention",
              value: String(needsAttention),
              detail: "people to review",
              filter: "needs-attention" as const,
            },
          ].map((metric) => (
            <button
              key={metric.label}
              type="button"
              onClick={() => {
                setStatusFilter(metric.filter);
                setSelectedSalesperson(null);
                setSelectedPlanId(null);
              }}
              aria-pressed={statusFilter === metric.filter}
              className={`rounded-2xl border bg-white p-3 text-left shadow-[0_8px_24px_rgba(37,42,68,0.04)] transition-[border-color,background-color,transform] active:scale-[0.99] sm:p-4 ${
                statusFilter === metric.filter
                  ? "border-[#b8745a] bg-[#f8eee9]"
                  : "border-[#ded7cc] hover:border-[#c8beb1]"
              }`}
            >
              <p className="text-xs font-semibold text-[#6f6a65]">{metric.label}</p>
              <div className="mt-1.5 flex items-baseline gap-2">
                <span className="text-xl font-semibold tabular-nums tracking-[-0.03em] text-[#252a30] sm:text-2xl">
                  {metric.value}
                </span>
                <span className="text-xs text-[#6f6a65]">{metric.detail}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(320px,0.78fr)_minmax(520px,1.22fr)]">
          <section className="overflow-hidden rounded-2xl border border-[#ded7cc] bg-white shadow-[0_8px_24px_rgba(37,42,68,0.05)]">
            <div className="flex items-center justify-between border-b border-[#e9e2d8] px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-[#252a30]">Salespeople</h3>
                <p className="mt-0.5 text-xs text-[#6f6a65]">
                  Attention items appear first
                </p>
              </div>
              <span className="rounded-full bg-[#f4efe8] px-2.5 py-1 text-xs font-semibold tabular-nums text-[#5f5b57]">
                {filteredRows.length}
              </span>
            </div>

            {loading ? (
              <div className="grid min-h-72 place-items-center">
                <Loader2 className="h-6 w-6 animate-spin text-[#6f6a65]" />
              </div>
            ) : filteredRows.length ? (
              <ul className="max-h-[720px] divide-y divide-[#e9e2d8] overflow-y-auto">
                {filteredRows.map((row) => {
                  const selected = selectedRow?.salesperson === row.salesperson;
                  const progress = row.totalStops
                    ? Math.round((row.completedStops / row.totalStops) * 100)
                    : 0;
                  return (
                    <li key={row.salesperson}>
                      <button
                        type="button"
                        onClick={() => selectRow(row)}
                        aria-current={selected ? "true" : undefined}
                        className={`w-full px-4 py-4 text-left transition-colors ${
                          selected ? "bg-[#f8eee9]" : "hover:bg-[#fbf7f1]"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold"
                            style={{ backgroundColor: row.color, color: getReadableTextColor(row.color) }}
                          >
                            {row.displayName.slice(0, 1).toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center justify-between gap-2">
                              <span className="truncate text-sm font-semibold text-[#252a30]">
                                {row.displayName}
                              </span>
                              <ActivityStatus state={row.state} />
                            </span>
                            <span className="mt-2 flex items-center justify-between gap-3 text-xs text-[#6f6a65]">
                              <span>
                                {row.totalStops
                                  ? `${row.completedStops} of ${row.totalStops} visits`
                                  : `${row.dealerCount} assigned dealers`}
                              </span>
                              <span>{formatUpdatedAt(row.updatedAt)}</span>
                            </span>
                            <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-[#e9e2d8]">
                              <span
                                className="block h-full rounded-full bg-[#252a44]"
                                style={{ width: `${progress}%` }}
                              />
                            </span>
                            <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#6f6a65]">
                              <span>{row.dueDealerCount} due</span>
                              {row.delayedStops ? (
                                <span className="font-semibold text-red-700">
                                  {row.delayedStops} delayed
                                </span>
                              ) : null}
                              {row.skippedStops ? (
                                <span className="font-semibold text-amber-800">
                                  {row.skippedStops} skipped
                                </span>
                              ) : null}
                            </span>
                          </span>
                          <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-[#6f6a65]" />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="grid min-h-72 place-items-center px-6 text-center">
                <div>
                  <UserRound className="mx-auto h-7 w-7 text-[#6f6a65]" />
                  <p className="mt-3 text-sm font-semibold">No matching activity</p>
                  <p className="mt-1 text-xs leading-5 text-[#6f6a65]">
                    Change the date or clear one of the filters.
                  </p>
                </div>
              </div>
            )}
          </section>

          <section
            id="activity-route-detail"
            className="scroll-mt-3 rounded-2xl border border-[#ded7cc] bg-white p-4 shadow-[0_8px_24px_rgba(37,42,68,0.05)] sm:p-5"
          >
            {selectedRow ? (
              <>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold tracking-[-0.02em] text-[#252a30]">
                        {selectedRow.displayName}
                      </h3>
                      <ActivityStatus state={selectedRow.state} />
                    </div>
                    <p className="mt-1 text-xs text-[#6f6a65]">
                      {activityDate} · {selectedRow.dealerCount} assigned dealers
                    </p>
                  </div>
                  {selectedRow.plans.length > 1 ? (
                    <Select
                      value={String(selectedPlan?.id ?? "")}
                      onValueChange={(value) => setSelectedPlanId(Number(value))}
                    >
                      <SelectTrigger aria-label="Choose route" className="w-full sm:w-[210px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedRow.plans.map((plan, index) => (
                          <SelectItem key={plan.id} value={String(plan.id)}>
                            Route {index + 1} · {plan.status.replace("_", " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                </div>

                {selectedPlan ? (
                  <>
                    <div className="mt-4">
                      <RoutePreviewMap
                        preview={selectedPlan}
                        dealersById={dealersById}
                      />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {[
                        {
                          icon: RouteIcon,
                          label: "Stops",
                          value: String(selectedPlan.stops.length),
                        },
                        {
                          icon: CheckCircle2,
                          label: "Completed",
                          value: String(
                            selectedPlan.stops.filter(
                              (stop) => stop.status === "completed",
                            ).length,
                          ),
                        },
                        {
                          icon: Fuel,
                          label: "Distance",
                          value: formatDistance(selectedPlan.totalDistanceMeters),
                        },
                        {
                          icon: Clock3,
                          label: "Planned day",
                          value: formatDuration(
                            selectedPlan.totalPlannedSeconds ??
                              selectedPlan.totalDurationSeconds,
                          ),
                        },
                      ].map((metric) => (
                        <div key={metric.label} className="rounded-xl bg-[#f5f0e9] p-3">
                          <metric.icon className="h-4 w-4 text-[#5f5b57]" />
                          <p className="mt-2 text-xs font-semibold text-[#6f6a65]">
                            {metric.label}
                          </p>
                          <p className="mt-0.5 truncate text-sm font-semibold text-[#252a30]">
                            {metric.value}
                          </p>
                        </div>
                      ))}
                    </div>

                    <dl className="mt-4 grid gap-3 rounded-xl border border-[#e9e2d8] bg-[#fffcf7] p-3 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-xs text-[#6f6a65]">Start</dt>
                        <dd className="mt-1 font-medium text-[#34333a]">
                          {selectedPlan.startAddress}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-[#6f6a65]">Finish</dt>
                        <dd className="mt-1 font-medium text-[#34333a]">
                          {selectedPlan.endAddress || selectedPlan.startAddress}
                        </dd>
                      </div>
                    </dl>

                    {mapSegments.length ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {mapSegments.map((segment) => (
                          <a
                            key={segment.href}
                            href={segment.href}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#252a44] px-4 text-sm font-semibold text-white transition-[transform,background-color] hover:bg-[#323952] active:scale-[0.98]"
                          >
                            <Navigation className="h-4 w-4" />
                            {mapSegments.length === 1
                              ? "View in Google Maps"
                              : segment.label}
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ))}
                      </div>
                    ) : null}

                    <ol className="mt-5 max-h-[430px] space-y-2 overflow-y-auto pr-1">
                      {selectedPlan.stops.map((stop) => {
                        const dealer = dealersById.get(stop.dealerId);
                        if (!dealer) return null;
                        return (
                          <li
                            key={stop.id}
                            className="rounded-xl border border-[#e9e2d8] p-3"
                          >
                            <div className="flex items-start gap-3">
                              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#252a44] text-xs font-bold text-white">
                                {stop.sequence}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <p className="truncate text-sm font-semibold text-[#252a30]">
                                      {dealer.dealer}
                                    </p>
                                    <p className="mt-0.5 text-xs text-[#6f6a65]">
                                      {dealer.area} · arrive {formatTime(stop.plannedArrivalAt)}
                                    </p>
                                  </div>
                                  <StopStatus status={stop.status} />
                                </div>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </>
                ) : (
                  <div className="mt-4 grid min-h-80 place-items-center rounded-xl border border-dashed border-[#d6cfc4] bg-[#fffcf7] px-6 text-center">
                    <div>
                      <AlertCircle className="mx-auto h-7 w-7 text-amber-600" />
                      <p className="mt-3 text-sm font-semibold text-[#34333a]">
                        No route saved for this date
                      </p>
                      <p className="mt-1 max-w-sm text-xs leading-5 text-[#6f6a65]">
                        {selectedRow.dueDealerCount} dealers are due. The salesperson can create and save a route from their Routes tab.
                      </p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="grid min-h-[480px] place-items-center px-6 text-center">
                <div>
                  <RouteIcon className="mx-auto h-7 w-7 text-[#6f6a65]" />
                  <p className="mt-3 text-sm font-semibold">Select a salesperson</p>
                  <p className="mt-1 text-xs leading-5 text-[#6f6a65]">
                    Route details and ordered stops will appear here.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}

export function RoutesWorkspace({
  active,
  dealers,
  currentSalesperson,
  userId,
  readOnly,
  salespeople = [],
}: {
  active: boolean;
  dealers: DealerSummary[];
  currentSalesperson: string | null;
  userId: string;
  readOnly: boolean;
  salespeople?: SalespersonAccount[];
}) {
  const [workspace, setWorkspace] = useState<RouteWorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<RoutePreview | null>(null);
  const [previewInputKey, setPreviewInputKey] = useState<string | null>(null);
  const [updatingStop, setUpdatingStop] = useState<number | null>(null);
  const [queuedStops, setQueuedStops] = useState<Set<number>>(new Set());
  const [syncError, setSyncError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const syncingRef = useRef(false);
  const [routeDate, setRouteDate] = useState(localDate);
  const [startAddress, setStartAddress] = useState("");
  const [startSource, setStartSource] = useState<
    "manual" | "last-used" | "current"
  >("manual");
  const [locatingStart, setLocatingStart] = useState(false);
  const [placesAvailability, setPlacesAvailability] = useState<
    "loading" | "ready" | "unavailable"
  >("loading");
  const [endAddress, setEndAddress] = useState("");
  const [returnToStart, setReturnToStart] = useState(true);
  const [workdayStart, setWorkdayStart] = useState("09:00");
  const [workdayEnd, setWorkdayEnd] = useState("18:00");
  const [selectedDealerIds, setSelectedDealerIds] = useState<number[]>([]);
  const [includeApproximate, setIncludeApproximate] = useState(false);
  const [activePlanId, setActivePlanId] = useState<number | null>(null);
  const [routeMode, setRouteMode] = useState<"today" | "plan">("today");
  const [dailyTarget, setDailyTarget] = useState(8);
  const startLocationTouchedRef = useRef(false);
  const workspaceLoadedRef = useRef(false);
  const salesperson = currentSalesperson ?? "";

  const loadWorkspace = useCallback(async (showInitialLoader = false) => {
    if (showInitialLoader) setLoading(true);
    else setRefreshing(true);
    try {
      const data = await fetchRouteWorkspace();
      setWorkspace(data);
      workspaceLoadedRef.current = true;
      setLastRefreshedAt(new Date());
      setActivePlanId((current) => current ?? data.plans.find((plan) => plan.routeDate === localDate())?.id ?? data.plans[0]?.id ?? null);
      const recentStart = data.plans.find((plan) =>
        plan.startAddress.trim(),
      )?.startAddress;
      if (recentStart && !startLocationTouchedRef.current) {
        setStartAddress(recentStart);
        setStartSource("last-used");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Routes could not be loaded.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void loadWorkspace(!workspaceLoadedRef.current);
    if (!readOnly) return;

    const refresh = () => { if (document.visibilityState === "visible") void loadWorkspace(false); };
    const intervalId = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [active, loadWorkspace, readOnly]);

  const syncQueuedVisits = useCallback(async () => {
    if (!userId || syncingRef.current || !navigator.onLine) return;
    syncingRef.current = true;
    setSyncError(null);
    try {
      const visits = await pendingVisits(userId);
      for (const visit of visits) {
        await updateRouteStop(visit.planId, visit.stopId, visit.status);
        await removePendingVisit(visit.key);
      }
      const remaining = await pendingVisits(userId);
      setQueuedStops(new Set(remaining.map((visit) => visit.stopId)));
      if (visits.length) await loadWorkspace(false);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Visit updates could not sync.");
    } finally {
      syncingRef.current = false;
    }
  }, [loadWorkspace, userId]);

  const discardQueuedVisit = useCallback(async (planId: number, stopId: number) => {
    if (!userId || !window.confirm("Discard this unsynced visit update? Check the current route status before recording it again.")) return;
    try {
      await removePendingVisit(`${userId}:${planId}:${stopId}`);
      const remaining = await pendingVisits(userId);
      setQueuedStops(new Set(remaining.map((visit) => visit.stopId)));
      setSyncError(null);
      await loadWorkspace(false);
    } catch {
      toast.error("Could not discard the pending visit update.");
    }
  }, [loadWorkspace, userId]);

  useEffect(() => {
    if (!active || readOnly || !userId || !("indexedDB" in window)) return;
    const refreshConnection = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void syncQueuedVisits();
    };
    void pendingVisits(userId)
      .then((visits) => {
        setQueuedStops(new Set(visits.map((visit) => visit.stopId)));
      })
      .catch(() => setSyncError("Offline visit storage is unavailable on this device."))
      .finally(refreshConnection);
    window.addEventListener("online", refreshConnection);
    window.addEventListener("offline", refreshConnection);
    return () => {
      window.removeEventListener("online", refreshConnection);
      window.removeEventListener("offline", refreshConnection);
    };
  }, [active, readOnly, syncQueuedVisits, userId]);

  const scheduleByDealer = useMemo(
    () => new Map((workspace?.schedules ?? []).map((item) => [item.dealerId, item])),
    [workspace],
  );
  const salespersonDealers = useMemo(
    () =>
      dealers
        .filter((dealer) => dealer.salesperson === salesperson)
        .sort((a, b) => {
          const aSchedule = scheduleByDealer.get(a.id);
          const bSchedule = scheduleByDealer.get(b.id);
          if (!aSchedule?.lastCompletedAt && bSchedule?.lastCompletedAt) return -1;
          if (aSchedule?.lastCompletedAt && !bSchedule?.lastCompletedAt) return 1;
          return (aSchedule?.nextDueAt ?? "0000").localeCompare(
            bSchedule?.nextDueAt ?? "0000",
          );
        }),
    [dealers, salesperson, scheduleByDealer],
  );
  const lastUsedStart = workspace?.plans.find((plan) =>
    plan.startAddress.trim(),
  )?.startAddress;

  const dealersById = useMemo(
    () => new Map(dealers.map((dealer) => [dealer.id, dealer])),
    [dealers],
  );
  const suggestedWeek = useMemo(() => suggestVisitWeek({
    startDate: localDate(), dealers: salespersonDealers,
    schedules: workspace?.schedules ?? [], plans: workspace?.plans ?? [], dailyTarget,
  }), [salespersonDealers, workspace, dailyTarget]);
  const todayPlan = workspace?.plans.find((plan) => plan.routeDate === localDate() && plan.status !== "cancelled") ?? null;
  const nextStop = todayPlan?.stops.find((stop) => stop.status === "planned" || stop.status === "arrived") ?? null;
  const nextDealer = nextStop ? dealersById.get(nextStop.dealerId) : null;
  const selectedDealers = salespersonDealers.filter((dealer) =>
    selectedDealerIds.includes(dealer.id),
  );
  const approximateCount = selectedDealers.filter(
    (dealer) => dealer.locationPrecision !== "address",
  ).length;
  const selectionLimitReached = selectedDealerIds.length >= MAX_ROUTE_STOPS;
  const currentInputKey = JSON.stringify({
    salesperson,
    routeDate,
    startAddress: startAddress.trim(),
    endAddress: returnToStart ? "" : endAddress.trim(),
    returnToStart,
    workdayStart,
    workdayEnd,
    dealerIds: [...selectedDealerIds].sort((a, b) => a - b),
    includeApproximate,
  });
  const reviewPreview = previewInputKey === currentInputKey ? preview : null;
  const activePlan = routeMode === "today" ? todayPlan : workspace?.plans.find((plan) => plan.id === activePlanId) ?? null;
  const activePlanMapSegments = activePlan
    ? buildGoogleMapsRouteSegments(activePlan, dealersById)
    : [];
  const activePlanWarning = routeWarningForDisplay(
    activePlan?.warning ?? null,
    Boolean(workspace?.googleOptimizationConfigured),
  );
  const previewWarning = routeWarningForDisplay(
    reviewPreview?.warning ?? null,
    Boolean(workspace?.googleOptimizationConfigured),
  );
  const routePanelTitle = readOnly
    ? "Route activity"
    : reviewPreview
      ? "Review route"
      : activePlan
        ? activePlan.routeDate === localDate()
          ? "Today’s route"
          : "Saved route"
        : "Route plan";
  const routePanelDescription = readOnly
    ? "Saved plans and visit progress across the team"
    : reviewPreview
      ? "Check the map, timing, and stop order before saving"
      : activePlan
        ? activePlan.routeDate === localDate()
          ? "Saved stop order and live visit progress"
          : "Saved stop order and visit progress"
        : "Your optimized route will appear here for review";
  const oversightMetrics = useMemo(() => {
    const plans = workspace?.plans ?? [];
    const stops = plans.flatMap((plan) => plan.stops);
    return [
      {
        label: "Salespeople reporting",
        value: String(new Set(plans.map((plan) => plan.salesperson)).size),
      },
      {
        label: "Active routes",
        value: String(
          plans.filter((plan) =>
            ["draft", "optimized", "in_progress"].includes(plan.status),
          ).length,
        ),
      },
      {
        label: "Visits completed",
        value: `${stops.filter((stop) => stop.status === "completed").length}/${stops.length}`,
      },
      {
        label: "Dealers due",
        value: String(
          (workspace?.schedules ?? []).filter(
            (schedule) =>
              !schedule.lastCompletedAt ||
              Boolean(schedule.nextDueAt && schedule.nextDueAt <= localDate()),
          ).length,
        ),
      },
    ];
  }, [workspace]);

  function chooseStartLocation(
    value: string,
    source: "manual" | "last-used" | "current",
  ) {
    startLocationTouchedRef.current = true;
    setStartAddress(value);
    setStartSource(source);
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      toast.error("Current location is not available in this browser.");
      return;
    }
    setLocatingStart(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        chooseStartLocation(
          `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`,
          "current",
        );
        setLocatingStart(false);
        toast.success("Current location set as the route start.");
      },
      (error) => {
        setLocatingStart(false);
        const message =
          error.code === error.PERMISSION_DENIED
            ? "Location access was not allowed. Enter a start location instead."
            : "Current location could not be found. Enter a start location instead.";
        toast.error(message);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  async function optimize() {
    setOptimizing(true);
    try {
      const { preview: nextPreview } = await optimizeRoutePlan({
        salesperson,
        routeDate,
        startAddress,
        endAddress: returnToStart ? undefined : endAddress,
        returnToStart,
        workdayStart,
        workdayEnd,
        dealerIds: selectedDealerIds,
        includeApproximate,
      });
      setPreview(nextPreview);
      setPreviewInputKey(currentInputKey);
      toast.success("Route optimized. Review the map and stops before saving.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Route could not be optimized.");
    } finally {
      setOptimizing(false);
    }
  }

  async function savePreview() {
    if (!reviewPreview) return;
    setSaving(true);
    try {
      const { plan } = await saveRoutePreview(reviewPreview.token);
      const data = await fetchRouteWorkspace();
      setWorkspace(data);
      setActivePlanId(plan.id);
      if (plan.routeDate === localDate()) setRouteMode("today");
      setPreview(null);
      setPreviewInputKey(null);
      toast.success("Route saved. It is ready in your saved routes.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Route could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  function adjustPreview() {
    setPreview(null);
    setPreviewInputKey(null);
    requestAnimationFrame(() => {
      document.getElementById("route-dealer-selection")?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    });
  }

  async function setStopStatus(
    plan: SavedRoutePlan,
    stop: SavedRouteStop,
    status: "arrived" | "completed" | "skipped",
  ) {
    setUpdatingStop(stop.id);
    try {
      if (!navigator.onLine) throw new TypeError("Offline");
      const data = await updateRouteStop(plan.id, stop.id, status);
      setWorkspace(data);
      toast.success(status === "completed" ? "Visit completed and next due date updated." : `Stop marked ${status}.`);
    } catch (error) {
      if ((error instanceof TypeError || (error instanceof RouteApiError && error.status >= 500)) && userId && "indexedDB" in window) {
        try {
          await queueVisit({ userId, planId: plan.id, stopId: stop.id, status });
          setQueuedStops((current) => new Set([...current, stop.id]));
          toast.message("Visit update saved on this device. It will sync when connected.");
        } catch {
          toast.error("Visit could not be saved offline. Please try again when connected.");
        }
      } else {
        toast.error(error instanceof Error ? error.message : "Visit status could not be updated.");
      }
    } finally {
      setUpdatingStop(null);
    }
  }

  if (readOnly) {
    return (
      <AdminRouteActivity
        active={active}
        dealers={dealers}
        salespeople={salespeople}
        workspace={workspace}
        loading={loading}
        refreshing={refreshing}
        lastRefreshedAt={lastRefreshedAt}
        onRefresh={() => void loadWorkspace(false)}
      />
    );
  }

  return (
    <section
      id="routes-workspace-panel"
      role="tabpanel"
      hidden={!active}
      aria-labelledby="workspace-routes-tab"
      className="h-[calc(100svh-120px)] overflow-y-auto bg-[#f7f3ea]"
    >
      <div className="mx-auto w-full max-w-[1380px] px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#6f6a65]">
              {readOnly ? "Operations overview" : "Daily planning"}
            </p>
            <h2 id="routes-workspace-title" className="mt-1 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
              {readOnly ? "Team route activity" : "My routes & visits"}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6f6a65]">
              {readOnly
                ? "Review each salesperson’s saved routes, visit progress, and dealers that need attention. Planning and visit updates remain with the salesperson."
                : "Pick today’s stops, optimize the order, then record each visit so overdue dealers surface automatically."}
            </p>
          </div>
          <div className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold ${readOnly ? "border-slate-200 bg-white text-slate-700" : workspace?.googleOptimizationConfigured ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
            {readOnly ? <ShieldCheck className="h-4 w-4" /> : workspace?.googleOptimizationConfigured ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {readOnly ? "Read-only oversight" : workspace?.googleOptimizationConfigured ? "Google road optimization ready" : "Distance-preview mode"}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Route workflow">
          <Button type="button" className="h-11" variant={routeMode === "today" ? "default" : "outline"} onClick={() => setRouteMode("today")}>Today</Button>
          <Button type="button" className="h-11" variant={routeMode === "plan" ? "default" : "outline"} onClick={() => setRouteMode("plan")}>Plan visits</Button>
        </div>
        {!online || queuedStops.size || syncError ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" role="status">
            <span>{!online ? "Offline" : "Connected"} · {queuedStops.size} visit {queuedStops.size === 1 ? "update" : "updates"} waiting to sync{syncError ? ` · ${syncError}` : ""}</span>
            {online && queuedStops.size ? <Button type="button" variant="outline" size="sm" className="h-10" onClick={() => void syncQueuedVisits()}>Retry sync</Button> : null}
          </div>
        ) : null}

        {routeMode === "today" ? (
          <section className="mt-5 rounded-2xl border border-[#ded7cc] bg-white p-4 sm:p-5" aria-labelledby="today-route-heading">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6f6a65]">Today’s work</p>
                <h3 id="today-route-heading" className="mt-1 text-xl font-semibold">{todayPlan ? `${todayPlan.stops.filter((stop) => stop.status === "completed").length} of ${todayPlan.stops.length} visits completed` : "No route saved for today"}</h3>
                <p className="mt-1 text-sm text-[#6f6a65]">{nextDealer ? `Next: ${nextDealer.dealer} · ${nextDealer.area}` : todayPlan ? "All planned stops are finished or skipped." : "Choose dealers and review a route before saving it."}</p>
              </div>
              {nextDealer && nextDealer.locationPrecision === "address" && todayPlan?.optimizationProvider === "google-routes" ? (
                <a className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#252a44] px-4 text-sm font-semibold text-white" href={`https://www.google.com/maps/dir/?${new URLSearchParams({ api: "1", destination: `${nextDealer.latitude},${nextDealer.longitude}`, travelmode: "driving" })}`} target="_blank" rel="noreferrer"><Navigation className="h-4 w-4" />Navigate to next dealer</a>
              ) : !todayPlan ? (
                <Button className="h-11" onClick={() => setRouteMode("plan")}>Plan today</Button>
              ) : null}
            </div>
            {nextDealer && (nextDealer.locationPrecision !== "address" || todayPlan?.optimizationProvider !== "google-routes") ? <p className="mt-3 text-xs text-amber-800">Navigation is available after exact dealer locations and a road-aware route are confirmed.</p> : null}
          </section>
        ) : null}

        {routeMode === "plan" ? (
          <section className="mt-5 rounded-2xl border border-[#ded7cc] bg-white p-4 sm:p-5" aria-labelledby="weekly-visits-heading">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><h3 id="weekly-visits-heading" className="text-base font-semibold">Suggested visits this week</h3><p className="mt-1 text-sm text-[#6f6a65]">{suggestedWeek.dueCount} due dealers. Choose a day, then review its road-aware route.</p></div>
              <div className="flex items-center gap-2"><Label htmlFor="daily-target">Daily target</Label><Input id="daily-target" type="number" min={1} max={25} className="w-20" value={dailyTarget} onChange={(event) => setDailyTarget(Math.min(25, Math.max(1, Number(event.target.value) || 1)))} /></div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {suggestedWeek.days.map((day) => <div key={day.date} className="rounded-xl border border-[#e9e2d8] p-3"><p className="text-sm font-semibold">{new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date(`${day.date}T12:00:00+05:30`))}</p><p className="mt-1 text-xs text-[#6f6a65]">{day.dealerIds.length} suggested visits</p><Button size="sm" variant="outline" className="mt-3 h-10 w-full" disabled={!day.dealerIds.length} onClick={() => { setRouteDate(day.date); setSelectedDealerIds(day.dealerIds); }}>Use this day</Button></div>)}
            </div>
            {suggestedWeek.unplaced ? <p className="mt-3 text-xs text-amber-800">{suggestedWeek.unplaced} due dealers exceed this week’s target. Raise the daily target or plan another week.</p> : null}
            <p className="mt-3 text-xs text-[#6f6a65]">Suggestions group nearby PINs and due dates. Travel time and stop order are checked when you optimize each day.</p>
          </section>
        ) : null}

        {readOnly ? (
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {oversightMetrics.map((metric) => (
              <div
                key={metric.label}
                className="rounded-2xl border border-[#ded7cc] bg-white p-4 shadow-[0_8px_24px_rgba(37,42,68,0.04)]"
              >
                <p className="text-xs font-semibold text-[#6f6a65]">{metric.label}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums tracking-[-0.03em] text-[#252a30]">
                  {metric.value}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        <div className={`mt-6 ${routeMode === "plan" ? "grid gap-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(420px,1.08fr)]" : ""}`}>
          {routeMode === "plan" ? <div className="space-y-5">
            <section className="rounded-2xl border border-[#ded7cc] bg-white p-4 shadow-[0_8px_24px_rgba(37,42,68,0.05)] sm:p-5">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#f4e5de] text-[#252a44]">
                  <CalendarDays className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold">Plan the workday</h3>
                  <p className="text-xs text-[#6f6a65]">Up to {MAX_ROUTE_STOPS} dealer stops per route</p>
                </div>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-[#e5ded4] bg-[#faf5ee] px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6f6a65]">
                    Planning for
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#252a30]">
                    {salesperson}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="route-date">Route date</Label>
                  <DatePicker
                    id="route-date"
                    value={routeDate}
                    ariaLabel="Route date"
                    onValueChange={setRouteDate}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="route-start">Start location</Label>
                  <GooglePlaceAutocomplete
                    id="route-start"
                    value={startAddress}
                    onChange={(value) => chooseStartLocation(value, "manual")}
                    onAvailabilityChange={setPlacesAvailability}
                    describedBy="route-start-help"
                    placeholder="Search office, depot, landmark, or address"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={startSource === "current" ? "secondary" : "outline"}
                      className="h-11 active:scale-[0.98]"
                      disabled={locatingStart}
                      onClick={useCurrentLocation}
                    >
                      {locatingStart ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <LocateFixed className="h-4 w-4" />
                      )}
                      {locatingStart ? "Finding location" : "Use current location"}
                    </Button>
                    {lastUsedStart ? (
                      <Button
                        type="button"
                        variant={startSource === "last-used" ? "secondary" : "outline"}
                        className="h-11 active:scale-[0.98]"
                        onClick={() =>
                          chooseStartLocation(lastUsedStart, "last-used")
                        }
                      >
                        <History className="h-4 w-4" />
                        Use last start
                      </Button>
                    ) : null}
                  </div>
                  <p id="route-start-help" className="text-xs leading-5 text-[#6f6a65]">
                    {startSource === "current"
                      ? "Precise coordinates from this device are selected."
                      : startSource === "last-used"
                        ? "Using the start location from your most recent saved route."
                        : placesAvailability === "ready"
                          ? "Choose a Google Maps suggestion, or enter coordinates manually."
                          : placesAvailability === "loading"
                            ? "Loading Google Maps address suggestions."
                            : "Google suggestions are unavailable; enter a complete address, landmark, or coordinates."}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-xl border border-[#e5ded4] px-3 py-2.5 sm:col-span-2">
                  <div>
                    <Label htmlFor="return-to-start" className="text-sm">Return to the start</Label>
                    <p className="mt-0.5 text-xs text-[#6f6a65]">Turn off for a different finishing location.</p>
                  </div>
                  <Switch id="return-to-start" checked={returnToStart} onCheckedChange={setReturnToStart} />
                </div>
                {!returnToStart ? (
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="route-end">End location</Label>
                    <GooglePlaceAutocomplete
                      id="route-end"
                      value={endAddress}
                      onChange={setEndAddress}
                      placeholder="Search final office, home, or depot"
                    />
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="workday-start">Start time</Label>
                  <Input id="workday-start" type="time" value={workdayStart} onChange={(event) => setWorkdayStart(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="workday-end">Finish by</Label>
                  <Input id="workday-end" type="time" value={workdayEnd} onChange={(event) => setWorkdayEnd(event.target.value)} />
                </div>
              </div>
            </section>

            <section id="route-dealer-selection" className="rounded-2xl border border-[#ded7cc] bg-white p-4 shadow-[0_8px_24px_rgba(37,42,68,0.05)] sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Choose today’s dealers</h3>
                  <p className="mt-1 text-xs text-[#6f6a65]">{selectedDealerIds.length} of {salespersonDealers.length} selected</p>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-11"
                    onClick={() =>
                      setSelectedDealerIds(
                        selectRouteDealerIds(
                          salespersonDealers.map((dealer) => dealer.id),
                        ),
                      )
                    }
                  >
                    {salespersonDealers.length > MAX_ROUTE_STOPS ? `First ${MAX_ROUTE_STOPS}` : "All"}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-11" onClick={() => setSelectedDealerIds([])}>Clear</Button>
                </div>
              </div>

              <ul className="mt-4 max-h-[390px] space-y-2 overflow-y-auto pr-1">
                {salespersonDealers.map((dealer) => {
                  const checked = selectedDealerIds.includes(dealer.id);
                  const disabled = !checked && selectionLimitReached;
                  const due = dueLabel(scheduleByDealer.get(dealer.id), routeDate);
                  return (
                    <li key={dealer.id}>
                      <label className={`flex min-h-16 items-center gap-3 rounded-xl border p-3 transition-colors ${disabled ? "cursor-not-allowed border-[#e9e2d8] bg-[#fffcf7] opacity-55" : "cursor-pointer"} ${checked ? "border-[#c58b76] bg-[#f8eee9]" : disabled ? "" : "border-[#e9e2d8] bg-white hover:bg-[#fbf7f1]"}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() =>
                            setSelectedDealerIds((current) =>
                              toggleRouteDealerId(current, dealer.id),
                            )
                          }
                          className="h-4 w-4 accent-[#252a44]"
                        />
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white" style={{ backgroundColor: getSalespersonColor(dealer.salesperson) }}>
                          <MapPin className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{dealer.dealer}</span>
                          <span className="mt-0.5 block truncate text-xs text-[#6f6a65]">{dealer.area} · {dealer.pincode}</span>
                        </span>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${due.tone === "red" ? "bg-red-50 text-red-700" : due.tone === "amber" ? "bg-amber-50 text-amber-800" : due.tone === "green" ? "bg-emerald-50 text-emerald-800" : "bg-slate-50 text-slate-700"}`}>{due.text}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>

              {selectionLimitReached && salespersonDealers.length > MAX_ROUTE_STOPS ? (
                <p className="mt-3 rounded-xl border border-[#ded7cc] bg-[#fbf7f1] px-3 py-2.5 text-xs leading-5 text-[#6f6a65]" role="status">
                  {MAX_ROUTE_STOPS}-stop limit reached. Clear one stop to choose another dealer.
                </p>
              ) : null}

              {approximateCount ? (
                <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                  <input type="checkbox" checked={includeApproximate} onChange={(event) => setIncludeApproximate(event.target.checked)} className="mt-0.5 h-4 w-4 accent-amber-700" />
                  <span>
                    <strong>{approximateCount} selected {approximateCount === 1 ? "dealer has" : "dealers have"} only a PIN-code point.</strong> Allow an estimated route for planning, then add full addresses before field use.
                  </span>
                </label>
              ) : null}

              <Button
                className="mt-4 h-11 w-full bg-[#252a44] text-white hover:bg-[#323952]"
                disabled={optimizing || !selectedDealerIds.length || !startAddress.trim() || (approximateCount > 0 && !includeApproximate)}
                onClick={() => void optimize()}
              >
                {optimizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Optimize route
              </Button>
            </section>
          </div> : null}

          <div className="space-y-5">
            <section className="rounded-2xl border border-[#ded7cc] bg-white p-4 shadow-[0_8px_24px_rgba(37,42,68,0.05)] sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">
                    {routePanelTitle}
                  </h3>
                  <p className="mt-1 text-xs text-[#6f6a65]">
                    {routePanelDescription}
                  </p>
                </div>
                {reviewPreview ? (
                  <span className="rounded-full border border-[#bfd0c9] bg-[#eef5f1] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[#31584d]">
                    Unsaved preview
                  </span>
                ) : workspace?.plans.length ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6f6a65]">
                      Route history
                    </span>
                    <Select value={String(activePlanId)} onValueChange={(value) => setActivePlanId(Number(value))}>
                      <SelectTrigger aria-label="Choose a saved route" className="h-11 w-[220px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {workspace.plans.map((plan) => <SelectItem key={plan.id} value={String(plan.id)}>{plan.routeDate} · {plan.salesperson}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>

              {loading ? (
                <div className="grid min-h-64 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#6f6a65]" /></div>
              ) : reviewPreview ? (
                <>
                  <div className="mt-4">
                    <RoutePreviewMap preview={reviewPreview} dealersById={dealersById} />
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      { icon: RouteIcon, label: "Stops", value: String(reviewPreview.stops.length) },
                      { icon: Fuel, label: "Distance", value: formatDistance(reviewPreview.totalDistanceMeters) },
                      { icon: Clock3, label: "Planned day", value: formatDuration(reviewPreview.totalPlannedSeconds) },
                      { icon: CircleDot, label: "Finish", value: formatTime(reviewPreview.estimatedEndAt) },
                    ].map((metric) => (
                      <div key={metric.label} className="rounded-xl bg-[#f5f0e9] p-3">
                        <metric.icon className="h-4 w-4 text-[#5f5b57]" />
                        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-[#6f6a65]">{metric.label}</p>
                        <p className="mt-0.5 truncate text-sm font-semibold">{metric.value}</p>
                      </div>
                    ))}
                  </div>

                  {previewWarning ? (
                    <div className="mt-4 flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <p>{previewWarning}</p>
                    </div>
                  ) : null}

                  <p className="mt-3 text-xs leading-5 text-[#6f6a65]">
                    {formatDuration(reviewPreview.totalDurationSeconds)} driving + {formatDuration(reviewPreview.totalServiceSeconds)} with dealers. Nothing has been saved yet.
                  </p>

                  <ol className="mt-5 max-h-[430px] space-y-2 overflow-y-auto pr-1">
                    {reviewPreview.stops.map((stop) => {
                      const dealer = dealersById.get(stop.dealerId);
                      if (!dealer) return null;
                      return (
                        <li key={stop.dealerId} className="rounded-xl border border-[#e9e2d8] p-3 sm:p-4">
                          <div className="flex items-start gap-3">
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#252a44] text-xs font-bold text-white">{stop.sequence}</span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold">{dealer.dealer}</p>
                              <p className="mt-0.5 text-xs text-[#6f6a65]">{dealer.area} · arrive {formatTime(stop.plannedArrivalAt)}</p>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>

                  <div className="mt-5 grid gap-2 border-t border-[#e9e2d8] pt-4 sm:grid-cols-[1fr_auto_auto]">
                    <Button
                      className="h-11 bg-[#252a44] text-white hover:bg-[#323952]"
                      disabled={saving}
                      onClick={() => void savePreview()}
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save route
                    </Button>
                    <Button
                      variant="outline"
                      className="h-11"
                      disabled={saving}
                      onClick={adjustPreview}
                    >
                      <SlidersHorizontal className="h-4 w-4" />
                      Adjust stops
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-11 text-[#6f6a65]"
                      disabled={saving}
                      onClick={() => {
                        setPreview(null);
                        setPreviewInputKey(null);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                      Discard
                    </Button>
                  </div>
                </>
              ) : activePlan ? (
                <>
                  <div className="mt-4">
                    <RoutePreviewMap preview={activePlan} dealersById={dealersById} />
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      { icon: RouteIcon, label: "Stops", value: String(activePlan.stops.length) },
                      { icon: Fuel, label: "Distance", value: formatDistance(activePlan.totalDistanceMeters) },
                      {
                        icon: Clock3,
                        label: activePlan.totalPlannedSeconds == null ? "Drive time" : "Planned day",
                        value: formatDuration(activePlan.totalPlannedSeconds ?? activePlan.totalDurationSeconds),
                      },
                      { icon: CircleDot, label: "Status", value: activePlan.status.replace("_", " ") },
                    ].map((metric) => (
                      <div key={metric.label} className="rounded-xl bg-[#f5f0e9] p-3">
                        <metric.icon className="h-4 w-4 text-[#5f5b57]" />
                        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-[#6f6a65]">{metric.label}</p>
                        <p className="mt-0.5 truncate text-sm font-semibold capitalize">{metric.value}</p>
                      </div>
                    ))}
                  </div>

                  {!readOnly && activePlanWarning ? (
                    <div className="mt-4 flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <p>{activePlanWarning}</p>
                    </div>
                  ) : null}

                  {activePlan.totalPlannedSeconds != null ? (
                    <p className="mt-3 text-xs leading-5 text-[#6f6a65]">
                      {formatDuration(activePlan.totalDurationSeconds)} driving + {formatDuration(activePlan.totalServiceSeconds)} with dealers
                      {activePlan.estimatedEndAt ? ` · estimated finish ${formatTime(activePlan.estimatedEndAt)}` : ""}
                    </p>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {activePlanMapSegments.map((segment) => (
                      <a key={segment.href} href={segment.href} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#252a44] px-4 text-sm font-semibold text-white transition-[transform,background-color] hover:bg-[#323952] active:scale-[0.98]">
                        <Navigation className="h-4 w-4" />
                        {activePlanMapSegments.length === 1
                          ? readOnly ? "View in Google Maps" : "Open in Google Maps"
                          : segment.label}
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ))}
                  </div>
                  {activePlanMapSegments.length > 1 ? (
                    <p className="mt-2 text-xs leading-5 text-[#6f6a65]">
                      Google Maps opens this route in {activePlanMapSegments.length} ordered parts so every stop works on mobile. Complete each part in sequence.
                    </p>
                  ) : null}

                  <ol className="mt-5 space-y-2">
                    {activePlan.stops.map((stop) => {
                      const dealer = dealersById.get(stop.dealerId);
                      if (!dealer) return null;
                      return (
                        <li key={stop.id} className="rounded-xl border border-[#e9e2d8] p-3 sm:p-4">
                          <div className="flex items-start gap-3">
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#252a44] text-xs font-bold text-white">{stop.sequence}</span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <p className="truncate text-sm font-semibold">{dealer.dealer}</p>
                                  <p className="mt-0.5 text-xs text-[#6f6a65]">{dealer.area} · arrive {formatTime(stop.plannedArrivalAt)}</p>
                                </div>
                                <StopStatus status={stop.status} />
                              </div>
                              {queuedStops.has(stop.id) ? <div className="mt-2 flex flex-wrap items-center gap-2"><p className="text-xs font-semibold text-amber-800">Pending sync on this device</p><Button type="button" size="sm" variant="ghost" className="h-9 text-xs" onClick={() => void discardQueuedVisit(activePlan.id, stop.id)}>Discard pending update</Button></div> : null}
                              {!readOnly && !queuedStops.has(stop.id) ? <div className="mt-3 flex flex-wrap gap-2">
                                {stop.status === "planned" ? (
                                  <Button size="sm" className="h-11" variant="outline" disabled={updatingStop === stop.id} onClick={() => void setStopStatus(activePlan, stop, "arrived")}>Arrived</Button>
                                ) : null}
                                {stop.status !== "completed" && stop.status !== "skipped" ? (
                                  <Button size="sm" className="h-11 bg-[#252a44] text-white" disabled={updatingStop === stop.id} onClick={() => void setStopStatus(activePlan, stop, "completed")}>
                                    {updatingStop === stop.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Complete
                                  </Button>
                                ) : null}
                                {stop.status !== "completed" && stop.status !== "skipped" ? (
                                  <Button size="sm" className="h-11" variant="ghost" disabled={updatingStop === stop.id} onClick={() => void setStopStatus(activePlan, stop, "skipped")}>Skip</Button>
                                ) : null}
                              </div> : null}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </>
              ) : (
                <div className="grid min-h-72 place-items-center rounded-xl border border-dashed border-[#d6cfc4] bg-[#fffcf7] px-6 text-center">
                  <div>
                    <RouteIcon className="mx-auto h-7 w-7 text-[#6f6a65]" />
                    <p className="mt-3 text-sm font-semibold">
                      {readOnly ? "No route activity yet" : "No route planned yet"}
                    </p>
                    <p className="mt-1 max-w-sm text-xs leading-5 text-[#6f6a65]">
                      {readOnly
                        ? "Salesperson routes will appear here after they save their first plan."
                        : "Choose your start location and today’s dealer stops to build the first plan."}
                    </p>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </section>
  );
}
