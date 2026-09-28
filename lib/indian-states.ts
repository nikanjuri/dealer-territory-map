export const INDIAN_STATES = [
  "Telangana",
  "Andhra Pradesh",
  "Karnataka",
  "Andaman and Nicobar Islands",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
] as const;

export type IndianState = (typeof INDIAN_STATES)[number];

const STATE_ALIASES = new Map<string, IndianState>([
  ...INDIAN_STATES.map((state) => [
    state.toUpperCase().replace(/[^A-Z0-9]/g, ""),
    state,
  ] as const),
  ["AP", "Andhra Pradesh"],
  ["TG", "Telangana"],
  ["TS", "Telangana"],
  ["KA", "Karnataka"],
  ["OD", "Odisha"],
  ["ORISSA", "Odisha"],
  ["PONDICHERRY", "Puducherry"],
]);

export function normalizeIndianState(value: string): IndianState | null {
  return STATE_ALIASES.get(value.toUpperCase().replace(/[^A-Z0-9]/g, "")) ?? null;
}
