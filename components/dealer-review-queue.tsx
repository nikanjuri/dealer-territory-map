"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Search,
} from "lucide-react";
import type { Dealer } from "@/app/dealers";
import type { DealerSummary } from "@/lib/dealer-summary";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchDealerImportReviews,
  resolveDealerImportReview,
  saveDealerImportReview,
} from "@/lib/dealer-review-api";
import type { DealerImportReview } from "@/lib/dealer-review-contract";
import { dealerQualityBucket } from "@/lib/dealer-filters";
import { geocodeDealerLocation } from "@/lib/geocoding";
import { canonicalizeAreaName } from "@/lib/area-normalization";
import {
  INDIAN_STATES,
  normalizeIndianState,
} from "@/lib/indian-states";
import { toast } from "sonner";

const PAGE_SIZE = 10;

export function DealerReviewQueue({
  dealers,
  salespeople,
  initialPendingCount,
  onEditDealer,
  onResolved,
}: {
  dealers: DealerSummary[];
  salespeople: string[];
  initialPendingCount: number;
  onEditDealer: (dealer: DealerSummary) => void;
  onResolved: (dealer: Dealer) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reviewsLoaded, setReviewsLoaded] = useState(false);
  const [reviews, setReviews] = useState<DealerImportReview[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<DealerImportReview | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!open || reviewsLoaded || loadError) return;
    let cancelled = false;
    void fetchDealerImportReviews()
      .then((rows) => {
        if (!cancelled) {
          setReviews(rows);
          setReviewsLoaded(true);
          setLoadError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "The review queue could not be loaded.");
        }
      })
    return () => {
      cancelled = true;
    };
  }, [open, reviewsLoaded, loadError]);

  const mappedReviews = useMemo(
    () => dealers.filter((dealer) => dealerQualityBucket(dealer) === "review"),
    [dealers],
  );
  const combinedReviews = useMemo(
    () => [
      ...mappedReviews.map((dealer) => ({ kind: "dealer" as const, dealer })),
      ...reviews.map((review) => ({ kind: "import" as const, review })),
    ],
    [mappedReviews, reviews],
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return combinedReviews;
    return combinedReviews.filter((item) => {
      const values = item.kind === "dealer"
        ? [
            item.dealer.dealer,
            item.dealer.salesperson,
            item.dealer.pincode,
            item.dealer.area,
            item.dealer.state,
            item.dealer.reviewNote,
            ...(item.dealer.postalSuggestions ?? []),
          ]
        : [
            item.review.dealer,
            item.review.salesperson,
            item.review.pincode,
            item.review.area,
            item.review.state,
            item.review.reviewCategory,
            item.review.reviewDetail,
          ];
      return values.filter(Boolean).join(" ").toLowerCase().includes(normalized);
    });
  }, [combinedReviews, query]);
  const pendingCount = reviewsLoaded ? reviews.length : initialPendingCount;
  const totalReviewCount = mappedReviews.length + pendingCount;
  const loading = open && !reviewsLoaded && !loadError;
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setSelected(null);
      }}
    >
      <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-[0_8px_24px_rgba(37,42,68,0.04)] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-amber-950">
              {totalReviewCount} record{totalReviewCount === 1 ? "" : "s"} need review
            </p>
            <p className="mt-1 text-xs leading-5 text-amber-900/75">
              {mappedReviews.length} mapped dealer{mappedReviews.length === 1 ? "" : "s"} and {pendingCount} pending import{pendingCount === 1 ? "" : "s"} are in one queue.
            </p>
          </div>
        </div>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={totalReviewCount === 0}
            className="border-amber-300 bg-white text-amber-950 hover:bg-amber-100"
          >
            Review all
          </Button>
        </DialogTrigger>
      </div>

      <DialogContent className="max-h-[calc(100svh-24px)] overflow-y-auto rounded-2xl border-[#ded7cc] bg-[#fffcf7] text-[#252a30] sm:max-w-[920px]">
        {loading ? (
          <div className="grid min-h-72 place-items-center text-center" role="status">
            <div>
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#6f6a65]" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold">Loading review records…</p>
            </div>
          </div>
        ) : loadError ? (
          <div role="alert" className="p-6 text-center"><p className="text-sm text-amber-900">{loadError}</p><Button type="button" className="mt-4" onClick={() => setLoadError(null)}>Retry review records</Button></div>
        ) : selected ? (
          <ReviewEditor
            key={selected.id}
            review={selected}
            salespeople={salespeople}
            onBack={() => setSelected(null)}
            onSaved={(updated) => {
              setReviews((current) =>
                current.map((row) => (row.id === updated.id ? updated : row)),
              );
              setSelected(updated);
            }}
            onResolved={(dealer) => {
              setReviews((current) => current.filter((row) => row.id !== selected.id));
              setSelected(null);
              onResolved(dealer);
            }}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Needs review</DialogTitle>
              <DialogDescription>
                Review mapped dealer details and incomplete imported rows in one place.
              </DialogDescription>
            </DialogHeader>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8d8882]" />
              <Input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="Search dealer, salesperson, area or issue"
                className="h-10 border-[#d6cfc4] bg-white pl-9"
              />
            </div>
            <div className="mt-3 space-y-2">
              {visible.map((item) => {
                const dealer = item.kind === "dealer" ? item.dealer : null;
                const review = item.kind === "import" ? item.review : null;
                return (
                <button
                  key={dealer ? `dealer-${dealer.id}` : `import-${review?.id}`}
                  type="button"
                  onClick={() => {
                    if (dealer) {
                      setOpen(false);
                      onEditDealer(dealer);
                    } else if (review) {
                      setSelected(review);
                    }
                  }}
                  className="flex w-full items-center gap-3 rounded-xl border border-[#ded7cc] bg-white p-3 text-left transition-[transform,background-color] active:scale-[0.99] hover:bg-[#fbf7f1]"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-800">
                    {dealer ? <Building2 className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[#252a30]">
                      {dealer?.dealer ?? review?.dealer}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-[#6f6a65]">
                      {(dealer?.salesperson ?? review?.salesperson)} · {(dealer?.area ?? review?.area) || "Area missing"} · {(dealer?.pincode ?? review?.pincode) || "PIN missing"}
                    </span>
                    <span className="mt-1 block truncate text-[11px] text-amber-800/80">
                      {dealer
                        ? dealer.reviewNote ?? "Postal details need review"
                        : review?.reviewDetail}
                    </span>
                  </span>
                  <span className="hidden rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 sm:inline-flex">
                    {dealer ? "Mapped dealer" : "Pending import"}
                  </span>
                </button>
                );
              })}
              {!visible.length ? (
                <p className="rounded-xl border border-dashed border-[#d6cfc4] bg-white p-8 text-center text-sm text-[#6f6a65]">
                  No review records match this search.
                </p>
              ) : null}
            </div>
            <DialogFooter className="mt-4 flex-row items-center justify-between sm:justify-between">
              <p className="text-xs text-[#6f6a65]">
                {filtered.length} record{filtered.length === 1 ? "" : "s"} · Page {currentPage} of {pageCount}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  aria-label="Previous review page"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  aria-label="Next review page"
                  disabled={currentPage >= pageCount}
                  onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReviewEditor({
  review,
  salespeople,
  onBack,
  onSaved,
  onResolved,
}: {
  review: DealerImportReview;
  salespeople: string[];
  onBack: () => void;
  onSaved: (review: DealerImportReview) => void;
  onResolved: (dealer: Dealer) => void;
}) {
  const [salesperson, setSalesperson] = useState(review.salesperson);
  const [dealer, setDealer] = useState(review.dealer);
  const [pincode, setPincode] = useState(review.pincode);
  const [area, setArea] = useState(review.area);
  const [address, setAddress] = useState(review.address);
  const [state, setState] = useState(review.state);
  const [saving, setSaving] = useState(false);

  const input = {
    salesperson,
    dealer,
    pincode,
    area,
    address,
    state: normalizeIndianState(state) ?? "" as const,
  };

  async function save() {
    const updated = await saveDealerImportReview(review.id, input);
    onSaved(updated);
    return updated;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await save();
      toast.success("Review corrections saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Corrections could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function verify() {
    const normalizedState = normalizeIndianState(state);
    if (!dealer.trim() || !area.trim() || !/^\d{6}$/.test(pincode) || !normalizedState) {
      toast.error("Enter a dealer, area, valid 6-digit PIN code and state before verifying.");
      return;
    }
    setSaving(true);
    try {
      await save();
      const location = await geocodeDealerLocation({
        address,
        area,
        pincode,
        state: normalizedState,
      });
      if (!location) {
        throw new Error("That corrected location could not be found. Check the area, PIN and address.");
      }
      const created = await resolveDealerImportReview(review.id, {
        salesperson: salesperson.trim().toUpperCase(),
        dealer: dealer.trim().toUpperCase(),
        pincode,
        area: canonicalizeAreaName(area),
        sourceArea: area.trim(),
        address: address.trim() || undefined,
        state: normalizedState,
        longitude: location.coordinates[0],
        latitude: location.coordinates[1],
        locationPrecision: location.precision,
        geocodedAddress: location.resolvedAddress,
        validationStatus: "verified",
        validationSource: "manual",
        validationCheckedAt: new Date().toISOString(),
        validationDataset: "manual-review",
      });
      onResolved(created);
      toast.success(`${created.dealer} verified and added to the map.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The dealer could not be verified.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <DialogHeader>
        <button
          type="button"
          onClick={onBack}
          className="mb-2 inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-[#5f5b57] hover:text-[#252a30]"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to queue
        </button>
        <DialogTitle>Review dealer</DialogTitle>
        <DialogDescription>
          Source row {review.sourceRow} · {review.sourceFile}
        </DialogDescription>
      </DialogHeader>
      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
        <p className="font-semibold">{review.reviewCategory}</p>
        <p className="mt-0.5 text-amber-900/75">{review.reviewDetail}</p>
      </div>
      <div className="grid gap-4 py-4 sm:grid-cols-2">
        <Field label="Dealer name" className="sm:col-span-2">
          <Input value={dealer} onChange={(event) => setDealer(event.target.value)} />
        </Field>
        <Field label="Salesperson">
          <Select value={salesperson} onValueChange={setSalesperson}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {salespeople.map((person) => <SelectItem key={person} value={person}>{person}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="State">
          <Select value={state || undefined} onValueChange={setState}>
            <SelectTrigger><SelectValue placeholder="Choose state" /></SelectTrigger>
            <SelectContent>
              {INDIAN_STATES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="PIN code">
          <Input
            value={pincode}
            inputMode="numeric"
            onChange={(event) => setPincode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          />
        </Field>
        <Field label="Area">
          <Input value={area} onChange={(event) => setArea(event.target.value)} />
        </Field>
        <Field label="Full address (optional)" className="sm:col-span-2">
          <Textarea value={address} onChange={(event) => setAddress(event.target.value)} className="min-h-20" />
        </Field>
      </div>
      <DialogFooter>
        <Button type="submit" variant="outline" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save corrections
        </Button>
        <Button type="button" disabled={saving} onClick={() => void verify()} className="bg-[#b65a38] text-white hover:bg-[#a64b2f]">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Verify and add dealer
        </Button>
      </DialogFooter>
    </form>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`grid gap-2 ${className ?? ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
