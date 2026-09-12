"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import {
  AlertTriangle,
  Building2,
  ChevronRight,
  CircleDot,
  FileSpreadsheet,
  Loader2,
  MapPinned,
  Plus,
  Search,
  Upload,
  Users,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import {
  INITIAL_DEALERS,
  getSalespersonColor,
  type Dealer,
} from "./dealers";

type MapData = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: Record<string, string | number | boolean>;
    geometry: {
      type: "Point" | "Polygon";
      coordinates: number[] | number[][][];
    };
  }>;
};

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

async function geocodePincode(
  pincode: string,
  state: Dealer["state"],
): Promise<[number, number] | null> {
  if (PIN_COORDINATES[pincode]) return PIN_COORDINATES[pincode];
  const query = encodeURIComponent(pincode + ", " + state + ", India");
  const response = await fetch(
    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=in&q=" +
      query,
  );
  if (!response.ok) return null;
  const [match] = (await response.json()) as Array<{ lat: string; lon: string }>;
  return match ? [Number(match.lon), Number(match.lat)] : null;
}

function circlePolygon(
  longitude: number,
  latitude: number,
  radiusKm: number,
  properties: Record<string, string | number | boolean>,
) {
  const coordinates: number[][] = [];
  const latScale = radiusKm / 110.574;
  const lonScale = radiusKm / (111.32 * Math.cos((latitude * Math.PI) / 180));
  for (let step = 0; step <= 48; step += 1) {
    const angle = (step / 48) * Math.PI * 2;
    coordinates.push([
      longitude + Math.cos(angle) * lonScale,
      latitude + Math.sin(angle) * latScale,
    ]);
  }
  return {
    type: "Feature" as const,
    properties,
    geometry: { type: "Polygon" as const, coordinates: [coordinates] },
  };
}

function makeCoverageData(dealers: Dealer[]): MapData {
  return {
    type: "FeatureCollection",
    features: dealers.map((dealer) =>
      circlePolygon(dealer.longitude, dealer.latitude, 12, {
        id: dealer.id,
        color: getSalespersonColor(dealer.salesperson),
        salesperson: dealer.salesperson,
        area: dealer.area,
      }),
    ),
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

function TerritoryMap({
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
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    let map: MapLibreMap | null = null;

    void import("maplibre-gl").then((module) => {
      if (!active || !mapContainer.current) return;
      const maplibregl = module;
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
          data: makeCoverageData(dealers) as never,
        });
        map?.addLayer({
          id: "coverage-fill",
          type: "fill",
          source: "coverage",
          paint: {
            "fill-color": ["get", "color"],
            "fill-opacity": 0.34,
          },
        });
        map?.addLayer({
          id: "coverage-outline",
          type: "line",
          source: "coverage",
          paint: {
            "line-color": ["get", "color"],
            "line-width": 1.8,
            "line-opacity": 0.9,
          },
        });
        map?.addSource("dealers", {
          type: "geojson",
          data: makeDealerData(dealers) as never,
        });
        map?.addLayer({
          id: "dealer-points",
          type: "circle",
          source: "dealers",
          paint: {
            "circle-radius": [
              "case",
              ["==", ["get", "id"], selectedId ?? -1],
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
          if (id) onSelect(id);
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
      makeCoverageData(dealers) as never,
    );
    (mapRef.current.getSource("dealers") as GeoJSONSource)?.setData(
      makeDealerData(dealers) as never,
    );
  }, [dealers, ready]);

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
      duration: 850,
    });
  }, [focusRequest]);

  return (
    <div className="relative h-full min-h-[480px] overflow-hidden bg-[#e5e8e4]">
      <div
        ref={mapContainer}
        className="absolute inset-0"
        style={{ position: "absolute", inset: 0 }}
        aria-label="Dealer territory map"
      />
      <div className="pointer-events-none absolute bottom-5 left-5 rounded-xl border border-white/70 bg-white/92 px-3.5 py-2.5 text-xs text-[#46514d] shadow-[0_8px_24px_rgba(25,38,34,0.13)] backdrop-blur">
        <span className="font-semibold">Prototype coverage</span>
        <span className="mt-0.5 block text-[#6e7874]">
          Colored circles use PIN centroids, not final territory borders.
        </span>
      </div>
    </div>
  );
}

