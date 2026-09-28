import type { IndianState } from "../lib/indian-states.ts";

export type Dealer = {
  id: number;
  salesperson: string;
  dealer: string;
  pincode: string;
  area: string;
  sourceArea?: string;
  address?: string;
  state: IndianState;
  latitude: number;
  longitude: number;
  locationPrecision?: "address" | "pincode";
  googlePlaceId?: string;
  geocodedAddress?: string;
  reviewNote?: string;
  postalSuggestions?: string[];
  validationStatus?: "verified" | "review" | "invalid" | "unavailable";
  validationSource?: "postal-directory" | "manual";
  validationCheckedAt?: string;
  validationDataset?: string;
};

export const SALESPERSON_COLORS: Record<string, string> = {
  KIRAN: "#df4e3f",
  MADHU: "#2f6fe4",
  CHANDAR: "#c48a12",
  GHANSHYAM: "#7c3aed",
  JIGNESH: "#5967b8",
  "OM SHANKAR": "#be185d",
  RANGAIAH: "#0f766e",
  RAVI: "#4f46e5",
  SONU: "#15803d",
  SUBHASH: "#92400e",
  VENKATESH: "#0e7490",
  "VIJAY KUMAR": "#c2410c",
};

const FALLBACK_COLORS = [
  "#7c4fd4",
  "#128278",
  "#c95587",
  "#df7134",
  "#5967b8",
  "#507f37",
];

export function getSalespersonColor(name: string) {
  if (SALESPERSON_COLORS[name]) return SALESPERSON_COLORS[name];
  const hash = [...name].reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

export function getReadableTextColor(backgroundColor: string) {
  const hex = backgroundColor.replace("#", "");
  if (!/^[\da-f]{6}$/i.test(hex)) return "#ffffff";
  const channels = [0, 2, 4].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  const whiteContrast = 1.05 / (luminance + 0.05);
  const darkContrast = (luminance + 0.05) / 0.05;
  return whiteContrast >= darkContrast ? "#ffffff" : "#111827";
}
