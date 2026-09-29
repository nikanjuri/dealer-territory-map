"use client";

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  FileImage,
  FileJson,
  FileSpreadsheet,
  Info,
  List,
  Loader2,
  LogOut,
  Map as MapIcon,
  MapPinned,
  Pencil,
  Plus,
  Route as RouteIcon,
  Search,
  ShoppingBag,
  Store,
  SlidersHorizontal,
  Trash2,
  Upload,
  Users,
  UserCog,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { GooglePlaceAutocomplete, type GooglePlaceSelection } from "@/components/google-place-autocomplete";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Progress } from "@/components/ui/progress";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { Textarea } from "@/components/ui/textarea";
import {
  dropdownContentClass,
  dropdownItemClass,
  dropdownSearchClass,
  dropdownTriggerClass,
} from "@/components/ui/dropdown-styles";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { importGoogleMapsLibrary } from "@/lib/google-maps-loader";
import { resolveGoogleMapsMapId } from "@/lib/google-maps-config";
import type { DealerSummary } from "@/lib/dealer-summary";
import { dealerFilterKey, pageForFilterRevision } from "@/lib/dealer-pagination";
import { pointInsidePinFeature } from "@/lib/dealer-geography";
import { validateSelectedDealerPlace } from "@/lib/dealer-place-validation";
import {
  cachedPincodeBoundaries,
  loadInitialPincodeBoundaries,
  loadMissingPincodeBoundaries,
  type PincodeBoundaryData,
} from "@/lib/pincode-boundaries";
import { getSalespersonColor, type Dealer } from "./dealers";
import { canonicalizeAreaName } from "@/lib/area-normalization";
import {
  validatePostalDetailsFromApp,
  type PostalValidationResult,
} from "@/lib/postal-validation";
import {
  geocodeDealerLocation,
  type GeocodedLocation,
} from "@/lib/geocoding";
import {
  REQUIRED_IMPORT_COLUMNS,
  isImportDraftValid,
  makeImportDraft,
  parseExtractedText,
  type ImportDraftRow,
} from "@/lib/import-normalization";
import {
  filterDealerRecords,
  type DealerFilters,
  type QualityFilter,
  type StateFilter,
} from "@/lib/dealer-filters";
import { readDealerViewUrl, writeDealerViewUrl } from "@/lib/dealer-view-link";
import {
  createDealer,
  createDealers,
  fetchDealerDetail,
  fetchDealerDirectoryPage,
  removeDealer,
  saveDealer,
} from "@/lib/dealer-api";
import { authClient } from "@/lib/auth-client";
import { INDIAN_STATES, normalizeIndianState } from "@/lib/indian-states";
import {
  highlightedStateBoundaryCodes,
  EMPTY_STATE_BOUNDARIES,
  loadStateBoundaries,
  selectStateBoundaries,
  stateBoundaryFeatureId,
  type StateBoundaryData,
} from "@/lib/state-boundaries";
import type { AppSession, SalespersonAccount } from "@/lib/access-contract";
import {
  ApiRequestError,
  fetchCommerceWorkspaceBootstrap,
  fetchShopWorkspaceBootstrap,
  fetchAppSession,
  fetchWorkspaceBootstrap,
  invalidateWorkspaceBootstraps,
  type CommerceWorkspaceBootstrap,
  type ShopWorkspaceBootstrap,
} from "@/lib/session-api";

const RoutesWorkspace = dynamic(() =>
  import("@/components/routes-workspace").then(
    (module) => module.RoutesWorkspace,
  ),
);
const TeamWorkspace = dynamic(() =>
  import("@/components/team-workspace").then(
    (module) => module.TeamWorkspace,
  ),
);
const DealerReviewQueue = dynamic(() =>
  import("@/components/dealer-review-queue").then(
    (module) => module.DealerReviewQueue,
  ),
);

const CommerceWorkspace = dynamic(() =>
  import("@/components/commerce-workspace").then(
    (module) => module.CommerceWorkspace,
  ),
);
const ShopWorkspace = dynamic(() =>
  import("@/components/shop-workspace").then(
    (module) => module.ShopWorkspace,
  ),
);

type WorkspaceView = "map" | "dealers" | "routes" | "team" | "commerce" | "shop";

type MapData = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: Record<string, string | number | boolean | null>;
    geometry: {
      type: "Point" | "Polygon" | "MultiPolygon";
      coordinates: number[] | number[][][] | number[][][][];
    };
  }>;
};

function postalValidationFields(
  validation: PostalValidationResult,
): Pick<
  Dealer,
  | "reviewNote"
  | "postalSuggestions"
  | "validationStatus"
  | "validationSource"
  | "validationCheckedAt"
  | "validationDataset"
> {
  return {
    reviewNote:
      validation.status === "verified" ? undefined : validation.message,
    postalSuggestions: validation.suggestions.length
      ? validation.suggestions
      : undefined,
    validationStatus: validation.status,
    validationSource: "postal-directory",
    validationCheckedAt: new Date().toISOString(),
    validationDataset: validation.datasetVersion,
  };
}

type WebMcpContext = {
  registerTool: (
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: Record<string, unknown>;
      annotations: {
        readOnlyHint: boolean;
        untrustedContentHint: boolean;
      };
      execute: (input: unknown) => unknown | Promise<unknown>;
    },
    options?: { signal?: AbortSignal },
  ) => void | Promise<void>;
};

// Low-volume fallbacks for PINs already present in the source workbook. These
// are location hints only; they are not dealer seed records.
const PIN_COORDINATES: Record<string, [number, number]> = {
  "500001": [78.4722552, 17.3988564],
  "500004": [78.4620369, 17.4036318],
  "500007": [78.5308281, 17.417663],
  "500070": [78.5733135, 17.3330243],
  "506001": [79.561234, 18.0034235],
  "506002": [79.6025426, 17.9772682],
  "508001": [79.268293, 17.0582113],
  "508213": [79.625106, 17.1426695],
  "509209": [78.3756056, 16.4808],
};

async function locateDealer({
  address,
  area,
  pincode,
  state,
}: Pick<Dealer, "address" | "area" | "pincode" | "state">) {
  if (!address?.trim()) {
    await loadMissingPincodeBoundaries([pincode], () => {});
    const feature = cachedPincodeBoundaries().features.find((candidate) =>
      String(candidate.properties.pin_code ?? "") === pincode &&
      normalizeIndianState(String(candidate.properties.state ?? "")) === state);
    const coordinates = feature && pointInsidePinFeature(feature);
    if (!coordinates) return null;
    return { coordinates, precision: "pincode" as const };
  }
  return geocodeDealerLocation({
    address,
    area,
    pincode,
    state,
    pincodeFallback: PIN_COORDINATES[pincode],
  });
}

async function locateDealerForForm({
  address,
  area,
  pincode,
  state,
  selectedPlace,
  confirmedPlace,
  allowApproximate,
}: Pick<Dealer, "address" | "area" | "pincode" | "state"> & {
  selectedPlace: GooglePlaceSelection | null;
  confirmedPlace: boolean;
  allowApproximate: boolean;
}): Promise<{ location: GeocodedLocation | null; error: string | null }> {
  if (!address?.trim() || !selectedPlace) {
    if (address?.trim() && !allowApproximate) {
      return { location: null, error: "Choose a Google address suggestion and confirm its pin, or explicitly save this address with an approximate PIN-code pin." };
    }
    return { location: await locateDealer({ address: undefined, area, pincode, state }), error: null };
  }
  if (!confirmedPlace) {
    return { location: null, error: "Open the selected pin in Google Maps and confirm its location before saving." };
  }
  try {
    await loadMissingPincodeBoundaries([pincode], () => {});
  } catch {
    // The selected place must still pass Google postal/state checks below.
  }
  const boundary = cachedPincodeBoundaries().features.find((candidate) =>
    String(candidate.properties.pin_code ?? "") === pincode &&
    normalizeIndianState(String(candidate.properties.state ?? "")) === state) ?? null;
  const error = validateSelectedDealerPlace(selectedPlace, pincode, state, boundary);
  if (error) return { location: null, error };
  return {
    location: {
      coordinates: [selectedPlace.longitude, selectedPlace.latitude],
      precision: "address",
      resolvedAddress: selectedPlace.address,
    },
    error: null,
  };
}

function DealerPlaceConfirmation({
  address,
  selectedPlace,
  confirmedPlace,
  onConfirmedPlaceChange,
  allowApproximate,
  onAllowApproximateChange,
}: {
  address: string;
  selectedPlace: GooglePlaceSelection | null;
  confirmedPlace: boolean;
  onConfirmedPlaceChange: (value: boolean) => void;
  allowApproximate: boolean;
  onAllowApproximateChange: (value: boolean) => void;
}) {
  if (!address.trim()) return null;
  if (!selectedPlace) return <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
    <input type="checkbox" checked={allowApproximate} onChange={(event) => onAllowApproximateChange(event.target.checked)} className="mt-1 accent-[#b65a38]" />
    Save this address as text only; show an approximate PIN-code pin until its exact place is confirmed.
  </label>;
  const mapsUrl = new URL("https://www.google.com/maps/search/");
  mapsUrl.searchParams.set("api", "1");
  mapsUrl.searchParams.set("query", `${selectedPlace.latitude},${selectedPlace.longitude}`);
  mapsUrl.searchParams.set("query_place_id", selectedPlace.placeId);
  return <div className="rounded-lg border border-[#d6cfc4] bg-[#faf7f2] p-3 text-xs leading-5">
    <p className="font-semibold">Google place selected: {selectedPlace.address}</p>
    <p className="text-[#6f6a65]">{selectedPlace.postalCode ?? "PIN not supplied"} · {selectedPlace.state ?? "State not supplied"}</p>
    <a href={mapsUrl.toString()} target="_blank" rel="noreferrer" className="mt-1 inline-flex min-h-9 items-center font-semibold text-[#8c432b] underline underline-offset-2">Review selected pin in Google Maps <ArrowUpRight className="ml-1 h-3.5 w-3.5" /></a>
    <label className="mt-2 flex items-start gap-2 border-t border-[#e9e2d8] pt-2">
      <input type="checkbox" checked={confirmedPlace} onChange={(event) => onConfirmedPlaceChange(event.target.checked)} className="mt-1 accent-[#b65a38]" />
      I checked that this point represents the dealer’s visit location.
    </label>
  </div>;
}

function makeCoverageData(
  boundaries: PincodeBoundaryData | null,
  dealers: DealerSummary[],
): MapData {
  const dealersByPincode = new Map<string, DealerSummary[]>();
  for (const dealer of dealers) {
    const group = dealersByPincode.get(dealer.pincode);
    if (group) group.push(dealer);
    else dealersByPincode.set(dealer.pincode, [dealer]);
  }

  return {
    type: "FeatureCollection",
    features: (boundaries?.features ?? []).flatMap((boundary) => {
      const pincode = String(boundary.properties.pin_code ?? "");
      const assignedDealers = dealersByPincode.get(pincode) ?? [];
      if (!assignedDealers.length) return [];
      const salespeople = [
        ...new Set(assignedDealers.map((dealer) => dealer.salesperson)),
      ];
      const conflict = salespeople.length > 1;
      const salesperson = conflict ? "Shared PIN" : salespeople[0];
      const color = conflict ? "#7d8582" : getSalespersonColor(salesperson);
      return [
        {
          ...boundary,
          properties: {
            ...boundary.properties,
            pincode,
            salesperson,
            color,
            outlineColor: conflict ? "#b45309" : color,
            conflict,
            dealerCount: assignedDealers.length,
            areas: [...new Set(assignedDealers.map((dealer) => dealer.area))].join(
              " · ",
            ),
          },
        },
      ];
    }),
  };
}