function AddDealerDialog({
  salespeople,
  onAdd,
}: {
  salespeople: string[];
  onAdd: (dealer: Omit<Dealer, "id">) => void;
}) {
  const [open, setOpen] = useState(false);
  const [salesperson, setSalesperson] = useState(salespeople[0] ?? "KIRAN");
  const [dealer, setDealer] = useState("");
  const [pincode, setPincode] = useState("");
  const [area, setArea] = useState("");
  const [state, setState] = useState<Dealer["state"]>("Telangana");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!dealer.trim() || !area.trim() || !/^\d{6}$/.test(pincode)) {
      toast.error("Enter a dealer, area and valid 6-digit PIN code.");
      return;
    }
    setSaving(true);
    const coordinates = await geocodePincode(pincode, state);
    setSaving(false);
    if (!coordinates) {
      toast.error("That PIN code could not be located. Check it and try again.");
      return;
    }
    onAdd({
      salesperson,
      dealer: dealer.trim().toUpperCase(),
      pincode,
      area: area.trim().toUpperCase(),
      state,
      longitude: coordinates[0],
      latitude: coordinates[1],
    });
    setDealer("");
    setPincode("");
    setArea("");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          aria-label="Add dealer"
          className="h-9 rounded-lg bg-[#d9f36b] text-[#173a34] hover:bg-[#cce960]"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Add dealer</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="border-[#d9dedb] bg-white sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Add a dealer</DialogTitle>
          <DialogDescription>
            The PIN code is converted to a map point. Add an exact address later
            for route planning.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="dealer-name">Dealer name</Label>
              <Input
                id="dealer-name"
                value={dealer}
                onChange={(event) => setDealer(event.target.value)}
                placeholder="Sri Lakshmi Textiles"
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label>Salesperson</Label>
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
              <Label>State</Label>
              <Select
                value={state}
                onValueChange={(value) => setState(value as Dealer["state"])}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Telangana">Telangana</SelectItem>
                  <SelectItem value="Andhra Pradesh">Andhra Pradesh</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dealer-pin">PIN code</Label>
              <Input
                id="dealer-pin"
                value={pincode}
                onChange={(event) =>
                  setPincode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                inputMode="numeric"
                placeholder="500001"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dealer-area">Area</Label>
              <Input
                id="dealer-area"
                value={area}
                onChange={(event) => setArea(event.target.value)}
                placeholder="Nampally"
              />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? "Locating PIN…" : "Add to map"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ImportDealersDialog({
  onImport,
}: {
  onImport: (dealers: Array<Omit<Dealer, "id">>) => number;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<Dealer["state"]>("Telangana");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
        defval: "",
      });
      if (!rows.length) throw new Error("The first worksheet is empty.");
      if (rows.length > 50) {
        throw new Error("This prototype accepts up to 50 rows per import.");
      }

      const normalize = (value: string) =>
        value.trim().toUpperCase().replace(/[._-]+/g, " ").replace(/\s+/g, " ");
      const valueFor = (row: Record<string, unknown>, names: string[]) => {
        const entry = Object.entries(row).find(([key]) =>
          names.includes(normalize(key)),
        );
        return entry ? String(entry[1]).trim() : "";
      };

      const prepared = rows
        .map((row) => ({
          salesperson: valueFor(row, ["SALES PERSON", "SALESPERSON"]),
          dealer: valueFor(row, ["DEALER NAME", "DEALER"]),
          pincode: valueFor(row, ["PINCODE", "PIN CODE"]).replace(/\D/g, ""),
          area: valueFor(row, ["AREA", "AREA NAME"]),
        }))
        .filter(
          (row) =>
            row.salesperson && row.dealer && row.area && /^\d{6}$/.test(row.pincode),
        );
      if (!prepared.length) {
        throw new Error(
          "No valid rows found. Required columns: SALES PERSON, DEALER NAME, PINCODE and AREA.",
        );
      }

      const coordinatesByPin = new Map<string, [number, number]>();
      const unknownPins = [
        ...new Set(
          prepared
            .map((row) => row.pincode)
            .filter((pincode) => !PIN_COORDINATES[pincode]),
        ),
      ];
      if (unknownPins.length > 10) {
        throw new Error(
          "This prototype can locate up to 10 new PIN codes per import. Split the file and try again.",
        );
      }
      for (const pincode of unknownPins) {
        const coordinates = await geocodePincode(pincode, state);
        if (coordinates) coordinatesByPin.set(pincode, coordinates);
        await new Promise((resolve) => setTimeout(resolve, 1100));
      }

      const mapped = prepared.flatMap((row) => {
        const coordinates =
          PIN_COORDINATES[row.pincode] ?? coordinatesByPin.get(row.pincode);
        if (!coordinates) return [];
        return [
          {
            ...row,
            salesperson: row.salesperson.toUpperCase(),
            dealer: row.dealer.toUpperCase(),
            area: row.area.toUpperCase(),
            state,
            longitude: coordinates[0],
            latitude: coordinates[1],
          },
        ];
      });
      const added = onImport(mapped);
      toast.success(
        added
          ? added + " dealer" + (added === 1 ? "" : "s") + " added to the map."
          : "All valid rows were already on the map.",
      );
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          aria-label="Import Excel"
          className="h-9 border-white/20 bg-white/8 text-white hover:bg-white/14 hover:text-white"
        >
          <Upload className="h-4 w-4" />
          <span className="hidden sm:inline">Import Excel</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="border-[#d9dedb] bg-white sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Import dealers</DialogTitle>
          <DialogDescription>
            Upload an Excel or CSV file with the agreed four columns. The first
            worksheet will be imported.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border border-[#d9dedb] bg-[#f6f8f6] p-4">
          <div className="flex items-start gap-3">
            <FileSpreadsheet className="mt-0.5 h-5 w-5 text-[#173a34]" />
            <div>
              <p className="text-sm font-semibold">
                SALES PERSON · DEALER NAME · PINCODE · AREA
              </p>
              <p className="mt-1 text-xs leading-5 text-[#6f7975]">
                Up to 50 rows. Choose the state used for rows in this file.
                Changes are saved in this browser for the prototype.
              </p>
            </div>
          </div>
        </div>
        <div className="grid gap-2">
          <Label>State for imported rows</Label>
          <Select
            value={state}
            onValueChange={(value) => setState(value as Dealer["state"])}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Telangana">Telangana</SelectItem>
              <SelectItem value="Andhra Pradesh">Andhra Pradesh</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={importFile}
          className="sr-only"
          id="dealer-import"
        />
        <DialogFooter>
          <Button
            className="w-full sm:w-auto"
            disabled={importing}
            onClick={() => fileRef.current?.click()}
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {importing ? "Reading and locating PINs…" : "Choose Excel file"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Home() {
  const [dealers, setDealers] = useState<Dealer[]>(INITIAL_DEALERS);
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [activePeople, setActivePeople] = useState<string[]>([
    "KIRAN",
    "MADHU",
    "CHANDER",
  ]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [focusRequest, setFocusRequest] = useState<Dealer | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("dealer-territory-map-records-v2");
      if (saved) {
        const parsed = JSON.parse(saved) as Dealer[];
        if (Array.isArray(parsed) && parsed.length) setDealers(parsed);
      }
    } catch {
      window.localStorage.removeItem("dealer-territory-map-records-v2");
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(
      "dealer-territory-map-records-v2",
      JSON.stringify(dealers),
    );
  }, [dealers, hydrated]);

  const salespeople = useMemo(
    () => [...new Set(dealers.map((dealer) => dealer.salesperson))].sort(),
    [dealers],
  );

  useEffect(() => {
    setActivePeople((current) => [
      ...new Set([...current, ...salespeople]),
    ]);
  }, [salespeople]);

  const filteredDealers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return dealers.filter((dealer) => {
      const matchesPerson = activePeople.includes(dealer.salesperson);
      const matchesQuery =
        !normalized ||
        [dealer.dealer, dealer.area, dealer.pincode, dealer.salesperson]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      return matchesPerson && matchesQuery;
    });
  }, [activePeople, dealers, query]);

  const selectedDealer =
    dealers.find((dealer) => dealer.id === selectedId) ?? null;
  const reviewCount = dealers.filter((dealer) => dealer.reviewNote).length;
  const uniquePins = new Set(dealers.map((dealer) => dealer.pincode)).size;

  const selectDealer = (dealer: Dealer) => {
    setSelectedId(dealer.id);
    setFocusRequest(dealer);
  };

  const togglePerson = (person: string) => {
    setActivePeople((current) =>
      current.includes(person)
        ? current.filter((item) => item !== person)
        : [...current, person],
    );
  };

  const addDealer = (dealer: Omit<Dealer, "id">) => {
    const next = {
      ...dealer,
      id: Math.max(0, ...dealers.map((item) => item.id)) + 1,
    };
    setDealers((current) => [...current, next]);
    setActivePeople((current) => [...new Set([...current, next.salesperson])]);
    selectDealer(next);
    toast.success(next.dealer + " added.");
  };

  const importDealers = (incoming: Array<Omit<Dealer, "id">>) => {
    const existing = new Set(
      dealers.map(
        (dealer) =>
          dealer.salesperson + "|" + dealer.dealer + "|" + dealer.pincode,
      ),
    );
    let nextId = Math.max(0, ...dealers.map((item) => item.id)) + 1;
    const additions = incoming
      .filter(
        (dealer) =>
          !existing.has(
            dealer.salesperson + "|" + dealer.dealer + "|" + dealer.pincode,
          ),
      )
      .map((dealer) => ({ ...dealer, id: nextId++ }));
    if (additions.length) {
      setDealers((current) => [...current, ...additions]);
      setActivePeople((current) => [
        ...new Set([
          ...current,
          ...additions.map((dealer) => dealer.salesperson),
        ]),
      ]);
    }
    return additions.length;
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

    void Promise.resolve(
      context.registerTool(
        {
          name: "add_dealer",
          title: "Add dealer",
          description:
            "Geocode a six-digit Indian PIN code and add one dealer to the visible territory map.",
          inputSchema: {
            type: "object",
            properties: {
              salesperson: { type: "string" },
              dealer: { type: "string" },
              pincode: { type: "string", pattern: "^\\d{6}$" },
              area: { type: "string" },
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
            const coordinates = await geocodePincode(
              candidate.pincode,
              candidate.state,
            );
            if (!coordinates) throw new Error("PIN code could not be located.");
            const next: Dealer = {
              id: Math.max(0, ...dealers.map((dealer) => dealer.id)) + 1,
              salesperson: candidate.salesperson.trim().toUpperCase(),
              dealer: candidate.dealer.trim().toUpperCase(),
              pincode: candidate.pincode,
              area: candidate.area.trim().toUpperCase(),
              state: candidate.state,
              longitude: coordinates[0],
              latitude: coordinates[1],
            };
            setDealers((current) => [...current, next]);
            setActivePeople((current) => [
              ...new Set([...current, next.salesperson]),
            ]);
            setSelectedId(next.id);
            setFocusRequest(next);
            return { id: next.id, status: "added", dealer: next.dealer };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);

    return () => lifecycle.abort();
  }, [dealers]);

  return (
    <main className="min-h-screen bg-[#eef0ed] text-[#18221f]">
      <header className="flex h-[72px] items-center justify-between border-b border-white/10 bg-[#173a34] px-4 text-white sm:px-6">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#d9f36b] text-[#173a34] shadow-inner">
            <MapPinned className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-base font-semibold tracking-[-0.01em] sm:text-lg">
              Dealer Territory Map
            </h1>
            <p className="text-xs text-white/62">Telangana + Andhra Pradesh</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="mr-2 hidden items-center gap-6 text-sm xl:flex">
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
                PINs
              </span>
              <span className="font-semibold">{uniquePins}</span>
            </div>
            <Badge className="border-amber-300/30 bg-amber-300/12 text-amber-100 hover:bg-amber-300/12">
              {reviewCount} data checks
            </Badge>
          </div>
          <ImportDealersDialog onImport={importDealers} />
          <AddDealerDialog salespeople={salespeople} onAdd={addDealer} />
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-72px)] grid-cols-1 lg:grid-cols-[330px_minmax(0,1fr)]">
        <aside className="z-10 flex max-h-[44vh] flex-col border-r border-[#d9dedb] bg-[#f7f8f6] lg:max-h-[calc(100vh-72px)]">
          <div className="border-b border-[#dde2df] p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#75807c]" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search dealer, area or PIN"
                className="h-11 border-[#d7dcda] bg-white pl-9 text-[15px] shadow-none focus-visible:ring-[#2f6fe4]"
                aria-label="Search dealers"
              />
              {query ? (
                <button
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-[#75807c] hover:bg-[#eef0ed]"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between text-xs font-semibold text-[#65716d]">
                <span>Sales coverage</span>
                <span>{filteredDealers.length} visible</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {salespeople.map((person) => {
                  const active = activePeople.includes(person);
                  return (
                    <button
                      key={person}
                      onClick={() => togglePerson(person)}
                      aria-pressed={active}
                      className={
                        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition " +
                        (active
                          ? "border-[#b8c1bd] bg-white text-[#25312d] shadow-sm"
                          : "border-transparent bg-[#e8ebe9] text-[#87908d]")
                      }
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{
                          backgroundColor: active
                            ? getSalespersonColor(person)
                            : "#a9b0ad",
                        }}
                      />
                      {person}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {filteredDealers.length ? (
              <ul className="space-y-1">
                {filteredDealers.map((dealer) => (
                  <li key={dealer.id}>
                    <button
                      onClick={() => selectDealer(dealer)}
                      className={
                        "group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition " +
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
                    Change the search or salesperson filter.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-[#dde2df] bg-white/70 p-4">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 h-3 w-3 shrink-0 rounded-sm border border-[#7d8884] bg-[#c9cecb]" />
              <div>
                <p className="text-xs font-semibold text-[#4f5a56]">
                  Unassigned coverage
                </p>
                <p className="mt-0.5 text-[11px] leading-4 text-[#7a8581]">
                  Grey areas have no dealer territory in the sample. Andhra Pradesh
                  currently has no rows in the workbook.
                </p>
              </div>
            </div>
          </div>
        </aside>

        <section className="relative min-h-[56vh] overflow-hidden">
          <TerritoryMap
            dealers={filteredDealers}
            selectedId={selectedId}
            onSelect={(id) => {
              const dealer = dealers.find((item) => item.id === id);
              if (dealer) selectDealer(dealer);
            }}
            focusRequest={focusRequest}
          />

          {selectedDealer ? (
            <article className="absolute right-4 top-4 w-[min(360px,calc(100%-32px))] rounded-2xl border border-white/70 bg-white/95 p-4 shadow-[0_18px_44px_rgba(23,58,52,0.18)] backdrop-blur sm:p-5">
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
      <Toaster position="top-center" richColors />
    </main>
  );
}
