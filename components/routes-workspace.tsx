"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleDot,
  Clock3,
  ExternalLink,
  Fuel,
  History,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  Route as RouteIcon,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { Dealer } from "@/app/dealers";
import { getSalespersonColor } from "@/app/dealers";
import { Button } from "@/components/ui/button";
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
  fetchRouteWorkspace,
  optimizeRoutePlan,
  saveRoutePreview,
  updateRouteStop,
} from "@/lib/route-api";
import type {
  DealerSchedule,
  RoutePreview,
  RouteWorkspaceData,
  SavedRoutePlan,
  SavedRouteStop,
} from "@/lib/route-contract";
import { buildGoogleMapsRouteSegments } from "@/lib/google-maps-url";
import { routeWarningForDisplay } from "@/lib/route-warning";
import { toast } from "sonner";

function localDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
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
    <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.06em] ${styles}`}>
      {status.replace("_", " ")}
    </span>
  );
}

export function RoutesWorkspace({
  active,
  dealers,
  currentSalesperson,
  readOnly,
}: {
  active: boolean;
  dealers: Dealer[];
  currentSalesperson: string | null;
  readOnly: boolean;
}) {
  const [workspace, setWorkspace] = useState<RouteWorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<RoutePreview | null>(null);
  const [previewInputKey, setPreviewInputKey] = useState<string | null>(null);
  const [updatingStop, setUpdatingStop] = useState<number | null>(null);
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
  const [selectedDealerIds, setSelectedDealerIds] = useState<number[]>(() =>
    dealers
      .filter((dealer) => dealer.salesperson === currentSalesperson)
      .map((dealer) => dealer.id),
  );
  const [includeApproximate, setIncludeApproximate] = useState(false);
  const [activePlanId, setActivePlanId] = useState<number | null>(null);
  const startLocationTouchedRef = useRef(false);
  const salesperson = currentSalesperson ?? "";

  useEffect(() => {
    if (!active || workspace) return;
    let cancelled = false;
    void fetchRouteWorkspace()
      .then((data) => {
        if (cancelled) return;
        setWorkspace(data);
        setActivePlanId(data.plans[0]?.id ?? null);
        const recentStart = data.plans.find((plan) =>
          plan.startAddress.trim(),
        )?.startAddress;
        if (recentStart && !startLocationTouchedRef.current) {
          setStartAddress(recentStart);
          setStartSource("last-used");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Routes could not be loaded.");
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [active, workspace]);

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
  const selectedDealers = salespersonDealers.filter((dealer) =>
    selectedDealerIds.includes(dealer.id),
  );
  const approximateCount = selectedDealers.filter(
    (dealer) => dealer.locationPrecision !== "address",
  ).length;
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
  const activePlan = workspace?.plans.find((plan) => plan.id === activePlanId) ?? null;
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
      const data = await updateRouteStop(plan.id, stop.id, status);
      setWorkspace(data);
      toast.success(status === "completed" ? "Visit completed and next due date updated." : `Stop marked ${status}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Visit status could not be updated.");
    } finally {
      setUpdatingStop(null);
    }
  }

  return (
    <section
      id="routes-workspace-panel"
      hidden={!active}
      aria-labelledby="routes-workspace-title"
      className="h-[calc(100svh-120px)] overflow-y-auto bg-[#eef0ed]"
    >
      <div className="mx-auto w-full max-w-[1380px] px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#73807b]">
              {readOnly ? "Operations overview" : "Daily planning"}
            </p>
            <h2 id="routes-workspace-title" className="mt-1 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
              {readOnly ? "Team route activity" : "My routes & visits"}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#66716d]">
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

        {readOnly ? (
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {oversightMetrics.map((metric) => (
              <div
                key={metric.label}
                className="rounded-2xl border border-[#d8ddda] bg-white p-4 shadow-[0_8px_24px_rgba(25,38,34,0.04)]"
              >
                <p className="text-xs font-semibold text-[#73807b]">{metric.label}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums tracking-[-0.03em] text-[#26312e]">
                  {metric.value}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        <div className={`mt-6 ${readOnly ? "" : "grid gap-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(420px,1.08fr)]"}`}>
          {!readOnly ? <div className="space-y-5">
            <section className="rounded-2xl border border-[#d8ddda] bg-white p-4 shadow-[0_8px_24px_rgba(25,38,34,0.05)] sm:p-5">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#e9efec] text-[#173a34]">
                  <CalendarDays className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold">Plan the workday</h3>
                  <p className="text-xs text-[#73807b]">Up to 25 dealer stops per route</p>
                </div>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-[#dce1de] bg-[#f6f8f6] px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#7a8581]">
                    Planning for
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#26312e]">
                    {salesperson}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="route-date">Route date</Label>
                  <Input id="route-date" type="date" value={routeDate} onChange={(event) => setRouteDate(event.target.value)} />
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
                  <p id="route-start-help" className="text-xs leading-5 text-[#78827e]">
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
                <div className="flex items-center justify-between gap-4 rounded-xl border border-[#dce1de] px-3 py-2.5 sm:col-span-2">
                  <div>
                    <Label htmlFor="return-to-start" className="text-sm">Return to the start</Label>
                    <p className="mt-0.5 text-xs text-[#78827e]">Turn off for a different finishing location.</p>
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

            <section id="route-dealer-selection" className="rounded-2xl border border-[#d8ddda] bg-white p-4 shadow-[0_8px_24px_rgba(25,38,34,0.05)] sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Choose today’s dealers</h3>
                  <p className="mt-1 text-xs text-[#73807b]">{selectedDealerIds.length} of {salespersonDealers.length} selected</p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setSelectedDealerIds(salespersonDealers.map((dealer) => dealer.id))}>All</Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedDealerIds([])}>Clear</Button>
                </div>
              </div>

              <ul className="mt-4 max-h-[390px] space-y-2 overflow-y-auto pr-1">
                {salespersonDealers.map((dealer) => {
                  const checked = selectedDealerIds.includes(dealer.id);
                  const due = dueLabel(scheduleByDealer.get(dealer.id), routeDate);
                  return (
                    <li key={dealer.id}>
                      <label className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${checked ? "border-[#9aada6] bg-[#f2f6f3]" : "border-[#e0e4e2] bg-white hover:bg-[#f8faf8]"}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setSelectedDealerIds((current) => checked ? current.filter((id) => id !== dealer.id) : [...current, dealer.id])}
                          className="h-4 w-4 accent-[#173a34]"
                        />
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white" style={{ backgroundColor: getSalespersonColor(dealer.salesperson) }}>
                          <MapPin className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{dealer.dealer}</span>
                          <span className="mt-0.5 block truncate text-xs text-[#74807c]">{dealer.area} · {dealer.pincode}</span>
                        </span>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${due.tone === "red" ? "bg-red-50 text-red-700" : due.tone === "amber" ? "bg-amber-50 text-amber-800" : due.tone === "green" ? "bg-emerald-50 text-emerald-800" : "bg-slate-50 text-slate-700"}`}>{due.text}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>

              {approximateCount ? (
                <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                  <input type="checkbox" checked={includeApproximate} onChange={(event) => setIncludeApproximate(event.target.checked)} className="mt-0.5 h-4 w-4 accent-amber-700" />
                  <span>
                    <strong>{approximateCount} selected {approximateCount === 1 ? "dealer has" : "dealers have"} only a PIN-code point.</strong> Allow an estimated route for planning, then add full addresses before field use.
                  </span>
                </label>
              ) : null}

              <Button
                className="mt-4 h-11 w-full bg-[#173a34] text-white hover:bg-[#214b43]"
                disabled={optimizing || !selectedDealerIds.length || !startAddress.trim() || (approximateCount > 0 && !includeApproximate)}
                onClick={() => void optimize()}
              >
                {optimizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Optimize route
              </Button>
            </section>
          </div> : null}

          <div className="space-y-5">
            <section className="rounded-2xl border border-[#d8ddda] bg-white p-4 shadow-[0_8px_24px_rgba(25,38,34,0.05)] sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">
                    {routePanelTitle}
                  </h3>
                  <p className="mt-1 text-xs text-[#73807b]">
                    {routePanelDescription}
                  </p>
                </div>
                {reviewPreview ? (
                  <span className="rounded-full border border-[#bfd0c9] bg-[#eef5f1] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#31584d]">
                    Unsaved preview
                  </span>
                ) : workspace?.plans.length ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#7a8581]">
                      Route history
                    </span>
                    <Select value={String(activePlanId)} onValueChange={(value) => setActivePlanId(Number(value))}>
                      <SelectTrigger aria-label="Choose a saved route" className="w-[220px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {workspace.plans.map((plan) => <SelectItem key={plan.id} value={String(plan.id)}>{plan.routeDate} · {plan.salesperson}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>

              {loading ? (
                <div className="grid min-h-64 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#60706a]" /></div>
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
                      <div key={metric.label} className="rounded-xl bg-[#f4f6f4] p-3">
                        <metric.icon className="h-4 w-4 text-[#52615c]" />
                        <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-[#7a8581]">{metric.label}</p>
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

                  <p className="mt-3 text-xs leading-5 text-[#66716d]">
                    {formatDuration(reviewPreview.totalDurationSeconds)} driving + {formatDuration(reviewPreview.totalServiceSeconds)} with dealers. Nothing has been saved yet.
                  </p>

                  <ol className="mt-5 max-h-[430px] space-y-2 overflow-y-auto pr-1">
                    {reviewPreview.stops.map((stop) => {
                      const dealer = dealersById.get(stop.dealerId);
                      if (!dealer) return null;
                      return (
                        <li key={stop.dealerId} className="rounded-xl border border-[#dfe4e1] p-3 sm:p-4">
                          <div className="flex items-start gap-3">
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#173a34] text-xs font-bold text-white">{stop.sequence}</span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold">{dealer.dealer}</p>
                              <p className="mt-0.5 text-xs text-[#75817d]">{dealer.area} · arrive {formatTime(stop.plannedArrivalAt)}</p>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>

                  <div className="mt-5 grid gap-2 border-t border-[#e0e5e2] pt-4 sm:grid-cols-[1fr_auto_auto]">
                    <Button
                      className="h-11 bg-[#173a34] text-white hover:bg-[#214b43]"
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
                      className="h-11 text-[#68736f]"
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
                      <div key={metric.label} className="rounded-xl bg-[#f4f6f4] p-3">
                        <metric.icon className="h-4 w-4 text-[#52615c]" />
                        <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-[#7a8581]">{metric.label}</p>
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
                    <p className="mt-3 text-xs leading-5 text-[#66716d]">
                      {formatDuration(activePlan.totalDurationSeconds)} driving + {formatDuration(activePlan.totalServiceSeconds)} with dealers
                      {activePlan.estimatedEndAt ? ` · estimated finish ${formatTime(activePlan.estimatedEndAt)}` : ""}
                    </p>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {activePlanMapSegments.map((segment) => (
                      <a key={segment.href} href={segment.href} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#173a34] px-4 text-sm font-semibold text-white transition-[transform,background-color] hover:bg-[#214b43] active:scale-[0.98]">
                        <Navigation className="h-4 w-4" />
                        {activePlanMapSegments.length === 1
                          ? readOnly ? "View in Google Maps" : "Open in Google Maps"
                          : segment.label}
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ))}
                  </div>
                  {activePlanMapSegments.length > 1 ? (
                    <p className="mt-2 text-xs leading-5 text-[#73807b]">
                      Google Maps opens this route in {activePlanMapSegments.length} ordered parts so every stop works on mobile. Complete each part in sequence.
                    </p>
                  ) : null}

                  <ol className="mt-5 space-y-2">
                    {activePlan.stops.map((stop) => {
                      const dealer = dealersById.get(stop.dealerId);
                      if (!dealer) return null;
                      return (
                        <li key={stop.id} className="rounded-xl border border-[#dfe4e1] p-3 sm:p-4">
                          <div className="flex items-start gap-3">
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#173a34] text-xs font-bold text-white">{stop.sequence}</span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <p className="truncate text-sm font-semibold">{dealer.dealer}</p>
                                  <p className="mt-0.5 text-xs text-[#75817d]">{dealer.area} · arrive {formatTime(stop.plannedArrivalAt)}</p>
                                </div>
                                <StopStatus status={stop.status} />
                              </div>
                              {!readOnly ? <div className="mt-3 flex flex-wrap gap-2">
                                {stop.status === "planned" ? (
                                  <Button size="sm" variant="outline" disabled={updatingStop === stop.id} onClick={() => void setStopStatus(activePlan, stop, "arrived")}>Arrived</Button>
                                ) : null}
                                {stop.status !== "completed" && stop.status !== "skipped" ? (
                                  <Button size="sm" className="bg-[#173a34] text-white" disabled={updatingStop === stop.id} onClick={() => void setStopStatus(activePlan, stop, "completed")}>
                                    {updatingStop === stop.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Complete
                                  </Button>
                                ) : null}
                                {stop.status !== "completed" && stop.status !== "skipped" ? (
                                  <Button size="sm" variant="ghost" disabled={updatingStop === stop.id} onClick={() => void setStopStatus(activePlan, stop, "skipped")}>Skip</Button>
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
                <div className="grid min-h-72 place-items-center rounded-xl border border-dashed border-[#ccd3cf] bg-[#fafbfa] px-6 text-center">
                  <div>
                    <RouteIcon className="mx-auto h-7 w-7 text-[#8b9692]" />
                    <p className="mt-3 text-sm font-semibold">
                      {readOnly ? "No route activity yet" : "No route planned yet"}
                    </p>
                    <p className="mt-1 max-w-sm text-xs leading-5 text-[#78827e]">
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
