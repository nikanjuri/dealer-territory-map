"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
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
  SlidersHorizontal,
  Trash2,
  Upload,
  Users,
  UserCog,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { toast } from "sonner";
import { importGoogleMapsLibrary } from "@/lib/google-maps-loader";
import {
  INITIAL_DEALERS,
  getSalespersonColor,
  type Dealer,
} from "./dealers";
import {
  loadPostalDirectory,
  validatePostalDetails,
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
  type QualityFilter,
  type StateFilter,
} from "@/lib/dealer-filters";
import {
  createDealer,
  createDealers,
  removeDealer,
  saveDealer,
} from "@/lib/dealer-api";
import { authClient } from "@/lib/auth-client";
import { RoutesWorkspace } from "@/components/routes-workspace";
import { TeamWorkspace } from "@/components/team-workspace";
import type { AppSession, SalespersonAccount } from "@/lib/access-contract";
import {
  ApiRequestError,
  fetchWorkspaceBootstrap,
} from "@/lib/session-api";

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

type PincodeBoundaryData = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: Record<string, string | number | boolean | null>;
    geometry: {
      type: "Polygon" | "MultiPolygon";
      coordinates: number[][][] | number[][][][];
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

const PIN_COORDINATES: Record<string, [number, number]> = Object.fromEntries(
  INITIAL_DEALERS.map((dealer) => [
    dealer.pincode,
    [dealer.longitude, dealer.latitude],
  ]),
);

const PIN_BOUNDARY_SERVICE =
  "https://livingatlas.esri.in/server1/rest/services/India/Pincode_Boundary_2025/MapServer/0/query";

async function fetchPincodeBoundaries(
  pincodes: string[],
  signal?: AbortSignal,
): Promise<PincodeBoundaryData> {
  const safePincodes = [...new Set(pincodes.filter((pin) => /^\d{6}$/.test(pin)))];
  if (!safePincodes.length) return { type: "FeatureCollection", features: [] };
  const parameters = new URLSearchParams({
    where:
      "pin_code IN (" + safePincodes.map((pin) => `'${pin}'`).join(",") + ")",
    outFields: "pin_code,fname,state,circle,region,division",
    returnGeometry: "true",
    outSR: "4326",
    f: "geojson",
  });
  const response = await fetch(PIN_BOUNDARY_SERVICE + "?" + parameters, {
    signal,
  });
  if (!response.ok) throw new Error("PIN boundaries could not be loaded.");
  return (await response.json()) as PincodeBoundaryData;
}

async function locateDealer({
  address,
  area,
  pincode,
  state,
}: Pick<Dealer, "address" | "area" | "pincode" | "state">) {
  return geocodeDealerLocation({
    address,
    area,
    pincode,
    state,
    pincodeFallback: PIN_COORDINATES[pincode],
  });
}

function makeCoverageData(
  boundaries: PincodeBoundaryData | null,
  dealers: Dealer[],
): MapData {
  const dealersByPincode = new Map<string, Dealer[]>();
  for (const dealer of dealers) {
    dealersByPincode.set(dealer.pincode, [
      ...(dealersByPincode.get(dealer.pincode) ?? []),
      dealer,
    ]);
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
      const salesperson = conflict ? "Multiple salespeople" : salespeople[0];
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

function makeDealerData(dealers: Dealer[]): MapData {
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
        locationPrecision:
          dealer.locationPrecision ?? (dealer.address ? "address" : "pincode"),
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

function MapLibreTerritoryMap({
  dealers,
  selectedId,
  onSelect,
  focusRequest,
}: {
  dealers: Dealer[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  focusRequest: Dealer | null;
}) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onSelectRef = useRef(onSelect);
  const dealersRef = useRef(dealers);
  const fittedInitialCoverageRef = useRef(false);
  const unavailablePinsRef = useRef(new Set<string>());
  const [ready, setReady] = useState(false);
  const [boundariesLoaded, setBoundariesLoaded] = useState(false);
  const [boundaries, setBoundaries] = useState<PincodeBoundaryData | null>(null);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    dealersRef.current = dealers;
  }, [dealers]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/pincode-boundaries.geojson", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Initial PIN boundaries failed to load.");
        return response.json() as Promise<PincodeBoundaryData>;
      })
      .then((data) => setBoundaries(data))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        toast.error("PIN-code boundaries could not be loaded.");
      })
      .finally(() => setBoundariesLoaded(true));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!boundariesLoaded) return;
    const knownPins = new Set(
      (boundaries?.features ?? []).map((feature) =>
        String(feature.properties.pin_code ?? ""),
      ),
    );
    const missingPins = [
      ...new Set(
        dealers
          .map((dealer) => dealer.pincode)
          .filter(
            (pincode) =>
              !knownPins.has(pincode) &&
              !unavailablePinsRef.current.has(pincode),
          ),
      ),
    ];
    if (!missingPins.length) return;

    const controller = new AbortController();
    void fetchPincodeBoundaries(missingPins, controller.signal)
      .then((incoming) => {
        const returnedPins = new Set(
          incoming.features.map((feature) =>
            String(feature.properties.pin_code ?? ""),
          ),
        );
        for (const pincode of missingPins) {
          if (!returnedPins.has(pincode)) unavailablePinsRef.current.add(pincode);
        }
        if (!incoming.features.length) return;
        setBoundaries((current) => ({
          type: "FeatureCollection",
          features: [...(current?.features ?? []), ...incoming.features],
        }));
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        for (const pincode of missingPins) unavailablePinsRef.current.add(pincode);
        toast.error("A new PIN boundary could not be loaded.");
      });
    return () => controller.abort();
  }, [boundaries, boundariesLoaded, dealers]);

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
          data: "/region-boundaries.geojson",
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
        setReady(true);
      });
    });

    return () => {
      active = false;
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    (mapRef.current.getSource("coverage") as GeoJSONSource)?.setData(
      makeCoverageData(boundaries, dealers) as never,
    );
    (mapRef.current.getSource("dealers") as GeoJSONSource)?.setData(
      makeDealerData(dealers) as never,
    );
  }, [boundaries, dealers, ready]);

  useEffect(() => {
    if (
      !ready ||
      !mapRef.current ||
      !boundaries ||
      fittedInitialCoverageRef.current
    ) {
      return;
    }
    const bounds = getCoverageBounds(makeCoverageData(boundaries, dealers));
    if (!bounds) return;
    fittedInitialCoverageRef.current = true;
    mapRef.current.fitBounds(bounds, {
      padding: { top: 56, right: 48, bottom: 56, left: 48 },
      maxZoom: 8.25,
      duration: 0,
    });
  }, [boundaries, dealers, ready]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    mapRef.current.setPaintProperty("dealer-points", "circle-radius", [
      "case",
      ["==", ["get", "id"], selectedId ?? -1],
      10,
      7,
    ]);
  }, [ready, selectedId]);

  useEffect(() => {
    if (!focusRequest || !mapRef.current) return;
    mapRef.current.flyTo({
      center: [focusRequest.longitude, focusRequest.latitude],
      zoom: 10.5,
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : 850,
    });
  }, [focusRequest]);

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-[#e5e8e4] lg:min-h-[480px]">
      <div
        ref={mapContainer}
        className="absolute inset-0"
        style={{ position: "absolute", inset: 0 }}
        aria-label="Dealer territory map"
      />
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="absolute left-3 top-16 inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/75 bg-white/94 px-3 text-[11px] font-semibold text-[#46514d] shadow-[0_8px_24px_rgba(25,38,34,0.13)] backdrop-blur transition-[transform,background-color] active:scale-[0.97] hover:bg-white sm:bottom-5 sm:left-5 sm:top-auto"
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
          className="w-[min(320px,calc(100vw-24px))] rounded-xl border-white/70 bg-white/96 p-4 text-[#26312e] shadow-[0_16px_42px_rgba(23,58,52,0.2)] backdrop-blur"
        >
          <p className="text-sm font-semibold">PIN-code coverage</p>
          <p className="mt-1.5 text-xs leading-5 text-[#65706c]">
            Colored polygons show salesperson assignments by postal PIN boundary.
            Grey polygons have no dealer assignment in the current data.
          </p>
          <div className="mt-3 flex items-center gap-2 border-t border-[#e2e6e3] pt-3 text-xs text-[#596560]">
            <span className="h-3 w-3 shrink-0 rounded-sm border border-[#7d8884] bg-[#c9cecb]" />
            Grey means unassigned
          </div>
          <p className="mt-2 text-[10px] leading-4 text-[#89928e]">
            Boundary source: Department of Posts via OGD India / Esri India
          </p>
        </PopoverContent>
      </Popover>
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
}: {
  dealers: Dealer[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  focusRequest: Dealer | null;
  apiKey: string;
  onProviderError: () => void;
}) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const stateBoundariesRef = useRef<MapData | null>(null);
  const onSelectRef = useRef(onSelect);
  const dealersRef = useRef(dealers);
  const fittedInitialCoverageRef = useRef(false);
  const unavailablePinsRef = useRef(new Set<string>());
  const [ready, setReady] = useState(false);
  const [boundariesLoaded, setBoundariesLoaded] = useState(false);
  const [boundaries, setBoundaries] = useState<PincodeBoundaryData | null>(null);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    dealersRef.current = dealers;
  }, [dealers]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetch("/pincode-boundaries.geojson", { signal: controller.signal }).then(
        (response) => {
          if (!response.ok) throw new Error("Initial PIN boundaries failed to load.");
          return response.json() as Promise<PincodeBoundaryData>;
        },
      ),
      fetch("/region-boundaries.geojson", { signal: controller.signal }).then(
        (response) => {
          if (!response.ok) throw new Error("State boundaries failed to load.");
          return response.json() as Promise<MapData>;
        },
      ),
    ])
      .then(([pincodeData, stateData]) => {
        setBoundaries(pincodeData);
        stateBoundariesRef.current = stateData;
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        toast.error("Coverage boundaries could not be loaded.");
      })
      .finally(() => setBoundariesLoaded(true));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!boundariesLoaded) return;
    const knownPins = new Set(
      (boundaries?.features ?? []).map((feature) =>
        String(feature.properties.pin_code ?? ""),
      ),
    );
    const missingPins = [
      ...new Set(
        dealers
          .map((dealer) => dealer.pincode)
          .filter(
            (pincode) =>
              !knownPins.has(pincode) &&
              !unavailablePinsRef.current.has(pincode),
          ),
      ),
    ];
    if (!missingPins.length) return;

    const controller = new AbortController();
    void fetchPincodeBoundaries(missingPins, controller.signal)
      .then((incoming) => {
        const returnedPins = new Set(
          incoming.features.map((feature) =>
            String(feature.properties.pin_code ?? ""),
          ),
        );
        for (const pincode of missingPins) {
          if (!returnedPins.has(pincode)) unavailablePinsRef.current.add(pincode);
        }
        if (!incoming.features.length) return;
        setBoundaries((current) => ({
          type: "FeatureCollection",
          features: [...(current?.features ?? []), ...incoming.features],
        }));
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        for (const pincode of missingPins) unavailablePinsRef.current.add(pincode);
        toast.error("A new PIN boundary could not be loaded.");
      });
    return () => controller.abort();
  }, [boundaries, boundariesLoaded, dealers]);

  useEffect(() => {
    let active = true;
    void importGoogleMapsLibrary(apiKey, "maps")
      .then(({ Map }) => {
        if (!active || !mapContainer.current) return;
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
        });
        map.data.addListener("click", (event: google.maps.Data.MouseEvent) => {
          const pincode = String(event.feature.getProperty("pincode") ?? "");
          const dealer = dealersRef.current.find(
            (candidate) => candidate.pincode === pincode,
          );
          if (dealer) onSelectRef.current(dealer.id);
        });
        mapRef.current = map;
        setReady(true);
      })
      .catch(() => {
        if (!active) return;
        toast.error("Google Maps could not load. Using the OpenStreetMap fallback.");
        onProviderError();
      });

    return () => {
      active = false;
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current = [];
      if (mapRef.current) google.maps.event.clearInstanceListeners(mapRef.current);
      mapRef.current = null;
    };
  }, [apiKey, onProviderError]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;

    map.data.forEach((feature) => map.data.remove(feature));
    const stateData = stateBoundariesRef.current;
    if (stateData) {
      map.data.addGeoJson({
        ...stateData,
        features: stateData.features.map((feature) => ({
          ...feature,
          properties: { ...feature.properties, layerKind: "state" },
        })),
      } as never);
    }
    map.data.addGeoJson({
      ...makeCoverageData(boundaries, dealers),
      features: makeCoverageData(boundaries, dealers).features.map((feature) => ({
        ...feature,
        properties: { ...feature.properties, layerKind: "coverage" },
      })),
    } as never);
    map.data.setStyle((feature) => {
      if (feature.getProperty("layerKind") === "state") {
        return {
          fillColor: "#a9b0ad",
          fillOpacity: 0.22,
          strokeColor: "#53605b",
          strokeOpacity: 0.75,
          strokeWeight: 1.5,
          clickable: false,
        };
      }
      return {
        fillColor: String(feature.getProperty("color") ?? "#a9b0ad"),
        fillOpacity: 0.46,
        strokeColor: String(feature.getProperty("outlineColor") ?? "#53605b"),
        strokeOpacity: 0.95,
        strokeWeight: 2,
        clickable: true,
      };
    });

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = dealers.map((dealer) => {
      const marker = new google.maps.Marker({
        map,
        position: { lat: dealer.latitude, lng: dealer.longitude },
        title: `${dealer.dealer} · ${dealer.area} · ${dealer.pincode}`,
        zIndex: dealer.id === selectedId ? 20 : 10,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: getSalespersonColor(dealer.salesperson),
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeOpacity: 1,
          strokeWeight: 2.5,
          scale: dealer.id === selectedId ? 10 : 7,
        },
      });
      marker.addListener("click", () => onSelectRef.current(dealer.id));
      return marker;
    });

    if (boundaries && !fittedInitialCoverageRef.current) {
      const coverageBounds = getCoverageBounds(makeCoverageData(boundaries, dealers));
      if (coverageBounds) {
        const bounds = new google.maps.LatLngBounds(
          { lat: coverageBounds[0][1], lng: coverageBounds[0][0] },
          { lat: coverageBounds[1][1], lng: coverageBounds[1][0] },
        );
        map.fitBounds(bounds, 48);
        fittedInitialCoverageRef.current = true;
      }
    }
  }, [boundaries, dealers, ready, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!focusRequest || !map) return;
    map.panTo({ lat: focusRequest.latitude, lng: focusRequest.longitude });
    map.setZoom(11);
  }, [focusRequest]);

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-[#e5e8e4] lg:min-h-[480px]">
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
          className="absolute left-3 top-16 inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/75 bg-white/94 px-3 text-[11px] font-semibold text-[#46514d] shadow-[0_8px_24px_rgba(25,38,34,0.13)] backdrop-blur transition-[transform,background-color] active:scale-[0.97] hover:bg-white sm:bottom-5 sm:left-5 sm:top-auto"
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
        className="w-[min(320px,calc(100vw-24px))] rounded-xl border-white/70 bg-white/96 p-4 text-[#26312e] shadow-[0_16px_42px_rgba(23,58,52,0.2)] backdrop-blur"
      >
        <p className="text-sm font-semibold">PIN-code coverage</p>
        <p className="mt-1.5 text-xs leading-5 text-[#65706c]">
          Colored polygons show salesperson assignments by postal PIN boundary.
          Grey polygons have no dealer assignment in the current data.
        </p>
        <div className="mt-3 flex items-center gap-2 border-t border-[#e2e6e3] pt-3 text-xs text-[#596560]">
          <span className="h-3 w-3 shrink-0 rounded-sm border border-[#7d8884] bg-[#c9cecb]" />
          Grey means unassigned
        </div>
        <p className="mt-2 text-[10px] leading-4 text-[#89928e]">
          Boundary source: Department of Posts via OGD India / Esri India
        </p>
      </PopoverContent>
    </Popover>
  );
}