function mergeBoundaries(current: PincodeBoundaryData, incoming: PincodeBoundaryData): PincodeBoundaryData {
  if (!incoming.features.length) return current;
  const seen = new Set(current.features.map((feature) => `${feature.properties.pin_code}:${JSON.stringify(feature.geometry)}`));
  const additional = incoming.features.filter((feature) => {
    const key = `${feature.properties.pin_code}:${JSON.stringify(feature.geometry)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return additional.length ? { type: "FeatureCollection", features: [...current.features, ...additional] } : current;
}

function makeDealerData(dealers: DealerSummary[]): MapData {
  return {
    type: "FeatureCollection",
    features: dealers.map((dealer) => ({
      type: "Feature",
      properties: {
        id: dealer.id,
        salesperson: dealer.salesperson,
        dealer: dealer.dealer,
        pincode: dealer.pincode,
        area: dealer.area,
        address: dealer.address ?? "",
        locationPrecision: dealer.locationPrecision ?? (dealer.address ? "address" : "pincode"),
        color: getSalespersonColor(dealer.salesperson),
        review: Boolean(dealer.reviewNote),
      },
      geometry: {
        type: "Point",
        coordinates: [dealer.longitude, dealer.latitude],
      },
    })),
  };
}

function getCoverageBounds(
  coverage: MapData,
): [[number, number], [number, number]] | null {
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;

  const visit = (value: unknown) => {
    if (
      Array.isArray(value) &&
      value.length >= 2 &&
      typeof value[0] === "number" &&
      typeof value[1] === "number"
    ) {
      west = Math.min(west, value[0]);
      south = Math.min(south, value[1]);
      east = Math.max(east, value[0]);
      north = Math.max(north, value[1]);
      return;
    }
    if (Array.isArray(value)) value.forEach(visit);
  };

  coverage.features.forEach((feature) => visit(feature.geometry.coordinates));
  if (![west, south, east, north].every(Number.isFinite)) return null;
  return [
    [west, south],
    [east, north],
  ];
}

function getDealerBounds(dealers: DealerSummary[]): [[number, number], [number, number]] | null {
  if (!dealers.length) return null;
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const dealer of dealers) {
    if (!Number.isFinite(dealer.longitude) || !Number.isFinite(dealer.latitude)) continue;
    west = Math.min(west, dealer.longitude);
    south = Math.min(south, dealer.latitude);
    east = Math.max(east, dealer.longitude);
    north = Math.max(north, dealer.latitude);
  }
  return [west, south, east, north].every(Number.isFinite) ? [[west, south], [east, north]] : null;
}

function MapLibreTerritoryMap({
  dealers,
  selectedId,
  onSelect,
  focusRequest,
  boundaries,
  stateBoundaries,
  active,
}: {
  dealers: DealerSummary[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  focusRequest: DealerSummary | null;
  boundaries: PincodeBoundaryData;
  stateBoundaries: StateBoundaryData;
  active: boolean;
}) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onSelectRef = useRef(onSelect);
  const dealersRef = useRef(dealers);
  const fittedInitialCoverageRef = useRef(false);
  // A revision ensures rebuilt maps refresh their layers after Fast Refresh.
  const [ready, setReady] = useState(0);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    dealersRef.current = dealers;
  }, [dealers]);

  useEffect(() => {
    let active = true;
    let map: MapLibreMap | null = null;

    void import("maplibre-gl").then((module) => {
      if (!active || !mapContainer.current) return;
      const maplibregl = module;
      maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
      map = new maplibregl.Map({
        container: mapContainer.current,
        center: [80.45, 16.35],
        zoom: 5.65,
        minZoom: 5,
        maxZoom: 15,
        attributionControl: false,
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: "© OpenStreetMap contributors",
            },
          },
          layers: [{ id: "osm", type: "raster", source: "osm" }],
        },
      });
      mapRef.current = map;
      map.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        "top-right",
      );
      map.addControl(
        new maplibregl.AttributionControl({ compact: true }),
        "bottom-right",
      );

      map.on("load", () => {
        map?.addSource("states", {
          type: "geojson",
          data: EMPTY_STATE_BOUNDARIES,
        });
        map?.addLayer({
          id: "states-fill",
          type: "fill",
          source: "states",
          paint: { "fill-color": "#a9b0ad", "fill-opacity": 0.28 },
        });
        map?.addLayer({
          id: "states-border",
          type: "line",
          source: "states",
          paint: {
            "line-color": "#53605b",
            "line-width": 1.5,
            "line-opacity": 0.8,
          },
        });
        map?.addSource("coverage", {
          type: "geojson",
          data: makeCoverageData(null, []) as never,
        });
        map?.addLayer({
          id: "coverage-fill",
          type: "fill",
          source: "coverage",
          paint: {
            "fill-color": ["get", "color"],
            "fill-opacity": 0.5,
          },
        });
        map?.addLayer({
          id: "coverage-outline",
          type: "line",
          source: "coverage",
          paint: {
            "line-color": ["get", "outlineColor"],
            "line-width": 2,
            "line-opacity": 0.95,
          },
        });
        map?.on("click", "coverage-fill", (event) => {
          const pincode = String(event.features?.[0]?.properties?.pincode ?? "");
          const dealer = dealersRef.current.find(
            (candidate) => candidate.pincode === pincode,
          );
          if (dealer) onSelectRef.current(dealer.id);
        });
        map?.on("mouseenter", "coverage-fill", () => {
          if (map) map.getCanvas().style.cursor = "pointer";
        });
        map?.on("mouseleave", "coverage-fill", () => {
          if (map) map.getCanvas().style.cursor = "";
        });
        map?.addSource("dealers", {
          type: "geojson",
          data: makeDealerData([]) as never,
        });
        map?.addLayer({
          id: "dealer-points",
          type: "circle",
          source: "dealers",
          paint: {
            "circle-radius": [
              "case",
              ["==", ["get", "id"], -1],
              10,
              7,
            ],
            "circle-color": ["get", "color"],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2.5,
            "circle-opacity": 1,
          },
        });
        map?.on("click", "dealer-points", (event) => {
          const id = Number(event.features?.[0]?.properties?.id);
          if (id) onSelectRef.current(id);
        });
        map?.on("mouseenter", "dealer-points", () => {
          if (map) map.getCanvas().style.cursor = "pointer";
        });
        map?.on("mouseleave", "dealer-points", () => {
          if (map) map.getCanvas().style.cursor = "";
        });
        setReady((revision) => revision + 1);
      });
    });

    return () => {
      active = false;
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!active || !ready || !mapRef.current) return;
    (mapRef.current.getSource("states") as GeoJSONSource)?.setData(stateBoundaries);
  }, [active, ready, stateBoundaries]);

  useEffect(() => {
    if (!active || !ready || !mapRef.current) return;
    (mapRef.current.getSource("coverage") as GeoJSONSource)?.setData(
      makeCoverageData(boundaries, dealers) as never,
    );
  }, [active, boundaries, dealers, ready]);

  useEffect(() => {
    if (!active || !ready || !mapRef.current) return;
    (mapRef.current.getSource("dealers") as GeoJSONSource)?.setData(
      makeDealerData(dealers) as never,
    );
  }, [active, dealers, ready]);

  useEffect(() => {
    if (
      !active || !ready ||
      !mapRef.current ||
      (!boundaries.features.length && !dealers.length) ||
      fittedInitialCoverageRef.current
    ) {
      return;
    }
    const bounds = getDealerBounds(dealers) ?? getCoverageBounds(makeCoverageData(boundaries, dealers));
    if (!bounds) return;
    fittedInitialCoverageRef.current = true;
    mapRef.current.fitBounds(bounds, {
      padding: { top: 56, right: 48, bottom: 56, left: 48 },
      maxZoom: 8.25,
      duration: 0,
    });
  }, [active, boundaries, dealers, ready]);

  useEffect(() => {
    if (!active || !ready || !mapRef.current) return;
    mapRef.current.setPaintProperty("dealer-points", "circle-radius", [
      "case",
      ["==", ["get", "id"], selectedId ?? -1],
      10,
      7,
    ]);
  }, [active, ready, selectedId]);

  useEffect(() => {
    if (!active || !focusRequest || !mapRef.current) return;
    mapRef.current.flyTo({
      center: [focusRequest.longitude, focusRequest.latitude],
      zoom: 10.5,
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : 850,
    });
  }, [active, focusRequest]);

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-[#ede7de] lg:min-h-[480px]">
      <div
        ref={mapContainer}
        className="absolute inset-0"
        style={{ position: "absolute", inset: 0 }}
        aria-label="Dealer territory map"
      />
      <CoverageInfo />
    </div>
  );
}

function GoogleTerritoryMap({
  dealers,
  selectedId,
  onSelect,
  focusRequest,
  apiKey,
  onProviderError,
  boundaries,
  stateBoundaries,
  active,
}: {
  dealers: DealerSummary[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  focusRequest: DealerSummary | null;
  apiKey: string;
  onProviderError: () => void;
  boundaries: PincodeBoundaryData;
  stateBoundaries: StateBoundaryData;
  active: boolean;
}) {
  const mapId = resolveGoogleMapsMapId(
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID,
    process.env.NODE_ENV,
  );
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef(
    new Map<number, google.maps.Marker | google.maps.marker.AdvancedMarkerElement>(),
  );
  const markerDotsRef = useRef(new Map<number, HTMLElement>());
  const markerSignaturesRef = useRef(new Map<number, string>());
  const selectedMarkerRef = useRef<number | null>(null);
  const markerLibraryRef = useRef<google.maps.MarkerLibrary | null>(null);
  const onSelectRef = useRef(onSelect);
  const dealersRef = useRef(dealers);
  const fittedInitialCoverageRef = useRef(false);
  // A boolean remains true across Fast Refresh and can strand detached markers.
  const [ready, setReady] = useState(0);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    dealersRef.current = dealers;
  }, [dealers]);

  useEffect(() => {
    let active = true;
    const markers = markersRef.current;
    const markerDots = markerDotsRef.current;
    const markerSignatures = markerSignaturesRef.current;
    void Promise.all([
      importGoogleMapsLibrary(apiKey, "maps"),
      mapId ? importGoogleMapsLibrary(apiKey, "marker") : Promise.resolve(null),
    ])
      .then(([{ Map }, markerLibrary]) => {
        if (!active || !mapContainer.current) return;
        markerLibraryRef.current = markerLibrary;
        const map = new Map(mapContainer.current, {
          center: { lat: 16.35, lng: 80.45 },
          zoom: 6,
          minZoom: 5,
          maxZoom: 16,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          gestureHandling: "greedy",
          ...(mapId ? { mapId } : {}),
        });
        map.data.addListener("click", (event: google.maps.Data.MouseEvent) => {
          const pincode = String(event.feature.getProperty("pincode") ?? "");
          const dealer = dealersRef.current.find(
            (candidate) => candidate.pincode === pincode,
          );
          if (dealer) onSelectRef.current(dealer.id);
        });
        mapRef.current = map;
        setReady((revision) => revision + 1);
      })
      .catch(() => {
        if (!active) return;
        toast.error("Google Maps could not load. Using the OpenStreetMap fallback.");
        onProviderError();
      });

    return () => {
      active = false;
      markers.forEach((marker) => {
        if (marker instanceof google.maps.Marker) marker.setMap(null);
        else marker.map = null;
      });
      markers.clear();
      markerDots.clear();
      markerSignatures.clear();
      markerLibraryRef.current = null;
      if (mapRef.current) google.maps.event.clearInstanceListeners(mapRef.current);
      mapRef.current = null;
    };
  }, [apiKey, mapId, onProviderError]);

  useEffect(() => {
    const map = mapRef.current;
    if (!active || !ready || !map) return;

    const desired = [
      ...stateBoundaries.features.map((feature) => ({ id: stateBoundaryFeatureId(feature), feature, layerKind: "state" })),
      ...makeCoverageData(boundaries, dealers).features.map((feature, index) => ({ id: `coverage-${feature.properties.pincode}-${index}`, feature, layerKind: "coverage" })),
    ];
    const desiredIds = new Set(desired.map((entry) => entry.id));
    map.data.forEach((feature) => { if (!desiredIds.has(String(feature.getId()))) map.data.remove(feature); });
    for (const entry of desired) {
      const existing = map.data.getFeatureById(entry.id);
      if (existing) {
        for (const [key, value] of Object.entries(entry.feature.properties)) {
          if (existing.getProperty(key) !== value) existing.setProperty(key, value);
        }
      } else {
        map.data.addGeoJson({ ...entry.feature, id: entry.id, properties: { ...entry.feature.properties, layerKind: entry.layerKind } } as never);
      }
    }
    map.data.setStyle((feature) => {
      if (feature.getProperty("layerKind") === "state") {
        return {
          fillColor: "#a9b0ad",
          fillOpacity: 0.22,
          strokeColor: "#53605b",
          strokeOpacity: 0.75,
          strokeWeight: 1.5,
          zIndex: 0,
          clickable: false,
        };
      }
      return {
        fillColor: String(feature.getProperty("color") ?? "#a9b0ad"),
        zIndex: 1,
        fillOpacity: 0.46,
        strokeColor: String(feature.getProperty("outlineColor") ?? "#53605b"),
        strokeOpacity: 0.95,
        strokeWeight: 2,
        clickable: true,
      };
    });

    if ((boundaries.features.length || dealers.length) && !fittedInitialCoverageRef.current) {
      const coverageBounds = getDealerBounds(dealers) ?? getCoverageBounds(makeCoverageData(boundaries, dealers));
      if (coverageBounds) {
        const bounds = new google.maps.LatLngBounds(
          { lat: coverageBounds[0][1], lng: coverageBounds[0][0] },
          { lat: coverageBounds[1][1], lng: coverageBounds[1][0] },
        );
        map.fitBounds(bounds, 48);
        fittedInitialCoverageRef.current = true;
      }
    }
  }, [active, boundaries, dealers, ready, stateBoundaries]);

  useEffect(() => {
    const map = mapRef.current;
    if (!active || !ready || !map) return;
    const markers = markersRef.current;
    const markerDots = markerDotsRef.current;
    const signatures = markerSignaturesRef.current;
    const desired = new Map(dealers.map((dealer) => [dealer.id, dealer]));
    const removeMarker = (marker: google.maps.Marker | google.maps.marker.AdvancedMarkerElement) => {
      if (marker instanceof google.maps.Marker) marker.setMap(null);
      else marker.map = null;
    };
    for (const [id, marker] of markers) {
      const dealer = desired.get(id);
      const signature = dealer ? `${dealer.latitude}:${dealer.longitude}:${dealer.salesperson}:${dealer.dealer}:${dealer.area}:${dealer.pincode}` : null;
      if (signature === signatures.get(id)) continue;
      removeMarker(marker);
      markers.delete(id);
      markerDots.delete(id);
      signatures.delete(id);
    }

    for (const dealer of desired.values()) {
      if (markers.has(dealer.id)) continue;
      const markerLibrary = markerLibraryRef.current;
      if (markerLibrary && mapId) {
        const markerDot = document.createElement("span");
        markerDot.style.cssText = [
          "width:14px",
          "height:14px",
          `background:${getSalespersonColor(dealer.salesperson)}`,
          "border:3px solid #ffffff",
          "border-radius:9999px",
          "display:block",
          "box-shadow:0 2px 6px rgb(37 42 48 / 28%)",
        ].join(";");
        const marker = new markerLibrary.AdvancedMarkerElement({
          map,
          position: { lat: dealer.latitude, lng: dealer.longitude },
          title: `${dealer.dealer} · ${dealer.area} · ${dealer.pincode}`,
          zIndex: 10,
          gmpClickable: true,
        });
        marker.append(markerDot);
        marker.addEventListener("gmp-click", () => onSelectRef.current(dealer.id));
        markers.set(dealer.id, marker);
        markerDots.set(dealer.id, markerDot);
        signatures.set(dealer.id, `${dealer.latitude}:${dealer.longitude}:${dealer.salesperson}:${dealer.dealer}:${dealer.area}:${dealer.pincode}`);
        continue;
      }
      const marker = new google.maps.Marker({
        map,
        position: { lat: dealer.latitude, lng: dealer.longitude },
        title: `${dealer.dealer} · ${dealer.area} · ${dealer.pincode}`,
        zIndex: 10,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: getSalespersonColor(dealer.salesperson),
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeOpacity: 1,
          strokeWeight: 2.5,
          scale: 7,
        },
      });
      marker.addListener("click", () => onSelectRef.current(dealer.id));
      markers.set(dealer.id, marker);
      signatures.set(dealer.id, `${dealer.latitude}:${dealer.longitude}:${dealer.salesperson}:${dealer.dealer}:${dealer.area}:${dealer.pincode}`);
    }
  }, [active, dealers, mapId, ready]);

  useEffect(() => {
    const resizeMarker = (dealerId: number | null, selected: boolean) => {
      if (dealerId === null) return;
      const marker = markersRef.current.get(dealerId);
      if (!marker) return;
      const size = selected ? 20 : 14;
      const markerDot = markerDotsRef.current.get(dealerId);
      if (markerDot) {
        markerDot.style.width = `${size}px`;
        markerDot.style.height = `${size}px`;
        if (!(marker instanceof google.maps.Marker)) {
          marker.zIndex = selected ? 20 : 10;
        }
        return;
      }
      if (marker instanceof google.maps.Marker) {
        const icon = marker.getIcon();
        if (icon && typeof icon === "object" && "path" in icon) {
          marker.setIcon({ ...icon, scale: selected ? 10 : 7 });
        }
        marker.setZIndex(selected ? 20 : 10);
      }
    };

    resizeMarker(selectedMarkerRef.current, false);
    resizeMarker(selectedId, true);
    selectedMarkerRef.current = selectedId;
  }, [active, dealers, ready, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!active || !focusRequest || !map) return;
    map.panTo({ lat: focusRequest.latitude, lng: focusRequest.longitude });
    map.setZoom(11);
  }, [active, focusRequest]);

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-[#ede7de] lg:min-h-[480px]">
      <div
        ref={mapContainer}
        className="absolute inset-0"
        aria-label="Dealer territory map powered by Google Maps"
      />
      <CoverageInfo />
    </div>
  );
}

function CoverageInfo() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="absolute left-3 top-16 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/75 bg-white/94 px-3 text-xs font-semibold text-[#5f5b57] shadow-[0_8px_24px_rgba(37,42,68,0.13)] backdrop-blur transition-[transform,background-color] active:scale-[0.97] hover:bg-white sm:bottom-5 sm:left-5 sm:top-auto"
          aria-label="Show coverage information"
        >
          <Info className="h-3.5 w-3.5" />
          Coverage info
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-[min(320px,calc(100vw-24px))] rounded-xl border-white/70 bg-white/96 p-4 text-[#252a30] shadow-[0_16px_42px_rgba(37,42,68,0.2)] backdrop-blur"
      >
        <p className="text-sm font-semibold">PIN-code coverage</p>
        <p className="mt-1.5 text-xs leading-5 text-[#6f6a65]">
          Colored polygons contain dealers assigned to one salesperson. A slate
          polygon with an amber border is a shared PIN containing dealers assigned
          to multiple salespeople.
        </p>
        <p className="mt-2 text-xs leading-5 text-[#6f6a65]">
          State highlights appear with more than 50 visible dealers, or when you
          select a state with matching dealers. They are neutral geographic context,
          not salesperson ownership or coverage across an entire state. Dealer
          pins and colored PIN areas remain visible below this threshold.
        </p>
        <div className="mt-3 flex items-center gap-2 border-t border-[#e9e2d8] pt-3 text-xs text-[#5f5b57]">
          <span className="h-3 w-3 shrink-0 rounded-sm border border-[#b45309] bg-[#7d8582]" />
          Shared PIN · multiple salespeople
        </div>
        <p className="mt-2 text-[11px] leading-4 text-[#6f6a65]">
          Boundary source: Department of Posts via OGD India / Esri India
        </p>
        <p className="mt-2 text-[11px] leading-4 text-[#6f6a65]">
          State outlines: <a className="underline underline-offset-2" href="https://www.geoboundaries.org/" target="_blank" rel="noreferrer">geoBoundaries</a>,
          {" "}<a className="underline underline-offset-2" href="https://github.com/datameet/maps" target="_blank" rel="noreferrer">DataMeet / Election Commission of India</a>
          {" "}(<a className="underline underline-offset-2" href="https://creativecommons.org/licenses/by/2.5/in/" target="_blank" rel="noreferrer">CC BY 2.5 IN</a>).
        </p>
      </PopoverContent>
    </Popover>
  );
}

function TerritoryMap(props: {
  dealers: DealerSummary[];
  selectedState: StateFilter;
  selectedId: number | null;
  onSelect: (id: number) => void;
  focusRequest: DealerSummary | null;
  active: boolean;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [providerFailed, setProviderFailed] = useState(false);
  const handleProviderError = useMemo(() => () => setProviderFailed(true), []);
  const [boundaries, setBoundaries] = useState(cachedPincodeBoundaries);
  const [pinResult, setPinResult] = useState({ key: "", unavailablePins: 0 });
  const [retryingBoundaries, setRetryingBoundaries] = useState(false);
  const [retryBoundaries, setRetryBoundaries] = useState(0);
  const pinKey = useMemo(() => [...new Set(props.dealers.map((dealer) => dealer.pincode))].sort().join(","), [props.dealers]);
  const unavailablePins = pinResult.key === pinKey ? pinResult.unavailablePins : 0;
  const boundaryError = unavailablePins > 0;
  const stateKey = useMemo(() => highlightedStateBoundaryCodes(props.dealers, props.selectedState).join(","), [props.dealers, props.selectedState]);
  const [stateResult, setStateResult] = useState({ key: "", data: EMPTY_STATE_BOUNDARIES, failedCodes: [] as string[] });
  // Remove out-of-scope highlights immediately, even while new geometry is loading.
  const stateBoundaries = useMemo(() => selectStateBoundaries(stateResult.data, stateKey ? stateKey.split(",") : []), [stateResult.data, stateKey]);
  const stateBoundaryError = stateResult.key === stateKey && stateResult.failedCodes.length > 0;

  useEffect(() => {
    if (!props.active) return;
    let current = true;
    void loadStateBoundaries(stateKey ? stateKey.split(",") : []).then((result) => {
      if (current) setStateResult({ key: stateKey, ...result });
    });
    return () => { current = false; };
  }, [props.active, stateKey, retryBoundaries]);

  useEffect(() => {
    if (!props.active) return;
    const controller = new AbortController();
    let current = true;
    async function load() {
      try {
        const initial = await loadInitialPincodeBoundaries();
        if (!current) return;
        setBoundaries((current) => mergeBoundaries(current, initial));
        const result = await loadMissingPincodeBoundaries(
          pinKey ? pinKey.split(",") : [],
          (updated) => { if (current) setBoundaries((previous) => mergeBoundaries(previous, updated)); },
          controller.signal,
        );
        if (current) {
          setPinResult({ key: pinKey, unavailablePins: result.unavailablePins });
          setRetryingBoundaries(false);
        }
      } catch {
        if (current) {
          const cachedPins = new Set(cachedPincodeBoundaries().features.map((feature) => String(feature.properties.pin_code)));
          setPinResult({ key: pinKey, unavailablePins: (pinKey ? pinKey.split(",") : []).filter((pin) => !cachedPins.has(pin)).length });
          setRetryingBoundaries(false);
        }
      }
    }
    void load();
    return () => {
      current = false;
      controller.abort();
    };
  }, [pinKey, props.active, retryBoundaries]);

  const boundaryNotice = boundaryError || stateBoundaryError ? (
    <button
      type="button"
      className="absolute bottom-4 left-4 z-10 min-h-11 max-w-[calc(100%-32px)] rounded-lg bg-white px-3 py-2 text-left text-xs font-semibold text-amber-800 shadow-sm disabled:cursor-wait sm:bottom-20"
      disabled={retryingBoundaries}
      aria-live="polite"
      aria-label={boundaryError ? `Retry unavailable PIN boundaries (${unavailablePins})` : "Retry unavailable state outlines"}
      onClick={() => {
        setRetryingBoundaries(true);
        setRetryBoundaries((value) => value + 1);
      }}
    >
      {boundaryError ? `${unavailablePins} PIN ${unavailablePins === 1 ? "area" : "areas"} unavailable. Dealer pins remain visible.` : "Some state outlines are unavailable."}
      {boundaryError && stateBoundaryError ? " Some state outlines are also unavailable." : ""}
      {retryingBoundaries ? " Retrying…" : " Retry"}
    </button>
  ) : null;

  if (apiKey && !providerFailed) {
    return (
      <div className="relative h-full">
        <GoogleTerritoryMap {...props} boundaries={boundaries} stateBoundaries={stateBoundaries} apiKey={apiKey} onProviderError={handleProviderError} />
        {boundaryNotice}
      </div>
    );
  }
  return <div className="relative h-full"><MapLibreTerritoryMap {...props} boundaries={boundaries} stateBoundaries={stateBoundaries} />{boundaryNotice}</div>;
}

function AddDealerDialog({
  salespeople,
  onAdd,
}: {
  salespeople: string[];
  onAdd: (dealer: Omit<Dealer, "id">) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [salesperson, setSalesperson] = useState(salespeople[0] ?? "KIRAN");
  const [dealer, setDealer] = useState("");
  const [pincode, setPincode] = useState("");
  const [area, setArea] = useState("");
  const [address, setAddress] = useState("");
  const [selectedPlace, setSelectedPlace] = useState<GooglePlaceSelection | null>(null);
  const [confirmedPlace, setConfirmedPlace] = useState(false);
  const [allowApproximate, setAllowApproximate] = useState(false);
  const [state, setState] = useState<Dealer["state"]>("Telangana");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!dealer.trim() || !area.trim() || !/^\d{6}$/.test(pincode)) {
      toast.error("Enter a dealer, area and valid 6-digit PIN code.");
      return;
    }
    setSaving(true);
    const [located, validation] = await Promise.all([
      locateDealerForForm({ address, area, pincode, state, selectedPlace, confirmedPlace, allowApproximate }),
      validatePostalDetailsFromApp(pincode, state, area),
    ]);
    if (validation.status === "invalid") {
      setSaving(false);
      toast.error(validation.message);
      return;
    }
    if (!located.location) {
      setSaving(false);
      toast.error(located.error ?? "That PIN code could not be located. Check it and try again.");
      return;
    }
    const location = located.location;
    const added = await onAdd({
      salesperson,
      dealer: dealer.trim().toUpperCase(),
      pincode,
      area: canonicalizeAreaName(area),
      sourceArea: area.trim(),
      address: address.trim() || undefined,
      state,
      longitude: location.coordinates[0],
      latitude: location.coordinates[1],
      locationPrecision: location.precision,
      geocodedAddress: location.resolvedAddress,
      googlePlaceId: location.precision === "address" ? selectedPlace?.placeId : undefined,
      ...postalValidationFields(validation),
    });
    setSaving(false);
    if (!added) return;
    setDealer("");
    setPincode("");
    setArea("");
    setAddress("");
    setSelectedPlace(null);
    setConfirmedPlace(false);
    setAllowApproximate(false);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          aria-label="Add dealer"
          className="h-10 w-10 rounded-xl bg-[#b65a38] p-0 text-white transition-[transform,background-color] active:scale-[0.97] hover:bg-[#a64b2f] sm:h-9 sm:w-auto sm:rounded-lg sm:px-3"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Add dealer</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-24px)] overflow-y-auto rounded-2xl border-[#ded7cc] bg-white text-[#252a30] shadow-[0_24px_70px_rgba(37,42,48,0.24)] sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-xl tracking-[-0.02em] text-[#252a30]">
            Add a dealer
          </DialogTitle>
          <DialogDescription className="leading-6 text-[#6f6a65]">
            Add a full street address for an address-level map pin. Without one,
            the pin remains an approximate PIN-code location.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="dealer-name" className="text-[#34333a]">
                Dealer name
              </Label>
              <Input
                id="dealer-name"
                value={dealer}
                onChange={(event) => setDealer(event.target.value)}
                placeholder="Sri Lakshmi Textiles"
                autoFocus
                className="h-10 border-[#d6cfc4] bg-[#fffcf7] text-[#252a30] placeholder:text-[#6f6a65]"
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-[#34333a]">Salesperson</Label>
              <Select value={salesperson} onValueChange={setSalesperson}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {salespeople.map((person) => (
                    <SelectItem key={person} value={person}>
                      {person}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label className="text-[#34333a]">State</Label>
              <Select
                value={state}
                onValueChange={(value) => setState(value as Dealer["state"])}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INDIAN_STATES.map((item) => (
                    <SelectItem key={item} value={item}>{item}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dealer-pin" className="text-[#34333a]">
                PIN code
              </Label>
              <Input
                id="dealer-pin"
                value={pincode}
                onChange={(event) =>
                  setPincode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                inputMode="numeric"
                placeholder="500001"
                className="h-10 border-[#d6cfc4] bg-[#fffcf7] text-[#252a30] placeholder:text-[#6f6a65]"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dealer-area" className="text-[#34333a]">
                Area
              </Label>
              <Input
                id="dealer-area"
                value={area}
                onChange={(event) => setArea(event.target.value)}
                placeholder="Nampally"
                className="h-10 border-[#d6cfc4] bg-[#fffcf7] text-[#252a30] placeholder:text-[#6f6a65]"
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="dealer-address" className="text-[#34333a]">
                Full address <span className="font-normal text-[#6f6a65]">(optional)</span>
              </Label>
              <GooglePlaceAutocomplete
                id="dealer-address"
                value={address}
                onChange={(value) => { setAddress(value); setSelectedPlace(null); setConfirmedPlace(false); }}
                onPlaceSelect={(place) => { setSelectedPlace(place); setAllowApproximate(false); }}
                placeholder="Search building, street or landmark"
              />
              <p className="text-xs leading-5 text-[#6f6a65]">
                Select a Google suggestion to place the pin. A typed address alone is saved with an approximate PIN pin only if you opt in below.
              </p>
              <DealerPlaceConfirmation address={address} selectedPlace={selectedPlace} confirmedPlace={confirmedPlace} onConfirmedPlaceChange={setConfirmedPlace} allowApproximate={allowApproximate} onAllowApproximateChange={setAllowApproximate} />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="border-[#d6cfc4] bg-white text-[#34333a] transition-[transform,background-color] active:scale-[0.98]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-[#b65a38] text-white transition-[transform,background-color] active:scale-[0.98] hover:bg-[#a64b2f]"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? "Checking details…" : "Add to map"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditDealerDialog({
  dealer,
  salespeople,
  onClose,
  onUpdate,
}: {
  dealer: Dealer;
  salespeople: string[];
  onClose: () => void;
  onUpdate: (dealer: Dealer) => Promise<boolean>;
}) {
  const [salesperson, setSalesperson] = useState(dealer.salesperson);
  const [dealerName, setDealerName] = useState(dealer.dealer);
  const [pincode, setPincode] = useState(dealer.pincode);
  const [area, setArea] = useState(dealer.area);
  const [address, setAddress] = useState(dealer.address ?? "");
  const [selectedPlace, setSelectedPlace] = useState<GooglePlaceSelection | null>(null);
  const [confirmedPlace, setConfirmedPlace] = useState(false);
  const [allowApproximate, setAllowApproximate] = useState(false);
  const [state, setState] = useState<Dealer["state"]>(dealer.state);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!dealerName.trim() || !area.trim() || !/^\d{6}$/.test(pincode)) {
      toast.error("Enter a dealer, area and valid 6-digit PIN code.");
      return;
    }

    const pincodeOrStateChanged =
      pincode !== dealer.pincode || state !== dealer.state;
    const areaChanged = canonicalizeAreaName(area) !== dealer.area;
    const addressChanged = address.trim() !== (dealer.address ?? "");
    const locationChanged =
      pincodeOrStateChanged ||
      addressChanged ||
      Boolean(selectedPlace) ||
      (Boolean(address.trim()) && dealer.locationPrecision !== "address");
    const postalFieldsChanged = pincodeOrStateChanged || areaChanged;
    const shouldValidate = postalFieldsChanged || !dealer.validationStatus;
    setSaving(true);
    const [located, validation] = await Promise.all([
      locationChanged
        ? locateDealerForForm({ address, area, pincode, state, selectedPlace, confirmedPlace, allowApproximate })
        : Promise.resolve({ location: {
          coordinates: [dealer.longitude, dealer.latitude] as [number, number],
          precision: dealer.locationPrecision ?? (dealer.address ? "address" : "pincode"),
          resolvedAddress: dealer.geocodedAddress,
        } satisfies GeocodedLocation, error: null }),
      shouldValidate
        ? validatePostalDetailsFromApp(pincode, state, area)
        : Promise.resolve(null),
    ]);
    setSaving(false);
    if (validation?.status === "invalid") {
      toast.error(validation.message);
      return;
    }
    if (!located.location) {
      toast.error(located.error ?? "That PIN code could not be located. Check it and try again.");
      return;
    }
    const location = located.location;

    const updated: Dealer = {
      ...dealer,
      salesperson,
      dealer: dealerName.trim().toUpperCase(),
      pincode,
      area: canonicalizeAreaName(area),
      sourceArea: dealer.sourceArea ?? dealer.area,
      address: address.trim() || undefined,
      state,
      longitude: location.coordinates[0],
      latitude: location.coordinates[1],
      locationPrecision: location.precision,
      geocodedAddress: location.resolvedAddress,
      googlePlaceId: locationChanged
        ? location.precision === "address" ? selectedPlace?.placeId : undefined
        : dealer.googlePlaceId,
      ...(validation ? postalValidationFields(validation) : {}),
    };
    if (await onUpdate(updated)) onClose();
  };

  return (
    <Dialog open onOpenChange={(nextOpen) => !nextOpen && !saving && onClose()}>
      <DialogContent className="max-h-[calc(100svh-24px)] overflow-y-auto rounded-2xl border-[#ded7cc] bg-white text-[#252a30] shadow-[0_24px_70px_rgba(37,42,48,0.24)] sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-xl tracking-[-0.02em] text-[#252a30]">
            Edit dealer
          </DialogTitle>
          <DialogDescription className="leading-6 text-[#6f6a65]">
            PIN, state, and area are checked against the postal directory when
            they change. A full address places the pin at the address result;
            otherwise the pin uses an approximate PIN-code location.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="edit-dealer-name" className="text-[#34333a]">
                Dealer name
              </Label>
              <Input
                id="edit-dealer-name"
                value={dealerName}
                onChange={(event) => setDealerName(event.target.value)}
                autoFocus
                className="h-10 border-[#d6cfc4] bg-[#fffcf7] text-[#252a30]"
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-[#34333a]">Salesperson</Label>
              <Select value={salesperson} onValueChange={setSalesperson}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {salespeople.map((person) => (
                    <SelectItem key={person} value={person}>
                      {person}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label className="text-[#34333a]">State</Label>
              <Select
                value={state}
                onValueChange={(value) => setState(value as Dealer["state"])}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INDIAN_STATES.map((item) => (
                    <SelectItem key={item} value={item}>{item}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-dealer-pin" className="text-[#34333a]">
                PIN code
              </Label>
              <Input
                id="edit-dealer-pin"
                value={pincode}
                onChange={(event) =>
                  setPincode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                inputMode="numeric"
                className="h-10 border-[#d6cfc4] bg-[#fffcf7] text-[#252a30]"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-dealer-area" className="text-[#34333a]">
                Area
              </Label>
              <Input
                id="edit-dealer-area"
                value={area}
                onChange={(event) => setArea(event.target.value)}
                className="h-10 border-[#d6cfc4] bg-[#fffcf7] text-[#252a30]"
              />
              {dealer.sourceArea && dealer.sourceArea !== dealer.area ? (
                <p className="text-xs leading-5 text-[#6f6a65]">
                  Imported as “{dealer.sourceArea}”
                </p>
              ) : null}
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="edit-dealer-address" className="text-[#34333a]">
                Full address <span className="font-normal text-[#6f6a65]">(optional)</span>
              </Label>
              <GooglePlaceAutocomplete
                id="edit-dealer-address"
                value={address}
                onChange={(value) => { setAddress(value); setSelectedPlace(null); setConfirmedPlace(false); }}
                onPlaceSelect={(place) => { setSelectedPlace(place); setAllowApproximate(false); }}
                placeholder="Search building, street or landmark"
              />
              {(address !== (dealer.address ?? "") || selectedPlace) ? <DealerPlaceConfirmation address={address} selectedPlace={selectedPlace} confirmedPlace={confirmedPlace} onConfirmedPlaceChange={setConfirmedPlace} allowApproximate={allowApproximate} onAllowApproximateChange={setAllowApproximate} /> : null}
            </div>
          </div>
          {dealer.reviewNote ? (
            <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-950">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold">Needs review</p>
                  <p className="mt-1 text-xs leading-5 text-amber-900/80">
                    {dealer.reviewNote}
                  </p>
                  {dealer.postalSuggestions?.length ? (
                    <p className="mt-1.5 text-[11px] leading-4 text-amber-900/70">
                      Postal suggestions: {dealer.postalSuggestions.join(", ")}
                    </p>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={saving}
                    onClick={async () => {
                      const verified: Dealer = {
                        ...dealer,
                        reviewNote: undefined,
                        postalSuggestions: undefined,
                        validationStatus: "verified",
                        validationSource: "manual",
                        validationCheckedAt: new Date().toISOString(),
                      };
                      if (await onUpdate(verified)) onClose();
                    }}
                    className="mt-2 border-amber-300 bg-white text-amber-950 transition-[transform,background-color] active:scale-[0.98] hover:bg-amber-100"
                  >
                    Mark current data verified
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={onClose}
              className="border-[#d6cfc4] bg-white text-[#34333a] transition-[transform,background-color] active:scale-[0.98]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-[#b65a38] text-white transition-[transform,background-color] active:scale-[0.98] hover:bg-[#a64b2f]"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type ImportSourceKind = "structured" | "ocr";

const STRUCTURED_IMPORT_LIMIT = 500;
const OCR_IMPORT_LIMIT = 50;
const IMPORT_REVIEW_PAGE_SIZE = 10;

async function rowsFromStructuredFile(file: File) {
  if (file.name.toLowerCase().endsWith(".json")) {
    const parsed: unknown = JSON.parse(await file.text());
    const candidate = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && "dealers" in parsed
        ? (parsed as { dealers: unknown }).dealers
        : parsed && typeof parsed === "object" && "rows" in parsed
          ? (parsed as { rows: unknown }).rows
          : null;
    if (!Array.isArray(candidate)) {
      throw new Error("JSON must contain an array, or a dealers or rows array.");
    }
    return candidate.filter(
      (row): row is Record<string, unknown> =>
        Boolean(row) && typeof row === "object" && !Array.isArray(row),
    );
  }

  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) throw new Error("The workbook does not contain a worksheet.");
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
    defval: "",
  });
}

async function extractVisualText(
  file: File,
  onProgress: (value: number, label: string) => void,
) {
  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const pdfjsPromise = isPdf
    ? import("pdfjs-dist/legacy/build/pdf.mjs")
    : null;
  const tesseract = await import("tesseract.js");
  const worker = await tesseract.createWorker("eng", tesseract.OEM.LSTM_ONLY, {
    logger: (message) => {
      if (message.status === "recognizing text") {
        onProgress(Math.round(message.progress * 100), "Reading text from the file…");
      }
    },
  });

  try {
    if (!isPdf) {
      return (await worker.recognize(file)).data.text;
    }
    const pdfjs = await pdfjsPromise;
    if (!pdfjs) throw new Error("The PDF reader could not be loaded.");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    const pdf = await pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
    }).promise;
    if (pdf.numPages > 5) {
      throw new Error("OCR imports are limited to the first 5 PDF pages.");
    }
    const pageTexts: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      onProgress(
        Math.round(((pageNumber - 1) / pdf.numPages) * 100),
        `Reading PDF page ${pageNumber} of ${pdf.numPages}…`,
      );
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("The PDF page could not be prepared for OCR.");
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      pageTexts.push((await worker.recognize(canvas)).data.text);
    }
    return pageTexts.join("\n");
  } finally {
    await worker.terminate();
  }
}

function ImportRowEditor({
  row,
  index,
  onChange,
  onRemove,
}: {
  row: ImportDraftRow;
  index: number;
  onChange: <Key extends keyof ImportDraftRow>(
    field: Key,
    value: ImportDraftRow[Key],
  ) => void;
  onRemove: () => void;
}) {
  const valid = isImportDraftValid(row);
  return (
    <div
      className={`rounded-xl border p-3 ${
        valid ? "border-[#ded7cc] bg-[#fffcf7]" : "border-[#efc1bc] bg-[#fff9f8]"
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold text-[#6f6a65]">ROW {index + 1}</p>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={`Remove row ${index + 1}`}
          className="h-8 w-8 text-[#6f6a65] transition-[transform,background-color] active:scale-[0.96] hover:bg-[#f3e6e4] hover:text-[#a13c32]"
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="grid gap-1.5">
          <Label htmlFor={`${row.key}-salesperson`} className="text-xs text-[#5f5b57]">
            Salesperson
          </Label>
          <Input
            id={`${row.key}-salesperson`}
            value={row.salesperson}
            onChange={(event) => onChange("salesperson", event.target.value)}
            className="h-9 border-[#d6cfc4] bg-white text-[#252a30]"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${row.key}-dealer`} className="text-xs text-[#5f5b57]">
            Dealer
          </Label>
          <Input
            id={`${row.key}-dealer`}
            value={row.dealer}
            onChange={(event) => onChange("dealer", event.target.value)}
            className="h-9 border-[#d6cfc4] bg-white text-[#252a30]"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${row.key}-pincode`} className="text-xs text-[#5f5b57]">
            PIN code
          </Label>
          <Input
            id={`${row.key}-pincode`}
            inputMode="numeric"
            maxLength={6}
            value={row.pincode}
            onChange={(event) =>
              onChange("pincode", event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            className="h-9 border-[#d6cfc4] bg-white text-[#252a30]"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${row.key}-area`} className="text-xs text-[#5f5b57]">
            Area
          </Label>
          <Input
            id={`${row.key}-area`}
            value={row.area}
            onChange={(event) => onChange("area", event.target.value)}
            className="h-9 border-[#d6cfc4] bg-white text-[#252a30]"
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs text-[#5f5b57]">State</Label>
          <Select
            value={row.state}
            onValueChange={(value) => onChange("state", value as Dealer["state"])}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select state" />
            </SelectTrigger>
            <SelectContent>
              {INDIAN_STATES.map((item) => (
                <SelectItem key={item} value={item}>{item}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="mt-3 grid gap-1.5">
        <Label htmlFor={`${row.key}-address`} className="text-xs text-[#5f5b57]">
          Full address <span className="font-normal text-[#6f6a65]">(optional)</span>
        </Label>
        <Textarea
          id={`${row.key}-address`}
          value={row.address}
          onChange={(event) => onChange("address", event.target.value)}
          placeholder="Shop number, building, street or landmark"
          className="min-h-16 resize-y border-[#d6cfc4] bg-white text-[#252a30]"
        />
      </div>
      {!valid ? (
        <p className="mt-2 text-xs text-[#a13c32]">
          Complete every field and use a valid 6-digit PIN code.
        </p>
      ) : null}
    </div>
  );
}

function ImportSourceCard({
  icon,
  title,
  description,
  warning = false,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  warning?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        warning
          ? "border-[#e5d8ad] bg-[#fffbeb]"
          : "border-[#ded7cc] bg-[#faf5ee]"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ${
            warning ? "text-[#8a6410]" : "text-[#252a44]"
          }`}
        >
          {icon}
        </div>
        <div>
          <p className={`text-sm font-semibold ${warning ? "text-[#493b19]" : "text-[#252a30]"}`}>
            {title}
          </p>
          <p className={`mt-1 text-xs leading-5 ${warning ? "text-[#776437]" : "text-[#6f6a65]"}`}>
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}

function ImportProgress({ value, label }: { value: number; label: string }) {
  return (
    <div className="space-y-2" role="status" aria-live="polite">
      <div className="flex justify-between gap-4 text-xs text-[#6f6a65]">
        <span>{label}</span>
        <span className="tabular-nums">{value}%</span>
      </div>
      <Progress
        value={value}
        className="h-2 bg-[#e9e2d8] [&_[data-slot=progress-indicator]]:bg-[#252a44]"
      />
    </div>
  );
}

function ImportPagination({
  page,
  pageCount,
  rowCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  rowCount: number;
  onPageChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  const firstRow = (page - 1) * IMPORT_REVIEW_PAGE_SIZE + 1;
  const lastRow = Math.min(page * IMPORT_REVIEW_PAGE_SIZE, rowCount);
  return (
    <nav
      aria-label="Import review pages"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#ded7cc] bg-[#fbf7f1] px-3 py-2"
    >
      <p className="text-xs text-[#6f6a65]">
        Rows {firstRow}–{lastRow} of {rowCount}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Previous review page"
          disabled={page === 1}
          className="h-8 w-8 border-[#d6cfc4] bg-white text-[#34333a] transition-transform active:scale-[0.96]"
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-20 text-center text-xs font-semibold tabular-nums text-[#34333a]">
          Page {page} of {pageCount}
        </span>
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Next review page"
          disabled={page === pageCount}
          className="h-8 w-8 border-[#d6cfc4] bg-white text-[#34333a] transition-transform active:scale-[0.96]"
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  );
}

function ImportDealersDialog({
  onImport,
}: {
  onImport: (dealers: Array<Omit<Dealer, "id">>) => Promise<number>;
}) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<"choose" | "review">("choose");
  const [sourceKind, setSourceKind] = useState<ImportSourceKind>("structured");
  const [sourceName, setSourceName] = useState("");
  const [draftRows, setDraftRows] = useState<ImportDraftRow[]>([]);
  const [extractedText, setExtractedText] = useState("");
  const [reviewPage, setReviewPage] = useState(1);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const resetImport = () => {
    setStage("choose");
    setSourceKind("structured");
    setSourceName("");
    setDraftRows([]);
    setExtractedText("");
    setReviewPage(1);
    setProgress(0);
    setProgressLabel("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (importing) return;
    setOpen(nextOpen);
    if (!nextOpen) resetImport();
  };

  const prepareFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setProgress(4);
    setProgressLabel(`Opening ${file.name}…`);
    try {
      const isOcr =
        file.type.startsWith("image/") ||
        file.type === "application/pdf" ||
        /\.(png|jpe?g|webp|pdf)$/i.test(file.name);
      let rows: ImportDraftRow[];
      if (isOcr) {
        const text = await extractVisualText(file, (value, label) => {
          setProgress(value);
          setProgressLabel(label);
        });
        setExtractedText(text);
        rows = parseExtractedText(text);
        setSourceKind("ocr");
        if (rows.length > OCR_IMPORT_LIMIT) {
          rows = rows.slice(0, OCR_IMPORT_LIMIT);
          toast.warning(
            `OCR review is limited to ${OCR_IMPORT_LIMIT} rows. Use Excel, CSV or JSON for larger imports.`,
          );
        }
        if (!rows.length) {
          rows = [makeImportDraft({}, 0)];
          toast.warning("Text was extracted, but the rows need manual correction.");
        }
      } else {
        const rawRows = await rowsFromStructuredFile(file);
        if (!rawRows.length) throw new Error("The selected file contains no rows.");
        if (rawRows.length > STRUCTURED_IMPORT_LIMIT) {
          throw new Error(
            `Structured imports accept up to ${STRUCTURED_IMPORT_LIMIT} rows per file.`,
          );
        }
        rows = rawRows.map(makeImportDraft);
        setSourceKind("structured");
      }
      setSourceName(file.name);
      setDraftRows(rows);
      setReviewPage(1);
      setProgress(100);
      setStage("review");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The file could not be read.");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const updateDraft = <Key extends keyof ImportDraftRow>(
    rowKey: string,
    field: Key,
    value: ImportDraftRow[Key],
  ) => {
    setDraftRows((current) =>
      current.map((row) =>
        row.key === rowKey ? { ...row, [field]: value } : row,
      ),
    );
  };

  const commitImport = async () => {
    if (!draftRows.length || draftRows.some((row) => !isImportDraftValid(row))) {
      toast.error("Complete or remove every highlighted row before importing.");
      return;
    }
    setImporting(true);
    setProgress(0);
    setProgressLabel("Checking PIN locations…");
    try {
      setProgressLabel("Validating postal details…");
      const postalValidations = await Promise.all(
        draftRows.map((row) =>
          validatePostalDetailsFromApp(
            row.pincode,
            row.state as Dealer["state"],
            row.area,
          ),
        ),
      );
      const invalidPostalIndex = postalValidations.findIndex(
        (validation) => validation.status === "invalid",
      );
      if (invalidPostalIndex >= 0) {
        throw new Error(
          `Row ${invalidPostalIndex + 1}: ${postalValidations[invalidPostalIndex].message}`,
        );
      }

      setProgressLabel("Checking map locations…");
      const locationKey = (row: ImportDraftRow) =>
        row.address.trim()
          ? `address|${row.address.trim().toUpperCase()}|${row.area.trim().toUpperCase()}|${row.pincode}|${row.state}`
          : `pincode|${row.pincode}|${row.state}`;
      const locationsByKey = new Map<string, GeocodedLocation>();
      const rowsToLocate = [
        ...new Map(
          draftRows
            .filter((row) => row.address.trim() || !PIN_COORDINATES[row.pincode])
            .map((row) => [locationKey(row), row]),
        ).values(),
      ];
      if (rowsToLocate.length > 10) {
        throw new Error(
          "This prototype can locate up to 10 new addresses or PIN codes per import. Split the file and try again.",
        );
      }
      for (let index = 0; index < rowsToLocate.length; index += 1) {
        const row = rowsToLocate[index];
        setProgressLabel(
          row.address.trim()
            ? `Locating address for ${row.dealer || `row ${index + 1}`}…`
            : `Locating PIN ${row.pincode}…`,
        );
        setProgress(Math.round((index / Math.max(rowsToLocate.length, 1)) * 100));
        const location = await locateDealer({
          address: row.address,
          area: row.area,
          pincode: row.pincode,
          state: row.state as Dealer["state"],
        });
        if (!location) {
          throw new Error(
            row.address.trim()
              ? `The address for ${row.dealer || `row ${index + 1}`} could not be matched inside PIN ${row.pincode}.`
              : `PIN ${row.pincode} could not be located. Check that row.`,
          );
        }
        locationsByKey.set(locationKey(row), location);
        if (index < rowsToLocate.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1100));
        }
      }

      const mapped = draftRows.map((row, index) => {
        const location = row.address.trim()
          ? locationsByKey.get(locationKey(row))
          : locationsByKey.get(locationKey(row)) ??
            (PIN_COORDINATES[row.pincode]
              ? ({
                  coordinates: PIN_COORDINATES[row.pincode],
                  precision: "pincode",
                } satisfies GeocodedLocation)
              : undefined);
        if (!location) throw new Error(`PIN ${row.pincode} could not be located.`);
        return {
          salesperson: row.salesperson.trim().toUpperCase(),
          dealer: row.dealer.trim().toUpperCase(),
          pincode: row.pincode,
          area: canonicalizeAreaName(row.area),
          sourceArea: row.area.trim(),
          address: row.address.trim() || undefined,
          state: row.state as Dealer["state"],
          longitude: location.coordinates[0],
          latitude: location.coordinates[1],
          locationPrecision: location.precision,
          geocodedAddress: location.resolvedAddress,
          ...postalValidationFields(postalValidations[index]),
        };
      });
      const added = await onImport(mapped);
      const reviewCount = postalValidations.filter(
        (validation) => validation.status !== "verified",
      ).length;
      toast.success(
        added
          ? `${added} dealer${added === 1 ? "" : "s"} added${reviewCount ? `; ${reviewCount} need review` : " and verified"}.`
          : "All reviewed rows were already on the map.",
      );
      setOpen(false);
      resetImport();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  };

  const invalidCount = draftRows.filter((row) => !isImportDraftValid(row)).length;
  const reviewPageCount = Math.max(
    1,
    Math.ceil(draftRows.length / IMPORT_REVIEW_PAGE_SIZE),
  );
  const currentReviewPage = Math.min(reviewPage, reviewPageCount);
  const visibleDraftRows = draftRows.slice(
    (currentReviewPage - 1) * IMPORT_REVIEW_PAGE_SIZE,
    currentReviewPage * IMPORT_REVIEW_PAGE_SIZE,
  );
  const rowLimit = sourceKind === "ocr" ? OCR_IMPORT_LIMIT : STRUCTURED_IMPORT_LIMIT;

  const goToFirstInvalidRow = () => {
    const index = draftRows.findIndex((row) => !isImportDraftValid(row));
    if (index >= 0) {
      setReviewPage(Math.floor(index / IMPORT_REVIEW_PAGE_SIZE) + 1);
    }
  };

  const addDraftRow = () => {
    if (draftRows.length >= rowLimit) return;
    const nextLength = draftRows.length + 1;
    setDraftRows((rows) => [...rows, makeImportDraft({}, rows.length)]);
    setReviewPage(Math.ceil(nextLength / IMPORT_REVIEW_PAGE_SIZE));
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          aria-label="Import dealers"
          className="h-10 w-10 rounded-xl border-[#d6cfc4] bg-white p-0 text-[#34333a] shadow-sm transition-[transform,background-color] active:scale-[0.97] hover:bg-[#f4efe8] hover:text-[#252a30] sm:h-9 sm:w-auto sm:rounded-lg sm:px-3"
        >
          <Upload className="h-4 w-4" />
          <span className="hidden sm:inline">Import</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-24px)] overflow-y-auto rounded-2xl border-[#ded7cc] bg-white text-[#252a30] shadow-[0_24px_70px_rgba(37,42,48,0.24)] sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle className="text-xl tracking-[-0.02em] text-[#252a30]">
            {stage === "choose" ? "Import dealers" : "Review import"}
          </DialogTitle>
          <DialogDescription className="leading-6 text-[#6f6a65]">
            {stage === "choose"
              ? "Upload structured data or extract rows from an image or PDF. Nothing is added until you review it."
              : `${sourceName} · ${draftRows.length} extracted row${draftRows.length === 1 ? "" : "s"}`}
          </DialogDescription>
        </DialogHeader>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv,.json,image/png,image/jpeg,image/webp,application/pdf"
          onChange={prepareFile}
          className="sr-only"
          id="dealer-import"
        />
        {stage === "choose" ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <ImportSourceCard
                icon={<FileSpreadsheet className="h-4 w-4" />}
                title="Structured files"
                description="Excel, CSV or JSON. Column order can vary; a full-address column is optional."
              />
              <ImportSourceCard
                icon={<FileImage className="h-4 w-4" />}
                title="Image or PDF"
                description="OCR is approximate. Every extracted row must be reviewed before import."
                warning
              />
            </div>
            <div className="rounded-xl border border-[#ded7cc] bg-white p-4">
              <div className="flex items-start gap-3">
                <FileJson className="mt-0.5 h-5 w-5 shrink-0 text-[#252a44]" />
                <div>
                  <p className="text-sm font-semibold text-[#252a30]">
                    {REQUIRED_IMPORT_COLUMNS.join(" · ")}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[#6f6a65]">
                    Optional: FULL ADDRESS. Address rows get address-level pins; otherwise pins use the PIN-code location. Up to 500 structured rows; OCR up to 50.
                  </p>
                </div>
              </div>
            </div>
            {importing ? (
              <ImportProgress value={progress} label={progressLabel} />
            ) : null}
            <DialogFooter>
              <Button
                className="w-full bg-[#b65a38] text-white transition-[transform,background-color] active:scale-[0.98] hover:bg-[#a64b2f] sm:w-auto"
                disabled={importing}
                onClick={() => fileRef.current?.click()}
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {importing ? "Extracting rows…" : "Choose a file"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div
              className={`rounded-xl border p-3 text-sm ${
                sourceKind === "ocr"
                  ? "border-[#e5d8ad] bg-[#fffbeb] text-[#66521f]"
                  : "border-[#cfe1d9] bg-[#f2f8f5] text-[#315448]"
              }`}
            >
              <div className="flex items-start gap-2">
                {sourceKind === "ocr" ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <p>
                  {sourceKind === "ocr"
                    ? "OCR can misread names and PIN codes. Compare every row with the source."
                    : "Rows were read from structured data. Check highlighted fields."}
                </p>
              </div>
            </div>
            {sourceKind === "ocr" ? (
              <details className="rounded-xl border border-[#ded7cc] bg-[#fbf7f1] p-3">
                <summary className="cursor-pointer text-sm font-semibold text-[#34333a]">
                  View or correct extracted text
                </summary>
                <div className="mt-3 space-y-3">
                  <p className="text-xs leading-5 text-[#6f6a65]">
                    Keep one dealer per line. Separate columns with tabs, commas, pipes, semicolons, or two spaces.
                  </p>
                  <Textarea
                    value={extractedText}
                    onChange={(event) => setExtractedText(event.target.value)}
                    className="min-h-32 border-[#d6cfc4] bg-white font-mono text-xs text-[#252a30]"
                    aria-label="Extracted OCR text"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-[#d6cfc4] bg-white text-[#34333a] transition-transform active:scale-[0.98]"
                    onClick={() => {
                      const parsed = parseExtractedText(extractedText);
                      if (parsed.length > OCR_IMPORT_LIMIT) {
                        toast.warning(
                          `Only the first ${OCR_IMPORT_LIMIT} OCR rows can be reviewed.`,
                        );
                      }
                      setDraftRows(
                        parsed.length
                          ? parsed.slice(0, OCR_IMPORT_LIMIT)
                          : [makeImportDraft({}, 0)],
                      );
                      setReviewPage(1);
                    }}
                  >
                    Rebuild rows from text
                  </Button>
                </div>
              </details>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-[#252a30]">
                  {invalidCount
                    ? `${invalidCount} row${invalidCount === 1 ? " needs" : "s need"} attention`
                    : "All rows are ready"}
                </p>
                {invalidCount ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 text-[#a13c32] transition-transform active:scale-[0.98]"
                    onClick={goToFirstInvalidRow}
                  >
                    Go to first issue
                  </Button>
                ) : null}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-[#d6cfc4] bg-white text-[#34333a] transition-transform active:scale-[0.98]"
                disabled={draftRows.length >= rowLimit}
                onClick={addDraftRow}
              >
                <Plus className="h-4 w-4" /> Add row
              </Button>
            </div>
            <ImportPagination
              page={currentReviewPage}
              pageCount={reviewPageCount}
              rowCount={draftRows.length}
              onPageChange={setReviewPage}
            />
            <div className="space-y-3">
              {visibleDraftRows.map((row, index) => (
                <ImportRowEditor
                  key={row.key}
                  row={row}
                  index={(currentReviewPage - 1) * IMPORT_REVIEW_PAGE_SIZE + index}
                  onChange={(field, value) => updateDraft(row.key, field, value)}
                  onRemove={() =>
                    setDraftRows((rows) => rows.filter((item) => item.key !== row.key))
                  }
                />
              ))}
            </div>
            <ImportPagination
              page={currentReviewPage}
              pageCount={reviewPageCount}
              rowCount={draftRows.length}
              onPageChange={setReviewPage}
            />
            {importing ? <ImportProgress value={progress} label={progressLabel} /> : null}
            <DialogFooter className="gap-2 sm:justify-between">
              <Button
                type="button"
                variant="outline"
                disabled={importing}
                className="border-[#d6cfc4] bg-white text-[#34333a] transition-transform active:scale-[0.98]"
                onClick={resetImport}
              >
                Choose another file
              </Button>
              <Button
                type="button"
                disabled={importing || !draftRows.length || invalidCount > 0}
                className="bg-[#b65a38] text-white transition-[transform,background-color] active:scale-[0.98] hover:bg-[#a64b2f]"
                onClick={commitImport}
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {importing
                  ? "Adding dealers…"
                  : `Import ${draftRows.length} reviewed row${draftRows.length === 1 ? "" : "s"}`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DealerSearch({
  query,
  onChange,
}: {
  query: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6f6a65]" />
      <Input
        value={query}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search dealer, address, area or PIN"
        className="h-11 border-[#d6cfc4] bg-white pl-9 pr-10 text-[15px] text-[#252a30] shadow-none placeholder:text-[#6f6a65] focus-visible:ring-[#356a9a]"
        aria-label="Search dealers"
      />
      {query ? (
        <button
          type="button"
          className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-[#6f6a65] transition-[transform,background-color] active:scale-[0.97] hover:bg-[#f7f3ea]"
          onClick={() => onChange("")}
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

function SalespersonFilters({
  salespeople,
  activePeople,
  onToggle,
  onShowAll,
  onClearAll,
}: {
  salespeople: string[];
  activePeople: string[];
  onToggle: (person: string) => void;
  onShowAll: () => void;
  onClearAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const allActive = salespeople.every((person) => activePeople.includes(person));
  const filteredPeople = salespeople.filter((person) =>
    person.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const summary = allActive
    ? "All salespeople"
    : activePeople.length === 0
      ? "No salespeople"
      : activePeople.length === 1
        ? activePeople[0]
        : `${activePeople.length} of ${salespeople.length} selected`;

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(dropdownTriggerClass, "flex items-center justify-between gap-3 text-left font-semibold outline-none")}
          aria-label={`Filter by salesperson, ${summary}`}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="flex shrink-0 -space-x-1.5" aria-hidden="true">
              {activePeople.slice(0, 3).map((person) => (
                <span
                  key={person}
                  className="h-3.5 w-3.5 rounded-full border-2 border-white"
                  style={{ backgroundColor: getSalespersonColor(person) }}
                />
              ))}
              {activePeople.length === 0 ? (
                <span className="h-3.5 w-3.5 rounded-full border border-[#aaa29a] bg-[#ded7cc]" />
              ) : null}
            </span>
            <span className="truncate">{summary}</span>
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-[#6f6a65] transition-transform duration-150 ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className={cn(dropdownContentClass, "w-[var(--radix-popover-trigger-width)] min-w-[260px] overflow-hidden p-0")}
      >
        <div className="border-b border-[#e9e2d8] p-2">
          <div className="flex items-center justify-between gap-3 px-1 pb-1.5">
            <p className="text-xs font-semibold text-[#5f5b57]">Salespeople</p>
            <p className="text-xs text-[#6f6a65]">
              {activePeople.length} of {salespeople.length} visible
            </p>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6f6a65]" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search salespeople"
              aria-label="Search salespeople"
              className={dropdownSearchClass}
            />
          </div>
        </div>
        <div className="scrollbar-thin max-h-56 overflow-y-auto p-1.5">
          {filteredPeople.length ? (
            filteredPeople.map((person) => {
              const active = activePeople.includes(person);
              return (
                <button
                  key={person}
                  type="button"
                  role="checkbox"
                  aria-checked={active}
                  onClick={() => onToggle(person)}
                  className={cn(dropdownItemClass, "flex w-full items-center gap-3 text-left", active && "bg-[#f8eee9] font-medium")}
                >
                  <span
                    className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${
                      active
                        ? "border-[#252a44] bg-[#252a44] text-white"
                        : "border-[#c8beb1] bg-white"
                    }`}
                    aria-hidden="true"
                  >
                    {active ? <Check className="h-3 w-3" strokeWidth={2.5} /> : null}
                  </span>
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: getSalespersonColor(person) }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">{person}</span>
                </button>
              );
            })
          ) : (
            <p className="px-3 py-6 text-center text-xs text-[#6f6a65]">
              No matching salespeople
            </p>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-[#e9e2d8] p-1.5">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={allActive}
            className="h-9 text-xs text-[#34333a] transition-transform active:scale-[0.97]"
            onClick={onShowAll}
          >
            Select all
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={activePeople.length === 0}
            className="h-9 text-xs text-[#6f6a65] transition-transform active:scale-[0.97]"
            onClick={onClearAll}
          >
            Clear all
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SearchableValueFilter({
  label,
  value,
  options,
  allLabel,
  searchPlaceholder,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  allLabel: string;
  searchPlaceholder: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLowerCase();
  const filteredOptions = options.filter((option) =>
    option.toLowerCase().includes(normalizedSearch),
  );
  const selectedLabel = value === "all" ? allLabel : value;

  const selectValue = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
    setSearch("");
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(dropdownTriggerClass, "flex min-w-0 items-center justify-between gap-2 text-left outline-none")}
          aria-label={`Filter by ${label.toLowerCase()}, ${selectedLabel}`}
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-[#6f6a65] transition-transform duration-150 ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className={cn(dropdownContentClass, "w-[var(--radix-popover-trigger-width)] min-w-[230px] overflow-hidden p-0")}
      >
        <div className="border-b border-[#e9e2d8] p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6f6a65]" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className={dropdownSearchClass}
            />
          </div>
        </div>
        <div className="scrollbar-thin max-h-60 overflow-y-auto p-1.5">
          {!normalizedSearch ? (
            <button
              type="button"
              aria-pressed={value === "all"}
              onClick={() => selectValue("all")}
              className={cn(dropdownItemClass, "flex w-full items-center gap-2.5 text-left", value === "all" && "bg-[#f8eee9] font-medium")}
            >
              <Check
                className={`h-4 w-4 shrink-0 ${value === "all" ? "text-[#252a44]" : "text-transparent"}`}
                aria-hidden="true"
              />
              <span className="truncate font-medium">{allLabel}</span>
            </button>
          ) : null}
          {filteredOptions.length ? (
            filteredOptions.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={value === option}
                onClick={() => selectValue(option)}
                className={cn(dropdownItemClass, "flex w-full items-center gap-2.5 text-left", value === option && "bg-[#f8eee9] font-medium")}
              >
                <Check
                  className={`h-4 w-4 shrink-0 ${value === option ? "text-[#252a44]" : "text-transparent"}`}
                  aria-hidden="true"
                />
                <span className="truncate font-medium">{option}</span>
              </button>
            ))
          ) : (
            <p className="px-3 py-6 text-center text-xs text-[#6f6a65]">
              No matches
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

type DealerFilterControlProps = {
  showSalespersonFilter: boolean;
  showQualityFilter: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  salespeople: string[];
  activePeople: string[];
  onTogglePerson: (person: string) => void;
  onShowAll: () => void;
  onClearAll: () => void;
  stateFilter: StateFilter;
  onStateFilterChange: (value: StateFilter) => void;
  qualityFilter: QualityFilter;
  onQualityFilterChange: (value: QualityFilter) => void;
  pincodeFilter: string;
  onPincodeFilterChange: (value: string) => void;
  areaFilter: string;
  onAreaFilterChange: (value: string) => void;
  pincodes: string[];
  areas: string[];
  activeFilterCount: number;
  onResetFilters: () => void;
  onCopyView: () => void;
};

function DealerFilterControls({
  showSalespersonFilter,
  showQualityFilter,
  query,
  onQueryChange,
  salespeople,
  activePeople,
  onTogglePerson,
  onShowAll,
  onClearAll,
  stateFilter,
  onStateFilterChange,
  qualityFilter,
  onQualityFilterChange,
  pincodeFilter,
  onPincodeFilterChange,
  areaFilter,
  onAreaFilterChange,
  pincodes,
  areas,
  activeFilterCount,
  onResetFilters,
  onCopyView,
  layout,
}: DealerFilterControlProps & { layout: "sidebar" | "wide" }) {
  const fieldClass = "grid min-w-0 gap-1.5";
  const triggerClass = "w-full";

  return (
    <div className="space-y-4">
      <div
        className={
          layout === "wide" && showSalespersonFilter
            ? "grid gap-4 md:grid-cols-[minmax(240px,1.2fr)_minmax(240px,1fr)] md:items-end"
            : "space-y-3"
        }
      >
        <DealerSearch query={query} onChange={onQueryChange} />
        {showSalespersonFilter ? <div>
          <p className="mb-1.5 text-xs font-semibold text-[#6f6a65]">
            Salesperson
          </p>
          <SalespersonFilters
            salespeople={salespeople}
            activePeople={activePeople}
            onToggle={onTogglePerson}
            onShowAll={onShowAll}
            onClearAll={onClearAll}
          />
        </div> : null}
      </div>

      <div
        className={
          layout === "wide"
            ? showQualityFilter
              ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto_auto] xl:items-end"
              : "grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto_auto] xl:items-end"
            : "grid grid-cols-2 gap-3"
        }
      >
        <div className={fieldClass}>
          <Label className="text-xs font-semibold text-[#6f6a65]">State</Label>
          <Select
            value={stateFilter}
            onValueChange={(value) => onStateFilterChange(value as StateFilter)}
          >
            <SelectTrigger aria-label="Filter by state" className={triggerClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All states</SelectItem>
              {INDIAN_STATES.map((item) => (
                <SelectItem key={item} value={item}>{item}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {showQualityFilter ? <div className={fieldClass}>
          <Label className="text-xs font-semibold text-[#6f6a65]">
            Data quality
          </Label>
          <Select
            value={qualityFilter}
            onValueChange={(value) =>
              onQualityFilterChange(value as QualityFilter)
            }
          >
            <SelectTrigger
              aria-label="Filter by data quality"
              className={triggerClass}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All quality</SelectItem>
              <SelectItem value="verified">Verified</SelectItem>
              <SelectItem value="unchecked">Not checked</SelectItem>
            </SelectContent>
          </Select>
        </div> : null}

        <div className={fieldClass}>
          <Label className="text-xs font-semibold text-[#6f6a65]">
            PIN code
          </Label>
          <SearchableValueFilter
            label="PIN code"
            value={pincodeFilter}
            options={pincodes}
            allLabel="All PIN codes"
            searchPlaceholder="Search PIN codes"
            onChange={onPincodeFilterChange}
          />
        </div>

        <div className={fieldClass}>
          <Label className="text-xs font-semibold text-[#6f6a65]">Area</Label>
          <SearchableValueFilter
            label="Area"
            value={areaFilter}
            options={areas}
            allLabel="All areas"
            searchPlaceholder="Search areas"
            onChange={onAreaFilterChange}
          />
        </div>

        <Button
          type="button"
          variant="outline"
          disabled={activeFilterCount === 0}
          onClick={onResetFilters}
          className={`h-11 border-[#d6cfc4] bg-white text-[#5f5b57] transition-[transform,background-color] active:scale-[0.98] hover:bg-[#f4efe8] ${
            layout === "sidebar" ? "col-span-2" : ""
          }`}
        >
          <X className="h-3.5 w-3.5" />
          Reset filters
          {activeFilterCount ? (
            <span className="rounded-full bg-[#f4efe8] px-1.5 py-0.5 text-[11px] tabular-nums">
              {activeFilterCount}
            </span>
          ) : null}
        </Button>
        <Button type="button" variant="outline" onClick={onCopyView} className={`h-11 border-[#d6cfc4] bg-white ${layout === "sidebar" ? "col-span-2" : ""}`}>
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          Copy view link
        </Button>
      </div>
    </div>
  );
}

function MobileMapFilters({
  filters,
}: {
  filters: DealerFilterControlProps;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="absolute left-3 top-3 z-10 inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/75 bg-white/95 px-3 text-xs font-semibold text-[#34333a] shadow-[0_8px_24px_rgba(37,42,68,0.13)] backdrop-blur transition-[transform,background-color] active:scale-[0.97] hover:bg-white lg:hidden"
          aria-label={`Filter map dealers${filters.activeFilterCount ? `, ${filters.activeFilterCount} active` : ""}`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {filters.activeFilterCount ? (
            <span className="rounded-full bg-[#252a44] px-1.5 py-0.5 text-[11px] text-white tabular-nums">
              {filters.activeFilterCount}
            </span>
          ) : null}
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-24px)] overflow-y-auto rounded-2xl border-[#ded7cc] bg-[#fffcf7] text-[#252a30] shadow-[0_24px_70px_rgba(37,42,48,0.24)] sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-xl tracking-[-0.02em] text-[#252a30]">
            Filter map dealers
          </DialogTitle>
          <DialogDescription className="leading-6 text-[#6f6a65]">
            The same filters stay active when you switch to the Dealers tab.
          </DialogDescription>
        </DialogHeader>
        <DealerFilterControls {...filters} layout="sidebar" />
      </DialogContent>
    </Dialog>
  );
}

function MobileDirectoryFilters({
  filters,
  resultCount,
}: {
  filters: DealerFilterControlProps;
  resultCount: number;
}) {
  return (
    <div className="mt-5 space-y-3 rounded-2xl border border-[#ded7cc] bg-white p-3 shadow-[0_8px_24px_rgba(37,42,68,0.05)] lg:hidden">
      <DealerSearch query={filters.query} onChange={filters.onQueryChange} />
      <div className="flex items-center justify-between gap-3">
        <Dialog>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" className="h-11 border-[#d6cfc4] bg-white">
              <SlidersHorizontal aria-hidden="true" /> Filters
              {filters.activeFilterCount ? (
                <span className="rounded-full bg-[#252a44] px-1.5 py-0.5 text-xs text-white tabular-nums">{filters.activeFilterCount}</span>
              ) : null}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[calc(100svh-24px)] overflow-y-auto rounded-2xl border-[#ded7cc] bg-[#fffcf7] text-[#252a30] sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>Filter dealers</DialogTitle>
              <DialogDescription>Refine the directory by owner, state, quality, PIN code, or area.</DialogDescription>
            </DialogHeader>
            <DealerFilterControls {...filters} layout="sidebar" />
          </DialogContent>
        </Dialog>
        <p className="text-sm font-medium text-[#6f6a65]">{resultCount} {resultCount === 1 ? "dealer" : "dealers"}</p>
      </div>
    </div>
  );
}

function getDealerQualityStatus(dealer: Dealer) {
  return dealer.validationStatus ?? (dealer.reviewNote ? "review" : "unchecked");
}

function getDealerQualityLabel(dealer: Dealer) {
  const status = getDealerQualityStatus(dealer);

  if (status === "verified") return "Verified";
  if (status === "invalid") return "Invalid";
  if (status === "review") return "Needs review";
  return "Not checked";
}

function DealerQualityBadge({ dealer }: { dealer: Dealer }) {
  const status = getDealerQualityStatus(dealer);

  if (status === "verified") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
        <CheckCircle2 className="h-3 w-3" />
        Verified
      </span>
    );
  }

  if (status === "invalid") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
        <AlertTriangle className="h-3 w-3" />
        Invalid
      </span>
    );
  }

  if (status === "unavailable" || status === "unchecked") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
        <Info className="h-3 w-3" />
        Not checked
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
      <AlertTriangle className="h-3 w-3" />
      Needs review
    </span>
  );
}

function DealerDirectory({
  active,
  allDealers,
  filters,
  onSelect,
  onUpdate,
  onDelete,
  onAdd,
  onImport,
  onReviewResolved,
  pendingReviewCount,
  filterRevision,
  canManage,
}: {
  active: boolean;
  allDealers: DealerSummary[];
  filters: DealerFilterControlProps;
  onSelect: (dealer: DealerSummary) => void;
  onUpdate: (dealer: Dealer) => Promise<boolean>;
  onDelete: (dealer: DealerSummary) => Promise<void>;
  onAdd: (dealer: Omit<Dealer, "id">) => Promise<boolean>;
  onImport: (dealers: Array<Omit<Dealer, "id">>) => Promise<number>;
  onReviewResolved: (dealer: Dealer) => void;
  pendingReviewCount: number;
  filterRevision: number;
  canManage: boolean;
}) {
  const [editingDealer, setEditingDealer] = useState<Dealer | null>(null);
  const editRequest = useRef(0);
  useEffect(() => () => {
    // A detail response must not open an editor after leaving this workspace.
    editRequest.current += 1;
  }, [active]);
  const [deletingDealer, setDeletingDealer] = useState<DealerSummary | null>(null);
  const [pagination, setPagination] = useState({ revision: -1, page: 1 });
  const [pageResult, setPageResult] = useState<{ dealers: DealerSummary[]; total: number; key: string } | null>(null);
  const [pageError, setPageError] = useState<{ key: string; message: string } | null>(null);
  const [pageRetry, setPageRetry] = useState(0);
  const filterKey = dealerFilterKey({
    query: filters.query,
    salespeople: filters.activePeople,
    state: filters.stateFilter,
    quality: canManage ? filters.qualityFilter : "all",
    pincode: filters.pincodeFilter,
    area: filters.areaFilter,
  });
  const currentPage = pageForFilterRevision(pagination, filterRevision);
  const requestKey = `${filterRevision}:${filterKey}:${currentPage}`;
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const requestFilters = {
      query: filters.query,
      salespeople: filters.activePeople,
      state: filters.stateFilter,
      quality: canManage ? filters.qualityFilter : "all" as const,
      pincode: filters.pincodeFilter,
      area: filters.areaFilter,
    };
    void fetchDealerDirectoryPage(requestFilters, currentPage)
      .then((result) => {
        if (cancelled) return;
        setPageResult({ ...result, key: requestKey });
        setPageError(null);
      })
      .catch((error: unknown) => {
        if (!cancelled) setPageError({
          key: requestKey,
          message: error instanceof Error ? error.message : "The directory could not load.",
        });
      });
    return () => { cancelled = true; };
  // filterKey is the stable request identity; allDealers changes only after a mutation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, allDealers, canManage, currentPage, filterKey, pageRetry, requestKey]);

  const currentResult = pageResult?.key === requestKey ? pageResult : null;
  const currentError = pageError?.key === requestKey ? pageError.message : null;
  const visibleDealers = currentResult?.dealers ?? [];
  const total = currentResult?.total ?? 0;
  const pageSize = 100;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  async function startEditingDealer(dealer: DealerSummary) {
    const request = ++editRequest.current;
    try {
      const detail = await fetchDealerDetail(dealer.id);
      if (request === editRequest.current) setEditingDealer(detail);
    } catch (error) {
      if (request === editRequest.current) toast.error(error instanceof Error ? error.message : "Dealer details could not be loaded.");
    }
  }

  return (
    <section
      id="dealer-directory-panel"
      role="tabpanel"
      hidden={!active}
      aria-labelledby="workspace-dealers-tab"
      className="h-[calc(100svh-120px)] overflow-y-auto bg-[#f7f3ea]"
    >
      <div className="mx-auto w-full max-w-[1280px] px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#6f6a65]">
              Dealer directory
            </p>
            <h2
              id="dealer-directory-title"
              className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[#252a30] sm:text-3xl"
            >
              {canManage ? "All dealers" : "My dealers"}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6f6a65]">
              {canManage
                ? "Maintain dealer ownership, postal details, and the addresses used for route planning."
                : "Review your assigned dealers and the location details used for daily routes."}
            </p>
          </div>
          {canManage ? (
            <div className="flex items-center gap-2">
              <ImportDealersDialog onImport={onImport} />
              <AddDealerDialog
                salespeople={filters.salespeople}
                onAdd={onAdd}
              />
            </div>
          ) : null}
        </div>

        {canManage ? (
          <DealerReviewQueue
            dealers={allDealers}
            salespeople={filters.salespeople}
            initialPendingCount={pendingReviewCount}
            onEditDealer={(dealer) => { void startEditingDealer(dealer); }}
            onResolved={onReviewResolved}
          />
        ) : null}

        <MobileDirectoryFilters filters={filters} resultCount={total} />
        <div className="mt-5 hidden rounded-2xl border border-[#ded7cc] bg-white p-3 shadow-[0_8px_24px_rgba(37,42,68,0.05)] sm:p-4 lg:block">
          <div className="mb-3 flex items-center justify-between text-xs font-semibold text-[#6f6a65]">
            <span>Filters</span>
            <span>
              {total} {total === 1 ? "dealer" : "dealers"}
            </span>
          </div>
          <DealerFilterControls {...filters} layout="wide" />
        </div>

        {currentError ? <div role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{currentError} <Button type="button" variant="outline" className="ml-2" onClick={() => { setPageError(null); setPageRetry((value) => value + 1); }}>Retry</Button></div> : null}
        {!currentResult && !currentError ? <WorkspaceLoading label="Loading dealer directory…" /> : null}
        {visibleDealers.length ? (
          <>
            <ul className="mt-4 space-y-2 lg:hidden">
              {visibleDealers.map((dealer) => (
                <li key={dealer.id} className="relative">
                  <button
                    type="button"
                    onClick={() => onSelect(dealer)}
                    className={`flex min-h-24 w-full items-center gap-3 rounded-2xl border border-[#ded7cc] bg-white p-3 text-left shadow-[0_6px_18px_rgba(37,42,68,0.04)] transition-[transform,background-color] active:scale-[0.99] ${canManage ? "pr-28" : "pr-4"}`}
                  >
                    <span
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white shadow-sm"
                      style={{
                        backgroundColor: getSalespersonColor(dealer.salesperson),
                      }}
                    >
                      <Building2 className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-[#252a30]">
                          {dealer.dealer}
                        </span>
                        {dealer.reviewNote ? (
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                        ) : null}
                      </span>
                      <span className="mt-1 block truncate text-xs text-[#6f6a65]">
                        {dealer.area} · {dealer.pincode}
                      </span>
                      {dealer.address ? (
                        <span className="mt-1 block truncate text-[11px] text-[#6f6a65]">
                          {dealer.address}
                        </span>
                      ) : null}
                      <span className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-[#5f5b57]">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{
                            backgroundColor: getSalespersonColor(
                              dealer.salesperson,
                            ),
                          }}
                        />
                        <span className="truncate">
                          {canManage ? `${dealer.salesperson} · ` : ""}
                          {dealer.state} · {getDealerQualityLabel(dealer)}
                        </span>
                      </span>
                    </span>
                  </button>
                  {canManage ? <div className="absolute right-2 top-1/2 flex -translate-y-1/2 gap-1">
                    <button
                      type="button"
                      onClick={() => { void startEditingDealer(dealer); }}
                      aria-label={`Edit ${dealer.dealer}`}
                      className="grid h-11 w-11 place-items-center rounded-xl border border-[#ded7cc] bg-white text-[#5f5b57] shadow-sm transition-[transform,background-color] active:scale-[0.96] hover:bg-[#f4efe8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#356a9a]"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingDealer(dealer)}
                      aria-label={`Delete ${dealer.dealer}`}
                      className="grid h-11 w-11 place-items-center rounded-xl border border-red-200 bg-white text-red-600 shadow-sm transition-[transform,background-color] active:scale-[0.96] hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div> : null}
                </li>
              ))}
            </ul>

            <div className="mt-4 hidden overflow-hidden rounded-2xl border border-[#ded7cc] bg-white shadow-[0_8px_24px_rgba(37,42,68,0.05)] lg:block">
              <table className="w-full border-collapse text-left">
                <thead className="bg-[#f6f0e8] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6f6a65]">
                  <tr>
                    <th scope="col" className="px-5 py-3.5">Dealer</th>
                    {canManage ? <th scope="col" className="px-4 py-3.5">Salesperson</th> : null}
                    <th scope="col" className="px-4 py-3.5">Area / address</th>
                    <th scope="col" className="px-4 py-3.5">PIN code</th>
                    <th scope="col" className="px-4 py-3.5">State</th>
                    <th scope="col" className="px-4 py-3.5">Data quality</th>
                    {canManage ? <th scope="col" className="px-5 py-3.5 text-right">Actions</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e9e2d8]">
                  {visibleDealers.map((dealer) => (
                    <tr
                      key={dealer.id}
                      className="text-sm text-[#34333a] transition-colors hover:bg-[#fbf7f1]"
                    >
                      <td className="px-5 py-3.5">
                        <button
                          type="button"
                          onClick={() => onSelect(dealer)}
                          className="flex items-center gap-3 text-left font-semibold text-[#252a30] outline-none focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-[#356a9a] focus-visible:ring-offset-2"
                        >
                          <span
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white shadow-sm"
                            style={{
                              backgroundColor: getSalespersonColor(
                                dealer.salesperson,
                              ),
                            }}
                          >
                            <Building2 className="h-4 w-4" />
                          </span>
                          {dealer.dealer}
                        </button>
                      </td>
                      {canManage ? <td className="px-4 py-3.5 font-semibold">
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{
                              backgroundColor: getSalespersonColor(
                                dealer.salesperson,
                              ),
                            }}
                          />
                          {dealer.salesperson}
                        </span>
                      </td> : null}
                      <td className="max-w-[260px] px-4 py-3.5">
                        <span className="block font-medium">{dealer.area}</span>
                        <span className="mt-0.5 block truncate text-xs text-[#6f6a65]">
                          {dealer.address ?? "No full address"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-medium tabular-nums">
                        {dealer.pincode}
                      </td>
                      <td className="px-4 py-3.5">{dealer.state}</td>
                      <td className="px-4 py-3.5">
                        <DealerQualityBadge dealer={dealer} />
                      </td>
                      {canManage ? <td className="px-5 py-3.5 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => { void startEditingDealer(dealer); }}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-[#34333a] transition-[transform,background-color] active:scale-[0.97] hover:bg-[#f4efe8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#356a9a]"
                            aria-label={`Edit ${dealer.dealer}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => onSelect(dealer)}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-[#252a44] transition-[transform,background-color] active:scale-[0.97] hover:bg-[#f4efe8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#356a9a]"
                            aria-label={`View ${dealer.dealer} on map`}
                          >
                            Map
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingDealer(dealer)}
                            className="grid h-9 w-9 place-items-center rounded-lg text-[#6f6a65] transition-[transform,background-color,color] active:scale-[0.97] hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                            aria-label={`Delete ${dealer.dealer}`}
                            title={`Delete ${dealer.dealer}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pageCount > 1 ? (
              <div className="mt-4 flex flex-col gap-3 rounded-xl border border-[#ded7cc] bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-[#6f6a65]">
                  Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, total)} of {total} dealers
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={currentPage <= 1}
                    onClick={() => setPagination({ revision: filterRevision, page: Math.max(1, currentPage - 1) })}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={currentPage >= pageCount}
                    onClick={() => setPagination({ revision: filterRevision, page: Math.min(pageCount, currentPage + 1) })}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        ) : currentResult && total === 0 ? (
          <div className="mt-4 grid min-h-64 place-items-center rounded-2xl border border-dashed border-[#d6cfc4] bg-white px-6 text-center">
            <div>
              <CircleDot className="mx-auto mb-3 h-7 w-7 text-[#aaa29a]" />
              <p className="text-sm font-semibold text-[#252a30]">
                No dealers match
              </p>
              <p className="mt-1 text-xs text-[#6f6a65]">
                Clear the search or adjust the filters.
              </p>
            </div>
          </div>
        ) : null}
      </div>
      {active && canManage && editingDealer ? (
        <EditDealerDialog
          key={editingDealer.id}
          dealer={editingDealer}
          salespeople={filters.salespeople}
          onClose={() => { editRequest.current += 1; setEditingDealer(null); }}
          onUpdate={onUpdate}
        />
      ) : null}
      {canManage ? <AlertDialog
        open={Boolean(deletingDealer)}
        onOpenChange={(open) => !open && setDeletingDealer(null)}
      >
        <AlertDialogContent className="rounded-2xl border-[#ded7cc] bg-white text-[#252a30] shadow-[0_24px_70px_rgba(37,42,48,0.24)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="tracking-[-0.02em] text-[#252a30]">
              Delete dealer?
            </AlertDialogTitle>
            <AlertDialogDescription className="leading-6 text-[#6f6a65]">
              {deletingDealer ? (
                <>
                  <strong className="font-semibold text-[#34333a]">
                    {deletingDealer.dealer}
                  </strong>{" "}
                  will be removed from the shared workspace. Its map pin and any
                  coverage derived only from this record will disappear.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[#d6cfc4] bg-white text-[#34333a] transition-transform active:scale-[0.98]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deletingDealer) void onDelete(deletingDealer);
                setDeletingDealer(null);
              }}
              className="transition-transform active:scale-[0.98]"
            >
              Delete dealer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog> : null}
    </section>
  );
}

function WorkspaceLoading({ label }: { label: string }) {
  return (
    <div className="grid min-h-[420px] place-items-center px-6 text-center" role="status">
      <div>
        <Loader2 className="mx-auto h-7 w-7 animate-spin text-[#6f6a65]" aria-hidden="true" />
        <p className="mt-3 text-sm font-semibold text-[#252a30]">{label}</p>
      </div>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const [dealers, setDealers] = useState<DealerSummary[]>([]);
  const [session, setSession] = useState<AppSession | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [team, setTeam] = useState<SalespersonAccount[]>([]);
  const [commerce, setCommerce] = useState<CommerceWorkspaceBootstrap | null>(null);
  const [shop, setShop] = useState<ShopWorkspaceBootstrap | null>(null);
  const [pendingDealerReviewCount, setPendingDealerReviewCount] = useState(0);
  const [openedWorkspaceViews, setOpenedWorkspaceViews] = useState<WorkspaceView[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [bootstrapRetry, setBootstrapRetry] = useState(0);
  const [commerceError, setCommerceError] = useState<string | null>(null);
  const [shopError, setShopError] = useState<string | null>(null);
  const [commerceRetry, setCommerceRetry] = useState(0);
  const [shopRetry, setShopRetry] = useState(0);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [activePeople, setActivePeople] = useState<string[]>([]);
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>("all");
  const [pincodeFilter, setPincodeFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const [mapSidebarExpansion, setMapSidebarExpansion] = useState({
    filterKey: "",
    limit: 50,
  });
  const [filterRevision, setFilterRevision] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<{
    dealerId: number;
    completedVisits: number;
    lastCompletedAt: string | null;
    nextDueAt: string | null;
    frequencyDays: number;
  } | null>(null);
  const [activityError, setActivityError] = useState<number | null>(null);
  const [activityRetry, setActivityRetry] = useState(0);
  const [focusRequest, setFocusRequest] = useState<DealerSummary | null>(null);
  const pendingDealerDeletes = useRef(new Map<number, number>());
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("map");

  useEffect(() => {
    if (selectedId === null || workspaceView !== "map") return;
    const controller = new AbortController();
    void fetch(`/api/dealers/${selectedId}/activity`, {
      cache: "no-store", signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error("Activity unavailable");
      return response.json() as Promise<{ activity: Omit<NonNullable<typeof selectedActivity>, "dealerId"> }>;
    }).then(({ activity }) => {
      if (!controller.signal.aborted) setSelectedActivity({ dealerId: selectedId, ...activity });
    }).catch(() => {
      if (!controller.signal.aborted) setActivityError(selectedId);
    });
    return () => controller.abort();
  }, [selectedId, workspaceView, activityRetry]);
  const workspaceNavRef = useRef<HTMLElement>(null);
  const [workspaceNavEdges, setWorkspaceNavEdges] = useState({ left: false, right: true });

  useEffect(() => {
    if (workspaceView !== "map") return;
    const frame = window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [workspaceView]);

  useEffect(() => {
    let cancelled = false;

    // Show the account shell while the larger dealer dataset loads.
    void fetchAppSession().then(({ session: account }) => {
      if (!cancelled) setSession(account);
    }).catch(() => {
      // The workspace request handles authentication and retry messaging.
    });

    async function loadWorkspace() {
      try {
        const workspace = await fetchWorkspaceBootstrap();
        if (cancelled) return;
        setBootstrapError(null);
        setSession(workspace.session);
        setDealers(workspace.dealers);
        setTeam(workspace.salespeople);
        setPendingDealerReviewCount(workspace.pendingDealerReviewCount);
        const allPeople = workspace.salespeople.map((person) => person.normalizedName);
        const viewFilters = readDealerViewUrl(
          new URL(window.location.href),
          allPeople,
          [...new Set(workspace.dealers.map((dealer) => dealer.pincode))],
          [...new Set(workspace.dealers.map((dealer) => dealer.area))],
        );
        setActivePeople(viewFilters?.salespeople ?? allPeople);
        if (viewFilters) {
          setQuery(viewFilters.query);
          setStateFilter(viewFilters.state);
          setQualityFilter(viewFilters.quality);
          setPincodeFilter(viewFilters.pincode);
          setAreaFilter(viewFilters.area);
        }
        const requestedView = new URLSearchParams(window.location.search).get(
          "workspace",
        );
        const { field: fieldAccess, commerce: commerceAccess, shop: shopAccess } = workspace.access;
        let initialView: WorkspaceView | null = null;
        if (
          fieldAccess &&
          (requestedView === "map" ||
            requestedView === "dealers" ||
            requestedView === "routes")
        ) {
          initialView = requestedView;
        } else if (
          requestedView === "team" &&
          workspace.session.roles.includes("admin")
        ) {
          initialView = "team";
        } else if (requestedView === "commerce" && commerceAccess) {
          initialView = "commerce";
        } else if (requestedView === "shop" && shopAccess) {
          initialView = "shop";
        } else if (fieldAccess) {
          initialView = "map";
        } else if (!fieldAccess && commerceAccess) {
          initialView = "commerce";
        } else if (!fieldAccess && shopAccess) {
          initialView = "shop";
        }
        if (initialView) {
          setOpenedWorkspaceViews([initialView]);
          setWorkspaceView(initialView);
        }
        setHydrated(true);
      } catch (error: unknown) {
        if (cancelled) return;

        if (
          error instanceof ApiRequestError &&
          (error.status === 401 || error.status === 403)
        ) {
          window.location.replace("/auth/sign-in");
          return;
        }

        setHydrated(true);
        setBootstrapError(error instanceof Error ? error.message : "Your workspace session could not be loaded.");
        toast.error(
          error instanceof Error
            ? error.message
            : "Your workspace session could not be loaded. Refresh to try again.",
        );
      }
    }

    void loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, [bootstrapRetry]);

  useEffect(() => {
    if (!hydrated) return;
    const url = new URL(window.location.href);
    if (workspaceView === "map") {
      url.searchParams.delete("workspace");
    } else {
      url.searchParams.set("workspace", workspaceView);
    }
    window.history.replaceState(null, "", url);
  }, [hydrated, workspaceView]);

  const showWorkspace = (view: WorkspaceView) => {
    setOpenedWorkspaceViews((current) =>
      current.includes(view) ? current : [...current, view],
    );
    setWorkspaceView(view);
  };

  useEffect(() => {
    if (!hydrated || workspaceView !== "commerce" || commerce) return;
    let cancelled = false;
    void fetchCommerceWorkspaceBootstrap()
      .then((data) => {
        if (!cancelled) { setCommerce(data); setCommerceError(null); }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setCommerceError(error instanceof Error ? error.message : "Commerce operations could not be loaded.");
          toast.error(error instanceof Error ? error.message : "Commerce operations could not be loaded.");
        }
      })
    return () => {
      cancelled = true;
    };
  }, [commerce, commerceRetry, hydrated, workspaceView]);

  useEffect(() => {
    if (!hydrated || workspaceView !== "shop" || shop) return;
    let cancelled = false;
    void fetchShopWorkspaceBootstrap()
      .then((data) => {
        if (!cancelled) { setShop(data); setShopError(null); }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setShopError(error instanceof Error ? error.message : "The shop could not be loaded.");
          toast.error(error instanceof Error ? error.message : "The shop could not be loaded.");
        }
      })
    return () => {
      cancelled = true;
    };
  }, [hydrated, shop, shopRetry, workspaceView]);

  useEffect(() => {
    const navigation = workspaceNavRef.current;
    if (!navigation) return;
    const updateEdges = () => {
      setWorkspaceNavEdges({
        left: navigation.scrollLeft > 4,
        right: navigation.scrollLeft + navigation.clientWidth < navigation.scrollWidth - 4,
      });
    };
    const handleResize = () => {
      const activeTab = navigation.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      if (activeTab) {
        navigation.scrollLeft = Math.max(0, activeTab.offsetLeft - (navigation.clientWidth - activeTab.offsetWidth) / 2);
      }
      window.requestAnimationFrame(updateEdges);
    };
    handleResize();
    navigation.addEventListener("scroll", updateEdges, { passive: true });
    window.addEventListener("resize", handleResize);
    const observer = new ResizeObserver(handleResize);
    observer.observe(navigation);
    return () => {
      navigation.removeEventListener("scroll", updateEdges);
      window.removeEventListener("resize", handleResize);
      observer.disconnect();
    };
  }, [hydrated, session]);

  useEffect(() => {
    const navigation = workspaceNavRef.current;
    const activeTab = navigation?.querySelector<HTMLElement>(`#workspace-${workspaceView}-tab`);
    if (!navigation || !activeTab) return;
    navigation.scrollTo({
      left: Math.max(0, activeTab.offsetLeft - (navigation.clientWidth - activeTab.offsetWidth) / 2),
      behavior: "smooth",
    });
  }, [workspaceView]);

  const handleWorkspaceTabKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'));
    const currentIndex = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (currentIndex < 0) return;
    event.preventDefault();
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    tabs[nextIndex]?.focus();
    tabs[nextIndex]?.click();
  };

  const salespeople = useMemo(
    () => team.filter((person) => person.active).map((person) => person.normalizedName),
    [team],
  );
  const canManage = session?.roles.includes("admin") ?? false;
  const canAccessField =
    session?.roles.some((role) => role === "admin" || role === "salesperson") ??
    false;
  const canUseCommerce =
    session?.roles.some((role) => role === "admin" || role === "operations_staff") ??
    false;
  const canUseShop =
    (session?.roles.includes("retailer") && session.dealerId !== null) ?? false;
  const pincodes = useMemo(
    () => [...new Set(dealers.map((dealer) => dealer.pincode))].sort(),
    [dealers],
  );
  const areas = useMemo(
    () => [...new Set(dealers.map((dealer) => dealer.area))].sort(),
    [dealers],
  );

  const mapDealers = useMemo(() => {
    return filterDealerRecords(dealers, {
      query: deferredQuery,
      salespeople: activePeople,
      state: stateFilter,
      quality: "all",
      pincode: pincodeFilter,
      area: areaFilter,
    });
  }, [
    activePeople,
    areaFilter,
    dealers,
    pincodeFilter,
    deferredQuery,
    stateFilter,
  ]);
  const mapSidebarFilterKey = dealerFilterKey({ query: deferredQuery, salespeople: activePeople, state: stateFilter, quality: "all", pincode: pincodeFilter, area: areaFilter });
  const mapSidebarLimit =
    mapSidebarExpansion.filterKey === mapSidebarFilterKey
      ? mapSidebarExpansion.limit
      : 50;
  const sortedMapDealers = useMemo(() =>
      [...mapDealers].sort(
          (a, b) =>
            a.dealer.localeCompare(b.dealer) ||
            a.area.localeCompare(b.area) ||
            a.pincode.localeCompare(b.pincode) ||
            a.id - b.id,
        ), [mapDealers]);
  const mapSidebarDealers = useMemo(() => sortedMapDealers.slice(0, mapSidebarLimit), [sortedMapDealers, mapSidebarLimit]);
  const selectedDealer =
    dealers.find((dealer) => dealer.id === selectedId) ?? null;
  const uniquePins = new Set(dealers.map((dealer) => dealer.pincode)).size;

  const selectDealer = (dealer: DealerSummary) => {
    setSelectedActivity(null);
    setActivityError(null);
    setSelectedId(dealer.id);
    setFocusRequest(dealer);
    showWorkspace("map");
  };

  const togglePerson = (person: string) => {
    setMapSidebarExpansion({ filterKey: "", limit: 50 });
    setFilterRevision((value) => value + 1);
    setActivePeople((current) =>
      current.includes(person)
        ? current.filter((item) => item !== person)
        : [...current, person],
    );
  };

  const showAllPeople = () => { setMapSidebarExpansion({ filterKey: "", limit: 50 }); setFilterRevision((value) => value + 1); setActivePeople(salespeople); };
  const clearAllPeople = () => { setMapSidebarExpansion({ filterKey: "", limit: 50 }); setFilterRevision((value) => value + 1); setActivePeople([]); };
  const hasPeopleFilter =
    canManage &&
    (activePeople.length !== salespeople.length ||
      salespeople.some((person) => !activePeople.includes(person)));
  const mapActiveFilterCount =
    Number(Boolean(query.trim())) +
    Number(hasPeopleFilter) +
    Number(stateFilter !== "all") +
    Number(pincodeFilter !== "all") +
    Number(areaFilter !== "all");
  const directoryActiveFilterCount =
    mapActiveFilterCount + Number(canManage && qualityFilter !== "all");
  const resetMapFilters = () => {
    setMapSidebarExpansion({ filterKey: "", limit: 50 });
    setFilterRevision((value) => value + 1);
    setQuery("");
    setActivePeople(salespeople);
    setStateFilter("all");
    setPincodeFilter("all");
    setAreaFilter("all");
  };
  const resetDirectoryFilters = () => {
    resetMapFilters();
    setQualityFilter("all");
  };
  const copyViewLink = async (view: "map" | "dealers") => {
    const filters: DealerFilters = {
      query,
      salespeople: activePeople,
      state: stateFilter,
      quality: qualityFilter,
      pincode: pincodeFilter,
      area: areaFilter,
    };
    try {
      const url = writeDealerViewUrl(new URL(window.location.href), view, filters, salespeople);
      await navigator.clipboard.writeText(url.toString());
      toast.success("View link copied. The recipient still needs access to this workspace.");
    } catch {
      toast.error("Could not copy the view link.");
    }
  };
  const sharedFilterControls = {
    showSalespersonFilter: canManage,
    query,
    onQueryChange: (value: string) => { setMapSidebarExpansion({ filterKey: "", limit: 50 }); setFilterRevision((current) => current + 1); setQuery(value); },
    salespeople,
    activePeople,
    onTogglePerson: togglePerson,
    onShowAll: showAllPeople,
    onClearAll: clearAllPeople,
    stateFilter,
    onStateFilterChange: (value: StateFilter) => { setMapSidebarExpansion({ filterKey: "", limit: 50 }); setFilterRevision((current) => current + 1); setStateFilter(value); },
    qualityFilter,
    onQualityFilterChange: (value: QualityFilter) => { setFilterRevision((current) => current + 1); setQualityFilter(value); },
    pincodeFilter,
    onPincodeFilterChange: (value: string) => { setMapSidebarExpansion({ filterKey: "", limit: 50 }); setFilterRevision((current) => current + 1); setPincodeFilter(value); },
    areaFilter,
    onAreaFilterChange: (value: string) => { setMapSidebarExpansion({ filterKey: "", limit: 50 }); setFilterRevision((current) => current + 1); setAreaFilter(value); },
    pincodes,
    areas,
  };
  const mapFilterControls: DealerFilterControlProps = {
    ...sharedFilterControls,
    showQualityFilter: false,
    activeFilterCount: mapActiveFilterCount,
    onResetFilters: resetMapFilters,
    onCopyView: () => void copyViewLink("map"),
  };
  const dealerFilterControls: DealerFilterControlProps = {
    ...sharedFilterControls,
    showQualityFilter: canManage,
    activeFilterCount: directoryActiveFilterCount,
    onResetFilters: resetDirectoryFilters,
    onCopyView: () => void copyViewLink("dealers"),
  };

  const addDealer = async (dealer: Omit<Dealer, "id">) => {
    try {
      const next = await createDealer(dealer);
      setDealers((current) => [...current, next]);
      setActivePeople((current) => [...new Set([...current, next.salesperson])]);
      selectDealer(next);
      if (next.reviewNote) {
        toast.warning(`${next.dealer} added and needs postal review.`);
      } else {
        toast.success(`${next.dealer} added and verified.`);
      }
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Dealer could not be added.");
      return false;
    }
  };

  const importDealers = async (incoming: Array<Omit<Dealer, "id">>) => {
    const result = await createDealers(incoming);
    if (result.created.length) {
      setDealers((current) => [...current, ...result.created]);
      setActivePeople((current) => [
        ...new Set([
          ...current,
          ...result.created.map((dealer) => dealer.salesperson),
        ]),
      ]);
    }
    if (result.skipped) {
      const owners = [
        ...new Set(
          result.conflicts
            .map((conflict) => conflict.salesperson)
            .filter((owner): owner is string => Boolean(owner)),
        ),
      ];
      toast.warning(
        `${result.skipped} existing dealer${result.skipped === 1 ? " was" : "s were"} not duplicated${owners.length ? ` (currently assigned to ${owners.join(", ")})` : ""}. Reassign ${result.skipped === 1 ? "it" : "them"} from Dealers or Team.`,
      );
    }
    return result.created.length;
  };

  const updateDealer = async (updated: Dealer) => {
    const pendingDelete = pendingDealerDeletes.current.get(updated.id);
    if (pendingDelete !== undefined) {
      window.clearTimeout(pendingDelete);
      pendingDealerDeletes.current.delete(updated.id);
      toast.message("Pending deletion cancelled because this dealer is being edited.");
    }
    try {
      const saved = await saveDealer(updated);
      setDealers((current) =>
        current.map((dealer) => (dealer.id === saved.id ? saved : dealer)),
      );
      setFocusRequest((current) => (current?.id === saved.id ? saved : current));
      toast.success(`${saved.dealer} updated.`);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Dealer could not be updated.");
      return false;
    }
  };

  const deleteDealer = async (dealerToDelete: DealerSummary) => {
    if (pendingDealerDeletes.current.has(dealerToDelete.id)) return;
    // Keep the original database identity intact during the undo window. A
    // delete-and-recreate loses the dealer ID and related route settings.
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      pendingDealerDeletes.current.delete(dealerToDelete.id);
      if (cancelled) return;
      try {
        await removeDealer(dealerToDelete.id);
        setDealers((current) => current.filter((dealer) => dealer.id !== dealerToDelete.id));
        setSelectedId((current) => current === dealerToDelete.id ? null : current);
        setFocusRequest((current) => current?.id === dealerToDelete.id ? null : current);
        toast.success(`${dealerToDelete.dealer} deleted.`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Dealer could not be deleted.");
      }
    }, 10_000);
    pendingDealerDeletes.current.set(dealerToDelete.id, timeout);
    toast.message(`${dealerToDelete.dealer} will be deleted in 10 seconds.`, {
      duration: 10_000,
      action: {
        label: "Undo",
        onClick: () => {
          cancelled = true;
          window.clearTimeout(timeout);
          pendingDealerDeletes.current.delete(dealerToDelete.id);
          toast.success(`${dealerToDelete.dealer} kept.`);
        },
      },
    });
  };

  useEffect(() => {
    const context = (
      document as Document & { modelContext?: WebMcpContext }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();

    void Promise.resolve(
      context.registerTool(
        {
          name: "list_dealers",
          title: "List dealers",
          description:
            "Return the current dealer records and salesperson assignments displayed in the territory map.",
          inputSchema: {
            type: "object",
            properties: {
              salesperson: { type: "string" },
              state: {
                type: "string",
                enum: [...INDIAN_STATES],
              },
            },
            additionalProperties: false,
          },
          annotations: {
            readOnlyHint: true,
            untrustedContentHint: true,
          },
          execute(input) {
            const filters = (input ?? {}) as {
              salesperson?: string;
              state?: Dealer["state"];
            };
            const records = dealers.filter(
              (dealer) =>
                (!filters.salesperson ||
                  dealer.salesperson === filters.salesperson.toUpperCase()) &&
                (!filters.state || dealer.state === filters.state),
            );
            return { count: records.length, dealers: records };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);

    if (!canManage) return () => lifecycle.abort();

    void Promise.resolve(
      context.registerTool(
        {
          name: "add_dealer",
          title: "Add dealer",
          description:
            "Validate and add one dealer. A full address creates an address-level map pin; otherwise the PIN-code location is used.",
          inputSchema: {
            type: "object",
            properties: {
              salesperson: { type: "string" },
              dealer: { type: "string" },
              pincode: { type: "string", pattern: "^\\d{6}$" },
              area: { type: "string" },
              address: { type: "string" },
              state: {
                type: "string",
                enum: [...INDIAN_STATES],
              },
            },
            required: ["salesperson", "dealer", "pincode", "area", "state"],
            additionalProperties: false,
          },
          annotations: {
            readOnlyHint: false,
            untrustedContentHint: false,
          },
          async execute(input) {
            const candidate = input as {
              salesperson?: string;
              dealer?: string;
              pincode?: string;
              area?: string;
              address?: string;
              state?: Dealer["state"];
            };
            if (
              !candidate.salesperson?.trim() ||
              !candidate.dealer?.trim() ||
              !candidate.area?.trim() ||
              !candidate.state ||
              !candidate.pincode ||
              !/^\d{6}$/.test(candidate.pincode)
            ) {
              throw new Error("All fields and a valid six-digit PIN are required.");
            }
            const [location, validation] = await Promise.all([
              locateDealer({
                address: candidate.address,
                area: candidate.area,
                pincode: candidate.pincode,
                state: candidate.state,
              }),
              validatePostalDetailsFromApp(
                candidate.pincode,
                candidate.state,
                candidate.area,
              ),
            ]);
            if (validation.status === "invalid") {
              throw new Error(validation.message);
            }
            if (!location) {
              throw new Error(
                candidate.address?.trim()
                  ? "Full address could not be matched inside the entered PIN code."
                  : "PIN code could not be located.",
              );
            }
            const next = await createDealer({
              salesperson: candidate.salesperson.trim().toUpperCase(),
              dealer: candidate.dealer.trim().toUpperCase(),
              pincode: candidate.pincode,
              area: canonicalizeAreaName(candidate.area),
              sourceArea: candidate.area.trim(),
              address: candidate.address?.trim() || undefined,
              state: candidate.state,
              longitude: location.coordinates[0],
              latitude: location.coordinates[1],
              locationPrecision: location.precision,
              geocodedAddress: location.resolvedAddress,
              ...postalValidationFields(validation),
            });
            setDealers((current) => [...current, next]);
            setActivePeople((current) => [
              ...new Set([...current, next.salesperson]),
            ]);
            setSelectedId(next.id);
            setFocusRequest(next);
            return {
              id: next.id,
              status: "added",
              dealer: next.dealer,
              locationPrecision: next.locationPrecision,
            };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);

    return () => lifecycle.abort();
  }, [canManage, dealers]);

  if (hydrated && bootstrapError) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f7f3ea] px-6">
        <div role="alert" className="max-w-md rounded-2xl border bg-white p-6 text-center">
          <p className="font-semibold">Workspace could not load</p>
          <p className="mt-2 text-sm text-[#6f6a65]">{bootstrapError}</p>
          <Button className="mt-4" onClick={() => {
            invalidateWorkspaceBootstraps();
            setBootstrapError(null);
            setBootstrapRetry((value) => value + 1);
          }}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <main className="h-[100svh] overflow-hidden bg-[#f7f3ea] text-[#252a30]">
      <header className="flex h-16 items-center justify-between border-b border-white/10 bg-[#252a44] px-3 text-white sm:px-6 lg:h-[72px]">
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#b65a38] text-white shadow-inner sm:h-10 sm:w-10">
            <MapPinned className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold tracking-[-0.01em] sm:text-lg">
              Dealer Operations
            </h1>
            <p className="truncate text-[11px] text-white/62 sm:text-xs">
              {canAccessField
                ? "India"
                : canUseShop
                  ? session?.dealer ?? "Retail ordering"
                  : "Catalog, orders, and access"}
            </p>
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-3 sm:gap-6">
          {canAccessField ? <div className="hidden items-center gap-6 text-sm xl:flex">
            {canManage ? (
              <div>
                <span className="block text-[11px] uppercase tracking-[0.08em] text-white/70">
                  Salespeople
                </span>
                <span className="font-semibold">{salespeople.length}</span>
              </div>
            ) : null}
            <div>
              <span className="block text-[11px] uppercase tracking-[0.08em] text-white/70">
                {canManage ? "Dealers" : "My dealers"}
              </span>
              <span className="font-semibold">{dealers.length}</span>
            </div>
            <div>
              <span className="block text-[11px] uppercase tracking-[0.08em] text-white/70">
                PIN codes
              </span>
              <span className="font-semibold">{uniquePins}</span>
            </div>
          </div> : null}
          {session ? (
            <div className="min-w-0 text-right leading-tight">
              <span className="block max-w-24 truncate text-xs font-semibold sm:hidden">
                @{session.username}
              </span>
              <span className="hidden max-w-40 truncate text-xs font-semibold sm:block">
                {session.displayName}
              </span>
              <span className="block text-[11px] capitalize text-white/70">
                {session.role.replace("_", " ")}
              </span>
            </div>
          ) : null}
          <button
            type="button"
            className="grid h-11 w-11 place-items-center rounded-xl text-white/70 transition-[background-color,color,transform] hover:bg-white/10 hover:text-white active:scale-[0.96]"
            aria-label={signingOut ? "Signing out…" : "Sign out"}
            title={signingOut ? "Signing out…" : "Sign out"}
            disabled={signingOut}
            aria-busy={signingOut}
            onClick={async () => {
              if (signingOut) return;
              setSigningOut(true);
              try {
                if ("indexedDB" in window && session?.userId) {
                  try {
                    const { pendingVisits, clearPendingVisits } = await import("@/lib/offline-visits");
                    const pending = await pendingVisits(session.userId);
                    if (pending.length && !window.confirm(`${pending.length} visit updates have not synced. Sign out and discard them?`)) return;
                    await clearPendingVisits(session.userId);
                  } catch {
                    toast.error("Could not clear this device’s pending visit updates. Try again.");
                    return;
                  }
                }
                for (const timeout of pendingDealerDeletes.current.values()) window.clearTimeout(timeout);
                pendingDealerDeletes.current.clear();
                if (session?.userId) {
                  try { sessionStorage.removeItem(`dealer-ops-order-retry:${session.userId}`); } catch {}
                }
                invalidateWorkspaceBootstraps();
                const result = await authClient.signOut();
                if (result.error) {
                  toast.error("Sign out could not be completed. Please try again.");
                  return;
                }
                router.replace("/auth/sign-in");
                router.refresh();
              } catch {
                toast.error("Sign out could not be completed. Please try again.");
              } finally {
                setSigningOut(false);
              }
            }}
          >
            {signingOut
              ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              : <LogOut className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
      </header>

      <div className="relative overflow-hidden border-b border-[#ded7cc] bg-white">
      <nav
        ref={workspaceNavRef}
        role="tablist"
        onKeyDown={handleWorkspaceTabKeyDown}
        className="flex h-14 scroll-px-10 items-center gap-1.5 overflow-x-auto p-1.5 pr-11 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:h-12 lg:justify-center lg:gap-1 lg:px-6 lg:py-1.5"
        aria-label="Workspace view"
      >
        {canAccessField ? <>
          <button
            id="workspace-map-tab"
            role="tab"
            type="button"
            tabIndex={workspaceView === "map" ? 0 : -1}
            aria-selected={workspaceView === "map"}
            aria-controls="map-workspace"
            onClick={() => showWorkspace("map")}
            className={
              "flex min-h-11 min-w-24 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-[transform,background-color,color,box-shadow] active:scale-[0.98] lg:h-9 lg:min-h-0 lg:w-32 lg:flex-none lg:rounded-lg " +
              (workspaceView === "map"
                ? "bg-[#b65a38] text-white shadow-sm"
                : "text-[#6f6a65]")
            }
          >
            <MapIcon className="h-4 w-4" aria-hidden="true" />
            Map
          </button>
          <button
            id="workspace-dealers-tab"
            role="tab"
            type="button"
            tabIndex={workspaceView === "dealers" ? 0 : -1}
            aria-selected={workspaceView === "dealers"}
            aria-controls="dealer-directory-panel"
            onClick={() => showWorkspace("dealers")}
            className={
              "flex min-h-11 min-w-24 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-[transform,background-color,color,box-shadow] active:scale-[0.98] lg:h-9 lg:min-h-0 lg:w-32 lg:flex-none lg:rounded-lg " +
              (workspaceView === "dealers"
                ? "bg-[#b65a38] text-white shadow-sm"
                : "text-[#6f6a65]")
            }
          >
            <List className="h-4 w-4" aria-hidden="true" />
            Dealers
          </button>
          <button
            id="workspace-routes-tab"
            role="tab"
            type="button"
            tabIndex={workspaceView === "routes" ? 0 : -1}
            aria-selected={workspaceView === "routes"}
            aria-controls="routes-workspace-panel"
            onClick={() => showWorkspace("routes")}
            className={
              "flex min-h-11 min-w-24 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-[transform,background-color,color,box-shadow] active:scale-[0.98] lg:h-9 lg:min-h-0 lg:w-32 lg:flex-none lg:rounded-lg " +
              (workspaceView === "routes"
                ? "bg-[#b65a38] text-white shadow-sm"
                : "text-[#6f6a65]")
            }
          >
            <RouteIcon className="h-4 w-4" aria-hidden="true" />
            {canManage ? "Activity" : "Routes"}
          </button>
        </> : null}
        {canManage && canAccessField ? (
          <button
            id="workspace-team-tab"
            role="tab"
            type="button"
            tabIndex={workspaceView === "team" ? 0 : -1}
            aria-selected={workspaceView === "team"}
            aria-controls="team-workspace-panel"
            onClick={() => showWorkspace("team")}
            className={
              "flex min-h-11 min-w-24 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-[transform,background-color,color,box-shadow] active:scale-[0.98] lg:h-9 lg:min-h-0 lg:w-32 lg:flex-none lg:rounded-lg " +
              (workspaceView === "team"
                ? "bg-[#b65a38] text-white shadow-sm"
                : "text-[#6f6a65]")
            }
          >
            <UserCog className="h-4 w-4" aria-hidden="true" />
            Team
          </button>
        ) : null}
        {canUseCommerce ? (
          <button
            id="workspace-commerce-tab"
            role="tab"
            type="button"
            tabIndex={workspaceView === "commerce" ? 0 : -1}
            aria-selected={workspaceView === "commerce"}
            aria-controls="commerce-workspace-panel"
            onClick={() => showWorkspace("commerce")}
            className={
              "flex min-h-11 min-w-28 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-[transform,background-color,color,box-shadow] active:scale-[0.98] lg:h-9 lg:min-h-0 lg:w-32 lg:flex-none lg:rounded-lg " +
              (workspaceView === "commerce"
                ? "bg-[#b65a38] text-white shadow-sm"
                : "text-[#6f6a65]")
            }
          >
            <ShoppingBag className="h-4 w-4" aria-hidden="true" />
            Commerce
          </button>
        ) : null}
        {canUseShop ? (
          <button
            id="workspace-shop-tab"
            role="tab"
            type="button"
            tabIndex={workspaceView === "shop" ? 0 : -1}
            aria-selected={workspaceView === "shop"}
            aria-controls="shop-workspace-panel"
            onClick={() => showWorkspace("shop")}
            className={
              "flex min-h-11 min-w-24 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-[transform,background-color,color,box-shadow] active:scale-[0.98] lg:h-9 lg:min-h-0 lg:w-32 lg:flex-none lg:rounded-lg " +
              (workspaceView === "shop"
                ? "bg-[#b65a38] text-white shadow-sm"
                : "text-[#6f6a65]")
            }
          >
            <Store className="h-4 w-4" aria-hidden="true" />
            Shop
          </button>
        ) : null}
      </nav>
      {workspaceNavEdges.left ? (
        <button type="button" aria-label="Show previous workspace views" onClick={() => workspaceNavRef.current?.scrollBy({ left: -180, behavior: "smooth" })} className="absolute left-1 top-1/2 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-[#ded7cc] bg-white text-[#34333a] shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#356a9a] max-lg:grid">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
      {workspaceNavEdges.right ? (
        <button type="button" aria-label="Show more workspace views" onClick={() => workspaceNavRef.current?.scrollBy({ left: 180, behavior: "smooth" })} className="absolute right-1 top-1/2 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-[#ded7cc] bg-white text-[#34333a] shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#356a9a] max-lg:grid">
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
      </div>

      {!hydrated ? <WorkspaceLoading label="Loading your workspace…" /> : null}

      {hydrated && canAccessField && openedWorkspaceViews.includes("map") ? <div
        id="map-workspace"
        role="tabpanel"
        aria-labelledby="workspace-map-tab"
        aria-hidden={workspaceView !== "map"}
        className={
          "h-[calc(100svh-120px)] min-h-0 grid-rows-[minmax(0,1fr)] grid-cols-1 overflow-hidden lg:grid-cols-[330px_minmax(0,1fr)] " +
          (workspaceView === "map" ? "grid" : "hidden")
        }
      >
        <aside
          id="map-dealer-sidebar"
          className="z-10 hidden h-full flex-col border-r border-[#ded7cc] bg-[#fffcf7] lg:flex"
        >
          <div className="border-b border-[#e3dcd2] p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between text-xs font-semibold text-[#6f6a65]">
              <span>Filters</span>
              <span>{mapDealers.length} visible</span>
            </div>
            <DealerFilterControls
              {...mapFilterControls}
              layout="sidebar"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {mapDealers.length ? (
              <ul className="space-y-1">
                {mapSidebarDealers.map((dealer) => (
                  <li key={dealer.id}>
                    <button
                      onClick={() => selectDealer(dealer)}
                      className={
                        "group flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-[transform,background-color] active:scale-[0.99] " +
                        (selectedId === dealer.id
                          ? "bg-[#f4e5de]"
                          : "hover:bg-[#f4efe8]")
                      }
                    >
                      <span
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white shadow-sm"
                        style={{
                          backgroundColor:
                            getSalespersonColor(dealer.salesperson),
                        }}
                      >
                        <Building2 className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-semibold text-[#252a30]">
                            {dealer.dealer}
                          </span>
                          {dealer.reviewNote ? (
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                          ) : null}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-[#6f6a65]">
                          {dealer.area} · {dealer.pincode}
                          {canManage ? ` · ${dealer.salesperson}` : ""}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 text-[#aaa29a] transition group-hover:translate-x-0.5" />
                    </button>
                  </li>
                ))}
                {mapDealers.length > mapSidebarDealers.length ? (
                  <li className="px-3 py-3 text-center">
                    <p className="mb-2 text-xs text-[#6f6a65]">
                      Showing {mapSidebarDealers.length} of {mapDealers.length} alphabetically
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full border-[#d6cfc4] bg-white"
                      onClick={() =>
                        setMapSidebarExpansion({
                          filterKey: mapSidebarFilterKey,
                          limit: mapSidebarLimit + 50,
                        })
                      }
                    >
                      Show {Math.min(50, mapDealers.length - mapSidebarDealers.length)} more
                    </Button>
                  </li>
                ) : null}
              </ul>
            ) : (
              <div className="grid h-48 place-items-center px-6 text-center">
                <div>
                  <CircleDot className="mx-auto mb-2 h-6 w-6 text-[#aaa29a]" />
                  <p className="text-sm font-semibold">No dealers match</p>
                  <p className="mt-1 text-xs text-[#6f6a65]">
                    Change the search or adjust the filters.
                  </p>
                </div>
              </div>
            )}
          </div>

        </aside>

        <section
          id="territory-map-panel"
          className="relative h-full min-h-0 overflow-hidden"
        >
          <TerritoryMap
            dealers={mapDealers}
            selectedState={stateFilter}
            active={workspaceView === "map"}
            selectedId={selectedId}
            onSelect={(id) => {
              const dealer = dealers.find((item) => item.id === id);
              if (dealer) selectDealer(dealer);
            }}
            focusRequest={focusRequest}
          />
          <MobileMapFilters filters={mapFilterControls} />

          {selectedDealer ? (
            <article className="absolute bottom-3 left-3 right-3 max-h-[48%] overflow-y-auto rounded-2xl border border-white/70 bg-white/95 p-4 shadow-[0_18px_44px_rgba(37,42,68,0.18)] backdrop-blur sm:bottom-auto sm:left-auto sm:right-4 sm:top-4 sm:w-[min(360px,calc(100%-32px))] sm:max-h-none sm:overflow-visible sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-[#6f6a65]">
                    Dealer
                  </p>
                  <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-[#252a30]">
                    {selectedDealer.dealer}
                  </h2>
                </div>
                <button
                  onClick={() => setSelectedId(null)}
                  className="grid h-11 w-11 place-items-center rounded-xl text-[#6f6a65] transition-[transform,background-color] hover:bg-[#f4efe8] active:scale-[0.97]"
                  aria-label="Close dealer details"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                {canManage ? (
                  <div>
                    <dt className="text-[11px] text-[#6f6a65]">Salesperson</dt>
                    <dd className="mt-0.5 flex items-center gap-2 text-sm font-semibold">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{
                          backgroundColor:
                            getSalespersonColor(selectedDealer.salesperson),
                        }}
                      />
                      {selectedDealer.salesperson}
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-[11px] text-[#6f6a65]">PIN code</dt>
                  <dd className="mt-0.5 text-sm font-semibold">
                    {selectedDealer.pincode}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-[11px] text-[#6f6a65]">Area</dt>
                  <dd className="mt-0.5 text-sm font-semibold">
                    {selectedDealer.area}, {selectedDealer.state}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-[11px] text-[#6f6a65]">Full address</dt>
                  <dd className="mt-0.5 text-sm font-semibold leading-5">
                    {selectedDealer.address ?? "Not added"}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-[11px] text-[#6f6a65]">Pin location</dt>
                  <dd className="mt-0.5 text-sm font-semibold">
                    {(selectedDealer.locationPrecision ??
                      (selectedDealer.address ? "address" : "pincode")) ===
                    "address"
                      ? "Address-level result"
                      : "Approximate PIN-code location"}
                  </dd>
                </div>
              </dl>

              <div className="mt-4 border-t border-[#e9e2d8] pt-4" aria-live="polite">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6f6a65]">Visit history</p>
                {selectedActivity?.dealerId === selectedDealer.id ? (
                  <p className="mt-2 text-sm leading-6">
                    {selectedActivity.completedVisits} completed visits · Last visit {selectedActivity.lastCompletedAt ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(selectedActivity.lastCompletedAt)) : "not recorded"}
                    <br />Next due {selectedActivity.nextDueAt ?? "not scheduled"} · Every {selectedActivity.frequencyDays} days
                  </p>
                ) : activityError === selectedDealer.id ? (
                  <Button variant="link" className="mt-1 h-11 px-0" onClick={() => { setActivityError(null); setActivityRetry((value) => value + 1); }}>Visit history unavailable · Retry</Button>
                ) : <p className="mt-2 text-sm text-[#6f6a65]">Loading visit history…</p>}
              </div>

              {selectedDealer.reviewNote ? (
                <div className="mt-4 flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{selectedDealer.reviewNote}</p>
                </div>
              ) : null}
            </article>
          ) : null}

          <div className="absolute left-4 top-4 hidden items-center gap-2 rounded-xl border border-white/70 bg-white/92 px-3 py-2 text-xs font-semibold text-[#5f5b57] shadow-sm backdrop-blur sm:flex">
            <Users className="h-4 w-4 text-[#252a44]" />
            {canManage ? "Team dealer coverage" : "My dealer coverage"}
          </div>
        </section>
      </div> : null}
      {hydrated && canAccessField && openedWorkspaceViews.includes("dealers") ? <DealerDirectory
        active={workspaceView === "dealers"}
        allDealers={dealers}
        filters={dealerFilterControls}
        onSelect={selectDealer}
        onUpdate={updateDealer}
        onDelete={deleteDealer}
        onAdd={addDealer}
        onImport={importDealers}
        onReviewResolved={(dealer) => {
          setDealers((current) => [...current, dealer]);
          setActivePeople((current) => [...new Set([...current, dealer.salesperson])]);
        }}
        pendingReviewCount={pendingDealerReviewCount}
        filterRevision={filterRevision}
        canManage={canManage}
      /> : null}
      {hydrated && canAccessField && openedWorkspaceViews.includes("routes") ? (
        <RoutesWorkspace
          active={workspaceView === "routes"}
          dealers={dealers}
          currentSalesperson={session?.salesperson ?? null}
          userId={session?.userId ?? ""}
          readOnly={canManage}
          salespeople={team}
        />
      ) : null}
      {hydrated && canManage && openedWorkspaceViews.includes("team") ? (
        <TeamWorkspace
          active={workspaceView === "team"}
          salespeople={team}
          dealers={dealers}
          onAccountUpdated={(person) => {
            setTeam((current) =>
              current.map((item) => (item.id === person.id ? person : item)),
            );
          }}
          onAccountDeleted={(person, accounts) => {
            setTeam((current) =>
              current.map((item) => (item.id === person.id ? person : item)),
            );
            setCommerce((current) =>
              current ? { ...current, accounts } : current,
            );
          }}
          onDealersAssigned={(nextDealers) => {
            setDealers(nextDealers);
            setFocusRequest((current) =>
              current
                ? nextDealers.find((dealer) => dealer.id === current.id) ?? null
                : null,
            );
          }}
          onCreated={(person) => {
            setTeam((current) => {
              const without = current.filter((item) => item.id !== person.id);
              return [...without, person].sort((a, b) =>
                a.displayName.localeCompare(b.displayName),
              );
            });
            setActivePeople((current) => [
              ...new Set([...current, person.normalizedName]),
            ]);
          }}
        />
      ) : null}
      {canUseCommerce && openedWorkspaceViews.includes("commerce") ? (
        <section
          id="commerce-workspace-panel"
          role="tabpanel"
          hidden={workspaceView !== "commerce"}
          aria-labelledby="workspace-commerce-tab"
          className="h-[calc(100svh-120px)] overflow-y-auto bg-[#f7f3ea]"
        >
          {commerce ? (
            <CommerceWorkspace
              products={commerce.products}
              categories={commerce.categories}
              initialOrders={commerce.orders}
              stats={commerce.stats}
              initialAccounts={commerce.accounts}
              dealerOptions={dealers.map((dealer) => ({
                id: dealer.id,
                name: dealer.dealer,
                pincode: dealer.pincode,
              }))}
              isAdmin={canManage}
              active={workspaceView === "commerce"}
              onAccountsChange={(accounts) =>
                setCommerce((current) =>
                  current ? { ...current, accounts } : current,
                )
              }
            />
          ) : commerceError ? (
            <div role="alert" className="p-6 text-sm">
              <p>{commerceError}</p>
              <Button className="mt-3" onClick={() => {
                invalidateWorkspaceBootstraps();
                setCommerceError(null);
                setCommerceRetry((value) => value + 1);
              }}>Retry commerce</Button>
            </div>
          ) : <WorkspaceLoading label="Loading commerce operations…" />}
        </section>
      ) : null}
      {canUseShop && openedWorkspaceViews.includes("shop") ? (
        <section
          id="shop-workspace-panel"
          role="tabpanel"
          hidden={workspaceView !== "shop"}
          aria-labelledby="workspace-shop-tab"
          className="h-[calc(100svh-120px)] overflow-y-auto bg-[#f7f3ea]"
        >
          {shop ? (
            <ShopWorkspace products={shop.products} initialOrders={shop.orders} userId={session?.userId ?? ""} />
          ) : shopError ? (
            <div role="alert" className="p-6 text-sm">
              <p>{shopError}</p>
              <Button className="mt-3" onClick={() => {
                invalidateWorkspaceBootstraps();
                setShopError(null);
                setShopRetry((value) => value + 1);
              }}>Retry shop</Button>
            </div>
          ) : <WorkspaceLoading label="Loading your shop…" />}
        </section>
      ) : null}
      <Toaster position="top-center" richColors />
    </main>
  );
}
