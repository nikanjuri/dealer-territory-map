import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import * as XLSX from "xlsx";

const deliveryMirror =
  "https://raw.githubusercontent.com/dropdevrahul/pincodes-india/main/pincode.csv";
const sourceCatalog =
  "https://www.data.gov.in/resource/all-india-pincode-directory-till-last-month";
const response = await fetch(deliveryMirror);
if (!response.ok) {
  throw new Error(`Postal directory download failed: ${response.status}`);
}

const bytes = Buffer.from(await response.arrayBuffer());
const workbook = XLSX.read(bytes, { type: "buffer" });
const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
const selectedStates = new Map([
  ["ANDAMAN AND NICOBAR ISLANDS", "Andaman and Nicobar Islands"],
  ["ANDHRA PRADESH", "Andhra Pradesh"],
  ["ARUNACHAL PRADESH", "Arunachal Pradesh"],
  ["ASSAM", "Assam"],
  ["BIHAR", "Bihar"],
  ["CHANDIGARH", "Chandigarh"],
  ["CHHATTISGARH", "Chhattisgarh"],
  ["DELHI", "Delhi"],
  ["GOA", "Goa"],
  ["GUJARAT", "Gujarat"],
  ["HARYANA", "Haryana"],
  ["HIMACHAL PRADESH", "Himachal Pradesh"],
  ["JAMMU AND KASHMIR", "Jammu and Kashmir"],
  ["JHARKHAND", "Jharkhand"],
  ["KARNATAKA", "Karnataka"],
  ["KERALA", "Kerala"],
  ["LADAKH", "Ladakh"],
  ["LAKSHADWEEP", "Lakshadweep"],
  ["MADHYA PRADESH", "Madhya Pradesh"],
  ["MAHARASHTRA", "Maharashtra"],
  ["MANIPUR", "Manipur"],
  ["MEGHALAYA", "Meghalaya"],
  ["MIZORAM", "Mizoram"],
  ["NAGALAND", "Nagaland"],
  ["ODISHA", "Odisha"],
  ["PUDUCHERRY", "Puducherry"],
  ["PUNJAB", "Punjab"],
  ["RAJASTHAN", "Rajasthan"],
  ["SIKKIM", "Sikkim"],
  ["TAMIL NADU", "Tamil Nadu"],
  ["TELANGANA", "Telangana"],
  ["THE DADRA AND NAGAR HAVELI AND DAMAN AND DIU", "Dadra and Nagar Haveli and Daman and Diu"],
  ["TRIPURA", "Tripura"],
  ["UTTAR PRADESH", "Uttar Pradesh"],
  ["UTTARAKHAND", "Uttarakhand"],
  ["WEST BENGAL", "West Bengal"],
]);
const grouped = new Map();

for (const row of rows) {
  const state = selectedStates.get(String(row.StateName).trim().toUpperCase());
  const pincode = String(row.Pincode).replace(/\D/g, "").slice(0, 6);
  if (!state || !/^\d{6}$/.test(pincode)) continue;

  const key = `${pincode}|${state}`;
  const current = grouped.get(key) ?? {
    pincode,
    state,
    districts: new Set(),
    offices: new Set(),
    blocks: new Set(),
  };
  const district = String(row.District).trim();
  const office = String(row.OfficeName).trim();
  const block = String(row.Block ?? row.Taluk ?? "").trim();
  if (district) current.districts.add(district);
  if (office) current.offices.add(office);
  if (block && block.toUpperCase() !== "NA") current.blocks.add(block);
  grouped.set(key, current);
}

const records = {};
for (const entry of [...grouped.values()].sort((left, right) =>
  `${left.pincode}|${left.state}`.localeCompare(
    `${right.pincode}|${right.state}`,
  ),
)) {
  records[entry.pincode] ??= {};
  records[entry.pincode][entry.state] = {
    state: entry.state,
    districts: [...entry.districts].sort(),
    offices: [...entry.offices].sort(),
    blocks: [...entry.blocks].sort(),
  };
}

if (grouped.size < 19_000) {
  throw new Error("Postal extract is unexpectedly small; refusing to replace it.");
}

const retrievedAt = new Date().toISOString().slice(0, 10);
const output = {
  meta: {
    generatedAt: new Date().toISOString(),
    retrievedAt,
    sourceAuthority: "Ministry of Communications, Department of Posts",
    sourceCatalog,
    deliveryMirror,
    license: "Government Open Data License - India",
    sourceSha256: createHash("sha256").update(bytes).digest("hex"),
    scope: "India",
  },
  records,
};

const outputUrl = new URL(
  "../public/data/postal-directory-ap-ts.json",
  import.meta.url,
);
await fs.mkdir(new URL("../public/data/", import.meta.url), { recursive: true });
await fs.writeFile(outputUrl, JSON.stringify(output));
console.log(
  `Saved ${grouped.size} all-India entries across ${Object.keys(records).length} PIN codes.`,
);