function TerritoryMap(props: {
  dealers: Dealer[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  focusRequest: Dealer | null;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [providerFailed, setProviderFailed] = useState(false);
  const handleProviderError = useMemo(() => () => setProviderFailed(true), []);

  if (apiKey && !providerFailed) {
    return (
      <GoogleTerritoryMap
        {...props}
        apiKey={apiKey}
        onProviderError={handleProviderError}
      />
    );
  }
  return <MapLibreTerritoryMap {...props} />;
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
  const [state, setState] = useState<Dealer["state"]>("Telangana");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!dealer.trim() || !area.trim() || !/^\d{6}$/.test(pincode)) {
      toast.error("Enter a dealer, area and valid 6-digit PIN code.");
      return;
    }
    setSaving(true);
    const [location, validation] = await Promise.all([
      locateDealer({ address, area, pincode, state }),
      validatePostalDetailsFromApp(pincode, state, area),
    ]);
    if (validation.status === "invalid") {
      setSaving(false);
      toast.error(validation.message);
      return;
    }
    if (!location) {
      setSaving(false);
      toast.error(
        address.trim()
          ? "That full address could not be matched inside the entered PIN code. Check it and try again."
          : "That PIN code could not be located. Check it and try again.",
      );
      return;
    }
    const added = await onAdd({
      salesperson,
      dealer: dealer.trim().toUpperCase(),
      pincode,
      area: area.trim().toUpperCase(),
      address: address.trim() || undefined,
      state,
      longitude: location.coordinates[0],
      latitude: location.coordinates[1],
      locationPrecision: location.precision,
      geocodedAddress: location.resolvedAddress,
      ...postalValidationFields(validation),
    });
    setSaving(false);
    if (!added) return;
    setDealer("");
    setPincode("");
    setArea("");
    setAddress("");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          aria-label="Add dealer"
          className="h-10 w-10 rounded-xl bg-[#d9f36b] p-0 text-[#173a34] transition-[transform,background-color] active:scale-[0.97] hover:bg-[#cce960] sm:h-9 sm:w-auto sm:rounded-lg sm:px-3"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Add dealer</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-24px)] overflow-y-auto rounded-2xl border-[#d9dedb] bg-white text-[#18221f] shadow-[0_24px_70px_rgba(15,31,27,0.24)] sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-xl tracking-[-0.02em] text-[#18221f]">
            Add a dealer
          </DialogTitle>
          <DialogDescription className="leading-6 text-[#66716d]">
            Add a full street address for an address-level map pin. Without one,
            the pin remains an approximate PIN-code location.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="dealer-name" className="text-[#35413d]">
                Dealer name
              </Label>
              <Input
                id="dealer-name"
                value={dealer}
                onChange={(event) => setDealer(event.target.value)}
                placeholder="Sri Lakshmi Textiles"
                autoFocus
                className="h-10 border-[#cfd6d2] bg-[#fbfcfb] text-[#18221f] placeholder:text-[#8c9692]"
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-[#35413d]">Salesperson</Label>
              <Select value={salesperson} onValueChange={setSalesperson}>
                <SelectTrigger className="h-10 w-full border-[#cfd6d2] bg-[#fbfcfb] text-[#18221f]">
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
              <Label className="text-[#35413d]">State</Label>
              <Select
                value={state}
                onValueChange={(value) => setState(value as Dealer["state"])}
              >
                <SelectTrigger className="h-10 w-full border-[#cfd6d2] bg-[#fbfcfb] text-[#18221f]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Telangana">Telangana</SelectItem>
                  <SelectItem value="Andhra Pradesh">Andhra Pradesh</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dealer-pin" className="text-[#35413d]">
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
                className="h-10 border-[#cfd6d2] bg-[#fbfcfb] text-[#18221f] placeholder:text-[#8c9692]"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dealer-area" className="text-[#35413d]">
                Area
              </Label>
              <Input
                id="dealer-area"
                value={area}
                onChange={(event) => setArea(event.target.value)}
                placeholder="Nampally"
                className="h-10 border-[#cfd6d2] bg-[#fbfcfb] text-[#18221f] placeholder:text-[#8c9692]"
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="dealer-address" className="text-[#35413d]">
                Full address <span className="font-normal text-[#7a8581]">(optional)</span>
              </Label>
              <Textarea
                id="dealer-address"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="Shop number, building, street or landmark"
                className="min-h-20 resize-y border-[#cfd6d2] bg-[#fbfcfb] text-[#18221f] placeholder:text-[#8c9692]"
              />
              <p className="text-xs leading-5 text-[#74807c]">
                Include the shop number and street or landmark for the most precise result.
              </p>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="border-[#cfd6d2] bg-white text-[#35413d] transition-[transform,background-color] active:scale-[0.98]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-[#d9f36b] text-[#173a34] transition-[transform,background-color] active:scale-[0.98] hover:bg-[#cce960]"
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
    const areaChanged = area.trim().toUpperCase() !== dealer.area;
    const addressChanged = address.trim() !== (dealer.address ?? "");
    const locationChanged =
      pincodeOrStateChanged ||
      addressChanged ||
      (Boolean(address.trim()) &&
        (areaChanged || dealer.locationPrecision !== "address"));
    const postalFieldsChanged = pincodeOrStateChanged || areaChanged;
    const shouldValidate = postalFieldsChanged || !dealer.validationStatus;
    setSaving(true);
    const [location, validation] = await Promise.all([
      locationChanged
        ? locateDealer({ address, area, pincode, state })
        : Promise.resolve({
            coordinates: [dealer.longitude, dealer.latitude] as [number, number],
            precision:
              dealer.locationPrecision ?? (dealer.address ? "address" : "pincode"),
            resolvedAddress: dealer.geocodedAddress,
          } satisfies GeocodedLocation),
      shouldValidate
        ? validatePostalDetailsFromApp(pincode, state, area)
        : Promise.resolve(null),
    ]);
    setSaving(false);
    if (validation?.status === "invalid") {
      toast.error(validation.message);
      return;
    }
    if (!location) {
      toast.error(
        address.trim()
          ? "That full address could not be matched inside the entered PIN code. Check it and try again."
          : "That PIN code could not be located. Check it and try again.",
      );
      return;
    }

    const updated: Dealer = {
      ...dealer,
      salesperson,
      dealer: dealerName.trim().toUpperCase(),
      pincode,
      area: area.trim().toUpperCase(),
      address: address.trim() || undefined,
      state,
      longitude: location.coordinates[0],
      latitude: location.coordinates[1],
      locationPrecision: location.precision,
      geocodedAddress: location.resolvedAddress,
      ...(validation ? postalValidationFields(validation) : {}),
    };
    if (await onUpdate(updated)) onClose();
  };

  return (
    <Dialog open onOpenChange={(nextOpen) => !nextOpen && !saving && onClose()}>
      <DialogContent className="max-h-[calc(100svh-24px)] overflow-y-auto rounded-2xl border-[#d9dedb] bg-white text-[#18221f] shadow-[0_24px_70px_rgba(15,31,27,0.24)] sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-xl tracking-[-0.02em] text-[#18221f]">
            Edit dealer
          </DialogTitle>
          <DialogDescription className="leading-6 text-[#66716d]">
            PIN, state, and area are checked against the postal directory when
            they change. A full address places the pin at the address result;
            otherwise the pin uses an approximate PIN-code location.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="edit-dealer-name" className="text-[#35413d]">
                Dealer name
              </Label>
              <Input
                id="edit-dealer-name"
                value={dealerName}
                onChange={(event) => setDealerName(event.target.value)}
                autoFocus
                className="h-10 border-[#cfd6d2] bg-[#fbfcfb] text-[#18221f]"
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-[#35413d]">Salesperson</Label>
              <Select value={salesperson} onValueChange={setSalesperson}>
                <SelectTrigger className="h-10 w-full border-[#cfd6d2] bg-[#fbfcfb] text-[#18221f]">
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
              <Label className="text-[#35413d]">State</Label>
              <Select
                value={state}
                onValueChange={(value) => setState(value as Dealer["state"])}
              >
                <SelectTrigger className="h-10 w-full border-[#cfd6d2] bg-[#fbfcfb] text-[#18221f]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Telangana">Telangana</SelectItem>
                  <SelectItem value="Andhra Pradesh">Andhra Pradesh</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-dealer-pin" className="text-[#35413d]">
                PIN code
              </Label>
              <Input
                id="edit-dealer-pin"
                value={pincode}
                onChange={(event) =>
                  setPincode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                inputMode="numeric"
                className="h-10 border-[#cfd6d2] bg-[#fbfcfb] text-[#18221f]"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-dealer-area" className="text-[#35413d]">
                Area
              </Label>
              <Input
                id="edit-dealer-area"
                value={area}
                onChange={(event) => setArea(event.target.value)}
                className="h-10 border-[#cfd6d2] bg-[#fbfcfb] text-[#18221f]"
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="edit-dealer-address" className="text-[#35413d]">
                Full address <span className="font-normal text-[#7a8581]">(optional)</span>
              </Label>
              <Textarea
                id="edit-dealer-address"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="Shop number, building, street or landmark"
                className="min-h-20 resize-y border-[#cfd6d2] bg-[#fbfcfb] text-[#18221f] placeholder:text-[#8c9692]"
              />
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
              className="border-[#cfd6d2] bg-white text-[#35413d] transition-[transform,background-color] active:scale-[0.98]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-[#d9f36b] text-[#173a34] transition-[transform,background-color] active:scale-[0.98] hover:bg-[#cce960]"
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
        valid ? "border-[#d9dedb] bg-[#fbfcfb]" : "border-[#efc1bc] bg-[#fff9f8]"
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold text-[#6e7874]">ROW {index + 1}</p>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={`Remove row ${index + 1}`}
          className="h-8 w-8 text-[#6e7874] transition-[transform,background-color] active:scale-[0.96] hover:bg-[#f3e6e4] hover:text-[#a13c32]"
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="grid gap-1.5">
          <Label htmlFor={`${row.key}-salesperson`} className="text-xs text-[#59645f]">
            Salesperson
          </Label>
          <Input
            id={`${row.key}-salesperson`}
            value={row.salesperson}
            onChange={(event) => onChange("salesperson", event.target.value)}
            className="h-9 border-[#cfd6d2] bg-white text-[#18221f]"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${row.key}-dealer`} className="text-xs text-[#59645f]">
            Dealer
          </Label>
          <Input
            id={`${row.key}-dealer`}
            value={row.dealer}
            onChange={(event) => onChange("dealer", event.target.value)}
            className="h-9 border-[#cfd6d2] bg-white text-[#18221f]"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${row.key}-pincode`} className="text-xs text-[#59645f]">
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
            className="h-9 border-[#cfd6d2] bg-white text-[#18221f]"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${row.key}-area`} className="text-xs text-[#59645f]">
            Area
          </Label>
          <Input
            id={`${row.key}-area`}
            value={row.area}
            onChange={(event) => onChange("area", event.target.value)}
            className="h-9 border-[#cfd6d2] bg-white text-[#18221f]"
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs text-[#59645f]">State</Label>
          <Select
            value={row.state}
            onValueChange={(value) => onChange("state", value as Dealer["state"])}
          >
            <SelectTrigger className="h-9 w-full border-[#cfd6d2] bg-white text-[#18221f]">
              <SelectValue placeholder="Select state" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Telangana">Telangana</SelectItem>
              <SelectItem value="Andhra Pradesh">Andhra Pradesh</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="mt-3 grid gap-1.5">
        <Label htmlFor={`${row.key}-address`} className="text-xs text-[#59645f]">
          Full address <span className="font-normal text-[#7a8581]">(optional)</span>
        </Label>
        <Textarea
          id={`${row.key}-address`}
          value={row.address}
          onChange={(event) => onChange("address", event.target.value)}
          placeholder="Shop number, building, street or landmark"
          className="min-h-16 resize-y border-[#cfd6d2] bg-white text-[#18221f]"
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
          : "border-[#d9dedb] bg-[#f6f8f6]"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ${
            warning ? "text-[#8a6410]" : "text-[#173a34]"
          }`}
        >
          {icon}
        </div>
        <div>
          <p className={`text-sm font-semibold ${warning ? "text-[#493b19]" : "text-[#26312e]"}`}>
            {title}
          </p>
          <p className={`mt-1 text-xs leading-5 ${warning ? "text-[#776437]" : "text-[#6f7975]"}`}>
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
      <div className="flex justify-between gap-4 text-xs text-[#66716d]">
        <span>{label}</span>
        <span className="tabular-nums">{value}%</span>
      </div>
      <Progress
        value={value}
        className="h-2 bg-[#e8ece9] [&_[data-slot=progress-indicator]]:bg-[#173a34]"
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
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#d9dedb] bg-[#f8faf8] px-3 py-2"
    >
      <p className="text-xs text-[#66716d]">
        Rows {firstRow}–{lastRow} of {rowCount}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Previous review page"
          disabled={page === 1}
          className="h-8 w-8 border-[#cfd6d2] bg-white text-[#35413d] transition-transform active:scale-[0.96]"
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-20 text-center text-xs font-semibold tabular-nums text-[#35413d]">
          Page {page} of {pageCount}
        </span>
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Next review page"
          disabled={page === pageCount}
          className="h-8 w-8 border-[#cfd6d2] bg-white text-[#35413d] transition-transform active:scale-[0.96]"
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
          area: row.area.trim().toUpperCase(),
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
          className="h-10 w-10 rounded-xl border-[#cfd6d2] bg-white p-0 text-[#35413d] shadow-sm transition-[transform,background-color] active:scale-[0.97] hover:bg-[#eef1ef] hover:text-[#18221f] sm:h-9 sm:w-auto sm:rounded-lg sm:px-3"
        >
          <Upload className="h-4 w-4" />
          <span className="hidden sm:inline">Import</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-24px)] overflow-y-auto rounded-2xl border-[#d9dedb] bg-white text-[#18221f] shadow-[0_24px_70px_rgba(15,31,27,0.24)] sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle className="text-xl tracking-[-0.02em] text-[#18221f]">
            {stage === "choose" ? "Import dealers" : "Review import"}
          </DialogTitle>
          <DialogDescription className="leading-6 text-[#66716d]">
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
            <div className="rounded-xl border border-[#d9dedb] bg-white p-4">
              <div className="flex items-start gap-3">
                <FileJson className="mt-0.5 h-5 w-5 shrink-0 text-[#173a34]" />
                <div>
                  <p className="text-sm font-semibold text-[#26312e]">
                    {REQUIRED_IMPORT_COLUMNS.join(" · ")}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[#6f7975]">
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
                className="w-full bg-[#d9f36b] text-[#173a34] transition-[transform,background-color] active:scale-[0.98] hover:bg-[#cce960] sm:w-auto"
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
              <details className="rounded-xl border border-[#d9dedb] bg-[#f8faf8] p-3">
                <summary className="cursor-pointer text-sm font-semibold text-[#35413d]">
                  View or correct extracted text
                </summary>
                <div className="mt-3 space-y-3">
                  <p className="text-xs leading-5 text-[#6f7975]">
                    Keep one dealer per line. Separate columns with tabs, commas, pipes, semicolons, or two spaces.
                  </p>
                  <Textarea
                    value={extractedText}
                    onChange={(event) => setExtractedText(event.target.value)}
                    className="min-h-32 border-[#cfd6d2] bg-white font-mono text-xs text-[#18221f]"
                    aria-label="Extracted OCR text"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-[#cfd6d2] bg-white text-[#35413d] transition-transform active:scale-[0.98]"
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
                <p className="text-sm font-semibold text-[#26312e]">
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
                className="border-[#cfd6d2] bg-white text-[#35413d] transition-transform active:scale-[0.98]"
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
                className="border-[#cfd6d2] bg-white text-[#35413d] transition-transform active:scale-[0.98]"
                onClick={resetImport}
              >
                Choose another file
              </Button>
              <Button
                type="button"
                disabled={importing || !draftRows.length || invalidCount > 0}
                className="bg-[#d9f36b] text-[#173a34] transition-[transform,background-color] active:scale-[0.98] hover:bg-[#cce960]"
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
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#75807c]" />
      <Input
        value={query}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search dealer, address, area or PIN"
        className="h-11 border-[#d7dcda] bg-white pl-9 pr-10 text-[15px] text-[#18221f] shadow-none placeholder:text-[#929c98] focus-visible:ring-[#2f6fe4]"
        aria-label="Search dealers"
      />
      {query ? (
        <button
          type="button"
          className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-[#75807c] transition-[transform,background-color] active:scale-[0.97] hover:bg-[#eef0ed]"
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
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-[#cfd6d2] bg-white px-3 text-left text-sm font-semibold text-[#26312e] shadow-sm transition-[transform,border-color,box-shadow] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f6fe4]"
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
                <span className="h-3.5 w-3.5 rounded-full border border-[#9da6a2] bg-[#d8ddda]" />
              ) : null}
            </span>
            <span className="truncate">{summary}</span>
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-[#74807c] transition-transform duration-150 ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[var(--radix-popover-trigger-width)] min-w-[260px] overflow-hidden rounded-xl border-[#d9dedb] bg-white p-0 shadow-[0_16px_42px_rgba(23,58,52,0.18)]"
      >
        <div className="border-b border-[#e1e5e2] p-3">
          <p className="text-sm font-semibold text-[#26312e]">Salespeople</p>
          <p className="mt-0.5 text-xs text-[#74807c]">
            {activePeople.length} of {salespeople.length} visible
          </p>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#7a8581]" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search salespeople"
              aria-label="Search salespeople"
              className="h-9 border-[#cfd6d2] bg-[#fbfcfb] pl-8 text-sm text-[#18221f]"
            />
          </div>
        </div>
        <div className="scrollbar-thin max-h-64 overflow-y-auto p-1.5">
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
                  className="flex min-h-10 w-full items-center gap-3 rounded-lg px-2.5 text-left text-sm text-[#2f3b37] transition-colors hover:bg-[#f1f4f2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f6fe4]"
                >
                  <span
                    className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${
                      active
                        ? "border-[#173a34] bg-[#173a34] text-white"
                        : "border-[#b8c1bd] bg-white"
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
            <p className="px-3 py-6 text-center text-xs text-[#7a8581]">
              No matching salespeople
            </p>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-[#e1e5e2] p-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={allActive}
            className="h-8 text-xs text-[#35413d] transition-transform active:scale-[0.97]"
            onClick={onShowAll}
          >
            Select all
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={activePeople.length === 0}
            className="h-8 text-xs text-[#6d7773] transition-transform active:scale-[0.97]"
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
          className="flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-[#cfd6d2] bg-white px-3 text-left text-sm text-[#26312e] shadow-none transition-[transform,border-color,box-shadow] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f6fe4]"
          aria-label={`Filter by ${label.toLowerCase()}, ${selectedLabel}`}
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-[#74807c] transition-transform duration-150 ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[var(--radix-popover-trigger-width)] min-w-[230px] overflow-hidden rounded-xl border-[#d9dedb] bg-white p-0 shadow-[0_16px_42px_rgba(23,58,52,0.18)]"
      >
        <div className="border-b border-[#e1e5e2] p-3">
          <p className="text-sm font-semibold text-[#26312e]">{label}</p>
          <div className="relative mt-2.5">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#7a8581]" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="h-9 border-[#cfd6d2] bg-[#fbfcfb] pl-8 text-sm text-[#18221f]"
            />
          </div>
        </div>
        <div className="scrollbar-thin max-h-60 overflow-y-auto p-1.5">
          {!normalizedSearch ? (
            <button
              type="button"
              aria-pressed={value === "all"}
              onClick={() => selectValue("all")}
              className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-[#2f3b37] transition-colors hover:bg-[#f1f4f2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f6fe4]"
            >
              <Check
                className={`h-4 w-4 shrink-0 ${value === "all" ? "text-[#173a34]" : "text-transparent"}`}
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
                className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-[#2f3b37] transition-colors hover:bg-[#f1f4f2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f6fe4]"
              >
                <Check
                  className={`h-4 w-4 shrink-0 ${value === option ? "text-[#173a34]" : "text-transparent"}`}
                  aria-hidden="true"
                />
                <span className="truncate font-medium">{option}</span>
              </button>
            ))
          ) : (
            <p className="px-3 py-6 text-center text-xs text-[#7a8581]">
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
  layout,
}: DealerFilterControlProps & { layout: "sidebar" | "wide" }) {
  const fieldClass = "grid min-w-0 gap-1.5";
  const triggerClass =
    "h-10 w-full border-[#cfd6d2] bg-white text-sm text-[#26312e] shadow-none";

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
          <p className="mb-1.5 text-xs font-semibold text-[#65716d]">
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
              ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto] xl:items-end"
              : "grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto] xl:items-end"
            : "grid grid-cols-2 gap-3"
        }
      >
        <div className={fieldClass}>
          <Label className="text-xs font-semibold text-[#65716d]">State</Label>
          <Select
            value={stateFilter}
            onValueChange={(value) => onStateFilterChange(value as StateFilter)}
          >
            <SelectTrigger aria-label="Filter by state" className={triggerClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All states</SelectItem>
              <SelectItem value="Telangana">Telangana</SelectItem>
              <SelectItem value="Andhra Pradesh">Andhra Pradesh</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {showQualityFilter ? <div className={fieldClass}>
          <Label className="text-xs font-semibold text-[#65716d]">
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
              <SelectItem value="review">Needs review</SelectItem>
              <SelectItem value="unchecked">Not checked</SelectItem>
            </SelectContent>
          </Select>
        </div> : null}

        <div className={fieldClass}>
          <Label className="text-xs font-semibold text-[#65716d]">
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
          <Label className="text-xs font-semibold text-[#65716d]">Area</Label>
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
          className={`h-10 border-[#cfd6d2] bg-white text-[#4f5b57] transition-[transform,background-color] active:scale-[0.98] hover:bg-[#eef1ef] ${
            layout === "sidebar" ? "col-span-2" : ""
          }`}
        >
          <X className="h-3.5 w-3.5" />
          Reset filters
          {activeFilterCount ? (
            <span className="rounded-full bg-[#e6ece8] px-1.5 py-0.5 text-[10px] tabular-nums">
              {activeFilterCount}
            </span>
          ) : null}
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
          className="absolute left-3 top-3 z-10 inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/75 bg-white/95 px-3 text-xs font-semibold text-[#35413d] shadow-[0_8px_24px_rgba(25,38,34,0.13)] backdrop-blur transition-[transform,background-color] active:scale-[0.97] hover:bg-white lg:hidden"
          aria-label={`Filter map dealers${filters.activeFilterCount ? `, ${filters.activeFilterCount} active` : ""}`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {filters.activeFilterCount ? (
            <span className="rounded-full bg-[#173a34] px-1.5 py-0.5 text-[10px] text-white tabular-nums">
              {filters.activeFilterCount}
            </span>
          ) : null}
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-24px)] overflow-y-auto rounded-2xl border-[#d9dedb] bg-[#f7f8f6] text-[#18221f] shadow-[0_24px_70px_rgba(15,31,27,0.24)] sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-xl tracking-[-0.02em] text-[#18221f]">
            Filter map dealers
          </DialogTitle>
          <DialogDescription className="leading-6 text-[#66716d]">
            The same filters stay active when you switch to the Dealers tab.
          </DialogDescription>
        </DialogHeader>
        <DealerFilterControls {...filters} layout="sidebar" />
      </DialogContent>
    </Dialog>
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
  dealers,
  filters,
  onSelect,
  onUpdate,
  onDelete,
  onAdd,
  onImport,
  canManage,
}: {
  active: boolean;
  dealers: Dealer[];
  filters: DealerFilterControlProps;
  onSelect: (dealer: Dealer) => void;
  onUpdate: (dealer: Dealer) => Promise<boolean>;
  onDelete: (dealer: Dealer) => Promise<void>;
  onAdd: (dealer: Omit<Dealer, "id">) => Promise<boolean>;
  onImport: (dealers: Array<Omit<Dealer, "id">>) => Promise<number>;
  canManage: boolean;
}) {
  const [editingDealer, setEditingDealer] = useState<Dealer | null>(null);
  const [deletingDealer, setDeletingDealer] = useState<Dealer | null>(null);
  return (
    <section
      id="dealer-directory-panel"
      hidden={!active}
      aria-labelledby="dealer-directory-title"
      className="h-[calc(100svh-120px)] overflow-y-auto bg-[#eef0ed]"
    >
      <div className="mx-auto w-full max-w-[1280px] px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#73807b]">
              Dealer directory
            </p>
            <h2
              id="dealer-directory-title"
              className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[#18221f] sm:text-3xl"
            >
              {canManage ? "All dealers" : "My dealers"}
            </h2>
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

        <div className="mt-5 rounded-2xl border border-[#d8ddda] bg-white p-3 shadow-[0_8px_24px_rgba(25,38,34,0.05)] sm:p-4">
          <div className="mb-3 flex items-center justify-between text-xs font-semibold text-[#65716d]">
            <span>Filters</span>
            <span>
              {dealers.length} {dealers.length === 1 ? "dealer" : "dealers"}
            </span>
          </div>
          <DealerFilterControls {...filters} layout="wide" />
        </div>

        {dealers.length ? (
          <>
            <ul className="mt-4 space-y-2 lg:hidden">
              {dealers.map((dealer) => (
                <li key={dealer.id} className="relative">
                  <button
                    type="button"
                    onClick={() => onSelect(dealer)}
                    className={`flex min-h-24 w-full items-center gap-3 rounded-2xl border border-[#d8ddda] bg-white p-3 text-left shadow-[0_6px_18px_rgba(25,38,34,0.04)] transition-[transform,background-color] active:scale-[0.99] ${canManage ? "pr-28" : "pr-4"}`}
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
                        <span className="truncate text-sm font-semibold text-[#26312e]">
                          {dealer.dealer}
                        </span>
                        {dealer.reviewNote ? (
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                        ) : null}
                      </span>
                      <span className="mt-1 block truncate text-xs text-[#76817d]">
                        {dealer.area} · {dealer.pincode}
                      </span>
                      {dealer.address ? (
                        <span className="mt-1 block truncate text-[11px] text-[#68746f]">
                          {dealer.address}
                        </span>
                      ) : null}
                      <span className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-[#596560]">
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
                      onClick={() => setEditingDealer(dealer)}
                      aria-label={`Edit ${dealer.dealer}`}
                      className="grid h-11 w-11 place-items-center rounded-xl border border-[#d8ddda] bg-white text-[#596560] shadow-sm transition-[transform,background-color] active:scale-[0.96] hover:bg-[#eef1ef] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f6fe4]"
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

            <div className="mt-4 hidden overflow-hidden rounded-2xl border border-[#d8ddda] bg-white shadow-[0_8px_24px_rgba(25,38,34,0.05)] lg:block">
              <table className="w-full border-collapse text-left">
                <thead className="bg-[#f5f7f5] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#74807c]">
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
                <tbody className="divide-y divide-[#e3e7e5]">
                  {dealers.map((dealer) => (
                    <tr
                      key={dealer.id}
                      className="text-sm text-[#34403c] transition-colors hover:bg-[#f8faf8]"
                    >
                      <td className="px-5 py-3.5">
                        <button
                          type="button"
                          onClick={() => onSelect(dealer)}
                          className="flex items-center gap-3 text-left font-semibold text-[#202b27] outline-none focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-[#2f6fe4] focus-visible:ring-offset-2"
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
                        <span className="mt-0.5 block truncate text-xs text-[#78827e]">
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
                            onClick={() => setEditingDealer(dealer)}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-[#35413d] transition-[transform,background-color] active:scale-[0.97] hover:bg-[#e8eeeb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f6fe4]"
                            aria-label={`Edit ${dealer.dealer}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => onSelect(dealer)}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-[#173a34] transition-[transform,background-color] active:scale-[0.97] hover:bg-[#e8eeeb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f6fe4]"
                            aria-label={`View ${dealer.dealer} on map`}
                          >
                            Map
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingDealer(dealer)}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-red-600 transition-[transform,background-color] active:scale-[0.97] hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                            aria-label={`Delete ${dealer.dealer}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        </div>
                      </td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="mt-4 grid min-h-64 place-items-center rounded-2xl border border-dashed border-[#cbd2cf] bg-white px-6 text-center">
            <div>
              <CircleDot className="mx-auto mb-3 h-7 w-7 text-[#9ba39f]" />
              <p className="text-sm font-semibold text-[#26312e]">
                No dealers match
              </p>
              <p className="mt-1 text-xs text-[#76817d]">
                Clear the search or adjust the filters.
              </p>
            </div>
          </div>
        )}
      </div>
      {canManage && editingDealer ? (
        <EditDealerDialog
          key={editingDealer.id}
          dealer={editingDealer}
          salespeople={filters.salespeople}
          onClose={() => setEditingDealer(null)}
          onUpdate={onUpdate}
        />
      ) : null}
      {canManage ? <AlertDialog
        open={Boolean(deletingDealer)}
        onOpenChange={(open) => !open && setDeletingDealer(null)}
      >
        <AlertDialogContent className="rounded-2xl border-[#d9dedb] bg-white text-[#18221f] shadow-[0_24px_70px_rgba(15,31,27,0.24)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="tracking-[-0.02em] text-[#18221f]">
              Delete dealer?
            </AlertDialogTitle>
            <AlertDialogDescription className="leading-6 text-[#66716d]">
              {deletingDealer ? (
                <>
                  <strong className="font-semibold text-[#35413d]">
                    {deletingDealer.dealer}
                  </strong>{" "}
                  will be removed from the shared workspace. Its map pin and any
                  coverage derived only from this record will disappear.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[#cfd6d2] bg-white text-[#35413d] transition-transform active:scale-[0.98]">
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

export default function Home() {
  const router = useRouter();
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [session, setSession] = useState<AppSession | null>(null);
  const [team, setTeam] = useState<SalespersonAccount[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const postalValidationStarted = useRef(false);
  const [query, setQuery] = useState("");
  const [activePeople, setActivePeople] = useState<string[]>([]);
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>("all");
  const [pincodeFilter, setPincodeFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [focusRequest, setFocusRequest] = useState<Dealer | null>(null);
  const [workspaceView, setWorkspaceView] = useState<"map" | "dealers" | "routes" | "team">("map");

  useEffect(() => {
    if (workspaceView !== "map") return;
    const frame = window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [workspaceView]);

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspace() {
      try {
        const workspace = await fetchWorkspaceBootstrap();
        if (cancelled) return;
        setSession(workspace.session);
        setDealers(workspace.dealers);
        setTeam(workspace.salespeople);
        setActivePeople(
          workspace.salespeople.map((person) => person.normalizedName),
        );
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
  }, []);

  useEffect(() => {
    if (!hydrated || postalValidationStarted.current) return;
    postalValidationStarted.current = true;

    void loadPostalDirectory()
      .then((directory) => {
        const datasetVersion = directory.meta.sourceSha256;
        setDealers((current) =>
          current.map((dealer) => {
            if (dealer.validationSource === "manual") return dealer;
            if (
              dealer.validationDataset === datasetVersion &&
              dealer.validationStatus !== "unavailable"
            ) {
              return dealer;
            }
            const validation = validatePostalDetails(
              directory,
              dealer.pincode,
              dealer.state,
              dealer.area,
            );
            return { ...dealer, ...postalValidationFields(validation) };
          }),
        );
      })
      .catch(() => {
        // Existing records stay visible if the local reference asset is unavailable.
      });
  }, [hydrated]);

  const salespeople = useMemo(
    () => team.filter((person) => person.active).map((person) => person.normalizedName),
    [team],
  );
  const canManage = session?.role === "admin";
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
      query,
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
    query,
    stateFilter,
  ]);
  const directoryDealers = useMemo(() => {
    return filterDealerRecords(dealers, {
      query,
      salespeople: activePeople,
      state: stateFilter,
      quality: canManage ? qualityFilter : "all",
      pincode: pincodeFilter,
      area: areaFilter,
    });
  }, [
    activePeople,
    areaFilter,
    canManage,
    dealers,
    pincodeFilter,
    qualityFilter,
    query,
    stateFilter,
  ]);

  const selectedDealer =
    dealers.find((dealer) => dealer.id === selectedId) ?? null;
  const uniquePins = new Set(dealers.map((dealer) => dealer.pincode)).size;

  const selectDealer = (dealer: Dealer) => {
    setSelectedId(dealer.id);
    setFocusRequest(dealer);
    setWorkspaceView("map");
  };

  const togglePerson = (person: string) => {
    setActivePeople((current) =>
      current.includes(person)
        ? current.filter((item) => item !== person)
        : [...current, person],
    );
  };

  const showAllPeople = () => setActivePeople(salespeople);
  const clearAllPeople = () => setActivePeople([]);
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
  const sharedFilterControls = {
    showSalespersonFilter: canManage,
    query,
    onQueryChange: setQuery,
    salespeople,
    activePeople,
    onTogglePerson: togglePerson,
    onShowAll: showAllPeople,
    onClearAll: clearAllPeople,
    stateFilter,
    onStateFilterChange: setStateFilter,
    qualityFilter,
    onQualityFilterChange: setQualityFilter,
    pincodeFilter,
    onPincodeFilterChange: setPincodeFilter,
    areaFilter,
    onAreaFilterChange: setAreaFilter,
    pincodes,
    areas,
  };
  const mapFilterControls: DealerFilterControlProps = {
    ...sharedFilterControls,
    showQualityFilter: false,
    activeFilterCount: mapActiveFilterCount,
    onResetFilters: resetMapFilters,
  };
  const dealerFilterControls: DealerFilterControlProps = {
    ...sharedFilterControls,
    showQualityFilter: canManage,
    activeFilterCount: directoryActiveFilterCount,
    onResetFilters: resetDirectoryFilters,
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

  const deleteDealer = async (dealerToDelete: Dealer) => {
    try {
      await removeDealer(dealerToDelete.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Dealer could not be deleted.");
      return;
    }
    const deletedIndex = dealers.findIndex(
      (dealer) => dealer.id === dealerToDelete.id,
    );
    const wasPersonActive = activePeople.includes(dealerToDelete.salesperson);
    const remainingDealers = dealers.filter(
      (dealer) => dealer.id !== dealerToDelete.id,
    );
    const remainingPeople = new Set(
      remainingDealers.map((dealer) => dealer.salesperson),
    );
    setDealers(remainingDealers);
    setActivePeople((current) =>
      current.filter((person) => remainingPeople.has(person)),
    );
    if (selectedId === dealerToDelete.id) setSelectedId(null);
    if (focusRequest?.id === dealerToDelete.id) setFocusRequest(null);
    toast.success(`${dealerToDelete.dealer} deleted.`, {
      action: {
        label: "Undo",
        onClick: async () => {
          try {
            const restoredDealer = await createDealer(dealerToDelete);
            setDealers((current) => {
              const insertAt = Math.min(Math.max(deletedIndex, 0), current.length);
              return [
                ...current.slice(0, insertAt),
                restoredDealer,
                ...current.slice(insertAt),
              ];
            });
            if (wasPersonActive) {
              setActivePeople((current) => [
                ...new Set([...current, dealerToDelete.salesperson]),
              ]);
            }
            toast.success(`${dealerToDelete.dealer} restored.`);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Dealer could not be restored.");
          }
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
                enum: ["Telangana", "Andhra Pradesh"],
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
                enum: ["Telangana", "Andhra Pradesh"],
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
              area: candidate.area.trim().toUpperCase(),
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

  return (
    <main className="h-[100svh] overflow-hidden bg-[#eef0ed] text-[#18221f]">
      <header className="flex h-16 items-center justify-between border-b border-white/10 bg-[#173a34] px-3 text-white sm:px-6 lg:h-[72px]">
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#d9f36b] text-[#173a34] shadow-inner sm:h-10 sm:w-10">
            <MapPinned className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold tracking-[-0.01em] sm:text-lg">
              Dealer Territory Map
            </h1>
            <p className="truncate text-[11px] text-white/62 sm:text-xs">
              Telangana + Andhra Pradesh
            </p>
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-3 sm:gap-6">
          <div className="hidden items-center gap-6 text-sm xl:flex">
            <div>
              <span className="block text-[11px] uppercase tracking-[0.08em] text-white/45">
                Salespeople
              </span>
              <span className="font-semibold">{salespeople.length}</span>
            </div>
            <div>
              <span className="block text-[11px] uppercase tracking-[0.08em] text-white/45">
                Dealers
              </span>
              <span className="font-semibold">{dealers.length}</span>
            </div>
            <div>
              <span className="block text-[11px] uppercase tracking-[0.08em] text-white/45">
                PIN codes
              </span>
              <span className="font-semibold">{uniquePins}</span>
            </div>
          </div>
          {session ? (
            <div className="hidden text-right sm:block">
              <span className="block text-xs font-semibold">{session.displayName}</span>
              <span className="block text-[10px] capitalize text-white/55">{session.role}</span>
            </div>
          ) : null}
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-xl text-white/70 transition-[background-color,color,transform] hover:bg-white/10 hover:text-white active:scale-[0.96]"
            aria-label="Sign out"
            title="Sign out"
            onClick={async () => {
              await authClient.signOut();
              router.replace("/auth/sign-in");
              router.refresh();
            }}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      <nav
        className={`grid h-14 gap-1.5 border-b border-[#d9dedb] bg-white p-1.5 lg:flex lg:h-12 lg:items-center lg:justify-center lg:gap-1 lg:px-6 lg:py-1.5 ${canManage ? "grid-cols-4" : "grid-cols-3"}`}
        aria-label="Workspace view"
      >
        <button
          type="button"
          aria-pressed={workspaceView === "map"}
          aria-controls="map-workspace"
          onClick={() => setWorkspaceView("map")}
          className={
            "flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-[transform,background-color,color,box-shadow] active:scale-[0.98] lg:h-9 lg:min-h-0 lg:w-36 lg:rounded-lg " +
            (workspaceView === "map"
              ? "bg-[#173a34] text-white shadow-sm"
              : "text-[#65716d]")
          }
        >
          <MapIcon className="h-4 w-4" aria-hidden="true" />
          Map
        </button>
        <button
          type="button"
          aria-pressed={workspaceView === "dealers"}
          aria-controls="dealer-directory-panel"
          onClick={() => setWorkspaceView("dealers")}
          className={
            "flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-[transform,background-color,color,box-shadow] active:scale-[0.98] lg:h-9 lg:min-h-0 lg:w-36 lg:rounded-lg " +
            (workspaceView === "dealers"
              ? "bg-[#173a34] text-white shadow-sm"
              : "text-[#65716d]")
          }
        >
          <List className="h-4 w-4" aria-hidden="true" />
          Dealers
          <span
            className={
              "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums " +
              (workspaceView === "dealers"
                ? "bg-white/14 text-white"
                : "bg-[#e7ece9] text-[#53605b]")
            }
          >
            {dealers.length}
          </span>
        </button>
        <button
          type="button"
          aria-pressed={workspaceView === "routes"}
          aria-controls="routes-workspace-panel"
          onClick={() => setWorkspaceView("routes")}
          className={
            "flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-[transform,background-color,color,box-shadow] active:scale-[0.98] lg:h-9 lg:min-h-0 lg:w-36 lg:rounded-lg " +
            (workspaceView === "routes"
              ? "bg-[#173a34] text-white shadow-sm"
              : "text-[#65716d]")
          }
        >
          <RouteIcon className="h-4 w-4" aria-hidden="true" />
          {canManage ? "Activity" : "Routes"}
        </button>
        {canManage ? (
          <button
            type="button"
            aria-pressed={workspaceView === "team"}
            aria-controls="team-workspace-panel"
            onClick={() => setWorkspaceView("team")}
            className={
              "flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-[transform,background-color,color,box-shadow] active:scale-[0.98] lg:h-9 lg:min-h-0 lg:w-36 lg:rounded-lg " +
              (workspaceView === "team"
                ? "bg-[#173a34] text-white shadow-sm"
                : "text-[#65716d]")
            }
          >
            <UserCog className="h-4 w-4" aria-hidden="true" />
            Team
          </button>
        ) : null}
      </nav>

      <div
        id="map-workspace"
        className={
          "h-[calc(100svh-120px)] min-h-0 grid-rows-[minmax(0,1fr)] grid-cols-1 overflow-hidden lg:grid-cols-[330px_minmax(0,1fr)] " +
          (workspaceView === "map" ? "grid" : "hidden")
        }
      >
        <aside
          id="map-dealer-sidebar"
          className="z-10 hidden h-full flex-col border-r border-[#d9dedb] bg-[#f7f8f6] lg:flex"
        >
          <div className="border-b border-[#dde2df] p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between text-xs font-semibold text-[#65716d]">
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
                {mapDealers.map((dealer) => (
                  <li key={dealer.id}>
                    <button
                      onClick={() => selectDealer(dealer)}
                      className={
                        "group flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-[transform,background-color] active:scale-[0.99] " +
                        (selectedId === dealer.id
                          ? "bg-[#e7ece9]"
                          : "hover:bg-[#eef1ef]")
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
                          <span className="truncate text-sm font-semibold text-[#26312e]">
                            {dealer.dealer}
                          </span>
                          {dealer.reviewNote ? (
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                          ) : null}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-[#76817d]">
                          {dealer.area} · {dealer.pincode}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 text-[#9ba39f] transition group-hover:translate-x-0.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="grid h-48 place-items-center px-6 text-center">
                <div>
                  <CircleDot className="mx-auto mb-2 h-6 w-6 text-[#9ba39f]" />
                  <p className="text-sm font-semibold">No dealers match</p>
                  <p className="mt-1 text-xs text-[#76817d]">
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
            selectedId={selectedId}
            onSelect={(id) => {
              const dealer = dealers.find((item) => item.id === id);
              if (dealer) selectDealer(dealer);
            }}
            focusRequest={focusRequest}
          />
          <MobileMapFilters filters={mapFilterControls} />

          {selectedDealer ? (
            <article className="absolute bottom-3 left-3 right-3 max-h-[48%] overflow-y-auto rounded-2xl border border-white/70 bg-white/95 p-4 shadow-[0_18px_44px_rgba(23,58,52,0.18)] backdrop-blur sm:bottom-auto sm:left-auto sm:right-4 sm:top-4 sm:w-[min(360px,calc(100%-32px))] sm:max-h-none sm:overflow-visible sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-[#76817d]">
                    Dealer
                  </p>
                  <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-[#1d2925]">
                    {selectedDealer.dealer}
                  </h2>
                </div>
                <button
                  onClick={() => setSelectedId(null)}
                  className="rounded-lg p-1.5 text-[#77817e] hover:bg-[#eef1ef]"
                  aria-label="Close dealer details"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <dt className="text-[11px] text-[#7a8581]">Salesperson</dt>
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
                <div>
                  <dt className="text-[11px] text-[#7a8581]">PIN code</dt>
                  <dd className="mt-0.5 text-sm font-semibold">
                    {selectedDealer.pincode}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-[11px] text-[#7a8581]">Area</dt>
                  <dd className="mt-0.5 text-sm font-semibold">
                    {selectedDealer.area}, {selectedDealer.state}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-[11px] text-[#7a8581]">Full address</dt>
                  <dd className="mt-0.5 text-sm font-semibold leading-5">
                    {selectedDealer.address ?? "Not added"}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-[11px] text-[#7a8581]">Pin location</dt>
                  <dd className="mt-0.5 text-sm font-semibold">
                    {(selectedDealer.locationPrecision ??
                      (selectedDealer.address ? "address" : "pincode")) ===
                    "address"
                      ? "Address-level result"
                      : "Approximate PIN-code location"}
                  </dd>
                </div>
              </dl>

              {selectedDealer.reviewNote ? (
                <div className="mt-4 flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{selectedDealer.reviewNote}</p>
                </div>
              ) : null}
            </article>
          ) : null}

          <div className="absolute left-4 top-4 hidden items-center gap-2 rounded-xl border border-white/70 bg-white/92 px-3 py-2 text-xs font-semibold text-[#47534f] shadow-sm backdrop-blur sm:flex">
            <Users className="h-4 w-4 text-[#173a34]" />
            Monthly dealer coverage
          </div>
        </section>
      </div>
      <DealerDirectory
        active={workspaceView === "dealers"}
        dealers={directoryDealers}
        filters={dealerFilterControls}
        onSelect={selectDealer}
        onUpdate={updateDealer}
        onDelete={deleteDealer}
        onAdd={addDealer}
        onImport={importDealers}
        canManage={canManage}
      />
      {hydrated ? (
        <RoutesWorkspace
          active={workspaceView === "routes"}
          dealers={dealers}
          currentSalesperson={session?.salesperson ?? null}
          readOnly={canManage}
        />
      ) : null}
      {canManage ? (
        <TeamWorkspace
          active={workspaceView === "team"}
          salespeople={team}
          dealers={dealers}
          onAccountUpdated={(person) => {
            setTeam((current) =>
              current.map((item) => (item.id === person.id ? person : item)),
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
      <Toaster position="top-center" richColors />
    </main>
  );
}
