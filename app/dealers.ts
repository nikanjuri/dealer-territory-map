export type Dealer = {
  id: number;
  salesperson: string;
  dealer: string;
  pincode: string;
  area: string;
  state: "Telangana" | "Andhra Pradesh";
  latitude: number;
  longitude: number;
  reviewNote?: string;
};

export const SALESPERSON_COLORS: Record<string, string> = {
  KIRAN: "#df4e3f",
  MADHU: "#2f6fe4",
  CHANDER: "#c48a12",
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

export const INITIAL_DEALERS: Dealer[] = [
  {
    id: 1,
    salesperson: "KIRAN",
    dealer: "SRI BALAJI KHADI",
    pincode: "500001",
    area: "SHAMSHABAD",
    state: "Telangana",
    latitude: 17.3988564,
    longitude: 78.4722552,
    reviewNote: "PIN 500001 resolves to central Hyderabad, not Shamshabad.",
  },
  {
    id: 2,
    salesperson: "KIRAN",
    dealer: "SRI SANDHYA SILKS",
    pincode: "509209",
    area: "NAGAKURNOOL",
    state: "Telangana",
    latitude: 16.4808,
    longitude: 78.3756056,
  },
  {
    id: 3,
    salesperson: "KIRAN",
    dealer: "SV MENS WEAR",
    pincode: "500070",
    area: "VANSATHALIPURAM",
    state: "Telangana",
    latitude: 17.3330243,
    longitude: 78.5733135,
  },
  {
    id: 4,
    salesperson: "MADHU",
    dealer: "CORONET BINNY TEXTILES",
    pincode: "506001",
    area: "HANAMKONDA",
    state: "Telangana",
    latitude: 18.0034235,
    longitude: 79.561234,
  },
  {
    id: 5,
    salesperson: "MADHU",
    dealer: "KASAM PULLIAH",
    pincode: "506002",
    area: "WARNGAL",
    state: "Telangana",
    latitude: 17.9772682,
    longitude: 79.6025426,
    reviewNote: "Area appears to be a spelling variation of Warangal.",
  },
  {
    id: 6,
    salesperson: "MADHU",
    dealer: "SUJATHA SILKS",
    pincode: "508001",
    area: "NALGONDA",
    state: "Telangana",
    latitude: 17.0582113,
    longitude: 79.268293,
  },
  {
    id: 7,
    salesperson: "MADHU",
    dealer: "YUVRAJ GENTS COLLECTION",
    pincode: "508213",
    area: "SURYAPET",
    state: "Telangana",
    latitude: 17.1426695,
    longitude: 79.625106,
  },
  {
    id: 8,
    salesperson: "CHANDER",
    dealer: "CHANDRAM KHADI EMPORIUM",
    pincode: "500004",
    area: "LAKDIKAPUL",
    state: "Telangana",
    latitude: 17.4036318,
    longitude: 78.4620369,
  },
  {
    id: 9,
    salesperson: "CHANDER",
    dealer: "KN FASHION",
    pincode: "500007",
    area: "HABSIGUDA",
    state: "Telangana",
    latitude: 17.417663,
    longitude: 78.5308281,
  },
  {
    id: 10,
    salesperson: "CHANDER",
    dealer: "POONAM SELECTIONS",
    pincode: "500004",
    area: "SHAHPUR NAGAR",
    state: "Telangana",
    latitude: 17.3976318,
    longitude: 78.4700369,
    reviewNote: "PIN 500004 resolves to Khairatabad; confirm the Shahpur Nagar area.",
  },
];
