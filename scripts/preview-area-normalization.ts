import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import * as XLSX from "xlsx";
import {
  canonicalizeAreaName,
  normalizeAreaKey,
} from "../lib/area-normalization";

const POSTAL_SOURCE =
  "https://raw.githubusercontent.com/dropdevrahul/pincodes-india/main/pincode.csv";
const INCLUDED_STATES = new Set([
  "ANDHRA PRADESH",
  "KARNATAKA",
  "TELANGANA",
]);
const OUTPUT_DIRECTORY = path.resolve(
  process.argv[2] ?? "outputs/area-normalization-preview-2026-09-17",
);

type DealerRow = {
  id: number;
  dealer: string;
  pincode: string;
  area: string;
  source_area: string | null;
  state: string;
};

type PostalEntry = {
  state: string;
  districts: string[];
  offices: string[];
};

type Candidate = {
  display: string;
  key: string;
  kind: "office" | "district";
  source: string;
};

type PreviewRow = {
  decision: "high-confidence" | "review" | "no-change" | "no-proposal";
  confidence: number;
  affectedDealers: number;
  state: string;
  pincode: string;
  currentArea: string;
  sourceAreas: string[];
  proposedArea: string;
  postalOffice: string;
  postalDistrict: string;
  reason: string;
  sampleDealers: string[];
  dealerIds: number[];
};

function titleCase(value: string) {
  return value
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\b(?:Gpo|Ho|So|Bo)\b/g, (value) => value.toUpperCase());
}

function cleanPostalOffice(value: string) {
  return value
    .replace(/\s+[BSH]\s*\.?\s*O\.?\s*(?:\([^)]*\))?$/i, "")
    .replace(/\s*\([A-Z]{1,4}\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(left: string, right: string) {
  if (!left) return right.length;
  if (!right) return left.length;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function similarity(left: string, right: string) {
  const longest = Math.max(left.length, right.length);
  return longest ? 1 - levenshtein(left, right) / longest : 1;
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function districtStrippedKeys(area: string, districts: string[]) {
  const original = normalizeAreaKey(area);
  const variants = new Set([original]);
  for (const district of districts) {
    const districtKey = normalizeAreaKey(district);
    const districtVariants = new Set([
      districtKey,
      districtKey.replace(/\bMAHABUBNAGAR\b/g, "MBNR"),
      districtKey.replace(/\bANANTAPUR\b/g, "ANANTHAPUR"),
      districtKey.replace(/\bWANAPARTHY\b/g, "WANAPARTHI"),
    ]);
    for (const variant of districtVariants) {
      if (!variant) continue;
      variants.add(
        original
          .replace(new RegExp(`\\s+(?:DIST|DT)?\\s*${variant}$`), "")
          .replace(new RegExp(`^${variant}\\s+(?:DIST|DT)?\\s*`), "")
          .trim(),
      );
    }
  }
  return [...variants].filter(Boolean);
}

function postalCandidates(entry: PostalEntry) {
  const candidates: Candidate[] = [];
  for (const office of entry.offices) {
    const display = canonicalizeAreaName(cleanPostalOffice(office));
    const key = normalizeAreaKey(display);
    if (key) candidates.push({ display, key, kind: "office", source: office });
  }
  for (const district of entry.districts) {
    const display = titleCase(district);
    const key = normalizeAreaKey(display);
    if (key) candidates.push({ display, key, kind: "district", source: district });
  }
  return candidates.filter(
    (candidate, index, values) =>
      values.findIndex(
        (value) => value.key === candidate.key && value.kind === candidate.kind,
      ) === index,
  );
}

function csvEscape(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const response = await fetch(POSTAL_SOURCE);
if (!response.ok) {
  throw new Error(`Postal source download failed (${response.status}).`);
}
const postalBytes = Buffer.from(await response.arrayBuffer());
const workbook = XLSX.read(postalBytes, { type: "buffer" });
const worksheet = workbook.Sheets[workbook.SheetNames[0]];
const postalRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
  defval: "",
});

const postalDirectory = new Map<string, PostalEntry>();
for (const row of postalRows) {
  const stateKey = String(row.StateName).trim().toUpperCase();
  if (!INCLUDED_STATES.has(stateKey)) continue;
  const state = titleCase(stateKey);
  const pincode = String(row.Pincode).replace(/\D/g, "").slice(0, 6);
  if (!/^\d{6}$/.test(pincode)) continue;
  const key = `${pincode}|${state}`;
  const entry = postalDirectory.get(key) ?? {
    state,
    districts: [],
    offices: [],
  };
  const district = String(row.District).trim();
  const office = String(row.OfficeName).trim();
  if (district) entry.districts.push(district);
  if (office) entry.offices.push(office);
  entry.districts = unique(entry.districts).sort();
  entry.offices = unique(entry.offices).sort();
  postalDirectory.set(key, entry);
}

const sql = neon(databaseUrl);
const dealers = (await sql`
  SELECT id, name AS dealer, pincode, area, source_area, state::text
  FROM dealers
  WHERE state::text IN ('Telangana', 'Andhra Pradesh', 'Karnataka')
  ORDER BY state, pincode, area, id
`) as DealerRow[];

const groups = new Map<string, DealerRow[]>();
const pinAreaCounts = new Map<string, Map<string, { display: string; count: number }>>();
for (const dealer of dealers) {
  const groupKey = `${dealer.state}|${dealer.pincode}|${normalizeAreaKey(dealer.area)}`;
  groups.set(groupKey, [...(groups.get(groupKey) ?? []), dealer]);
  const pinKey = `${dealer.state}|${dealer.pincode}`;
  const counts = pinAreaCounts.get(pinKey) ?? new Map();
  const areaKey = normalizeAreaKey(dealer.area);
  const current = counts.get(areaKey) ?? { display: dealer.area, count: 0 };
  current.count += 1;
  counts.set(areaKey, current);
  pinAreaCounts.set(pinKey, counts);
}

const preview: PreviewRow[] = [];
for (const rows of groups.values()) {
  const first = rows[0];
  const pinKey = `${first.state}|${first.pincode}`;
  const entry = postalDirectory.get(`${first.pincode}|${first.state}`);
  const currentKey = normalizeAreaKey(first.area);
  let proposedArea = first.area;
  let postalOffice = "";
  let confidence = 1;
  let decision: PreviewRow["decision"] = "no-change";
  let reason = "Current area already matches a postal or stable display form.";
  let candidates: Candidate[] = [];

  if (entry) {
    const areaKeys = districtStrippedKeys(first.area, entry.districts);
    candidates = postalCandidates(entry);
    const scored = candidates
      .flatMap((candidate) =>
        areaKeys.map((areaKey) => ({
          candidate,
          areaKey,
          score: similarity(areaKey, candidate.key),
        })),
      )
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        if (left.candidate.kind !== right.candidate.kind) {
          return left.candidate.kind === "office" ? -1 : 1;
        }
        return left.candidate.display.length - right.candidate.display.length;
      });
    const best = scored[0];
    const nextDistinct = scored.find(
      (candidate) => candidate.candidate.key !== best?.candidate.key,
    );
    const margin = best ? best.score - (nextDistinct?.score ?? 0) : 0;
    const strippedDistrict = best && best.areaKey !== currentKey;

    if (best?.score === 1 && !strippedDistrict) {
      proposedArea = first.area;
      postalOffice = best.candidate.source;
    } else if (best && best.score === 1 && strippedDistrict) {
      proposedArea = best.candidate.display;
      postalOffice = best.candidate.source;
      confidence = 0.99;
      decision = proposedArea === first.area ? "no-change" : "high-confidence";
      reason = `Removing a district qualifier leaves an exact ${best.candidate.kind} match for this PIN.`;
    } else if (best && best.score >= 0.88 && margin >= 0.05) {
      proposedArea = best.candidate.display;
      postalOffice = best.candidate.source;
      confidence = Number(best.score.toFixed(3));
      const matchingPeer = pinAreaCounts.get(pinKey)?.get(best.candidate.key);
      decision =
        proposedArea === first.area
          ? "no-change"
          : matchingPeer
            ? "high-confidence"
            : "review";
      reason = matchingPeer
        ? `The postal ${best.candidate.kind} candidate is already used by ${matchingPeer.count} other dealer${matchingPeer.count === 1 ? "" : "s"} in this exact PIN.`
        : `Strong postal ${best.candidate.kind} spelling match, but transliteration differences require review before changing the business locality.`;
    } else if (best && best.score >= 0.72) {
      proposedArea = best.candidate.display;
      postalOffice = best.candidate.source;
      confidence = Number(best.score.toFixed(3));
      decision = proposedArea === first.area ? "no-change" : "review";
      reason = `Possible ${best.candidate.kind} match within the exact PIN, but the spelling or candidate margin is not safe enough to automate.`;
    } else {
      decision = "no-proposal";
      confidence = Number((best?.score ?? 0).toFixed(3));
      reason = "The business locality is not represented closely enough in the postal office or district names for this PIN.";
    }
  } else {
    decision = "no-proposal";
    confidence = 0;
    reason = "No postal record was found for this exact PIN and state in the three-state extract.";
  }

  if (decision === "no-proposal" || decision === "review") {
    const peerCandidates = [...(pinAreaCounts.get(pinKey)?.entries() ?? [])]
      .filter(([key]) => key !== currentKey)
      .map(([key, value]) => ({
        ...value,
        key,
        score: similarity(currentKey, key),
        postalSupported: candidates.some((candidate) => candidate.key === key),
      }))
      .filter(
        (candidate) =>
          candidate.score >= 0.8 &&
          candidate.count > rows.length &&
          levenshtein(currentKey, candidate.key) <= 2,
      )
      .sort(
        (left, right) =>
          Number(right.postalSupported) - Number(left.postalSupported) ||
          right.score - left.score ||
          right.count - left.count,
      );
    const peer = peerCandidates[0];
    if (peer) {
      proposedArea = peer.display;
      confidence = Number(Math.max(peer.score, 0.9).toFixed(3));
      decision = "high-confidence";
      reason = `Same-PIN spelling cluster: ${peer.count} dealer${peer.count === 1 ? "" : "s"} already use “${peer.display}”, versus ${rows.length} using “${first.area}”.`;
    }
  }

  if (
    (decision === "high-confidence" || decision === "review") &&
    normalizeAreaKey(proposedArea) === currentKey
  ) {
    decision = "no-change";
    proposedArea = first.area;
  }

  preview.push({
    decision,
    confidence,
    affectedDealers: rows.length,
    state: first.state,
    pincode: first.pincode,
    currentArea: first.area,
    sourceAreas: unique(
      rows.map((row) => row.source_area?.trim() || row.area),
    ).sort(),
    proposedArea,
    postalOffice,
    postalDistrict: entry?.districts.join(" / ") ?? "",
    reason,
    sampleDealers: rows.slice(0, 5).map((row) => row.dealer),
    dealerIds: rows.map((row) => row.id),
  });
}

preview.sort((left, right) => {
  const order = {
    "high-confidence": 0,
    review: 1,
    "no-proposal": 2,
    "no-change": 3,
  };
  return (
    order[left.decision] - order[right.decision] ||
    right.affectedDealers - left.affectedDealers ||
    left.state.localeCompare(right.state) ||
    left.pincode.localeCompare(right.pincode) ||
    left.currentArea.localeCompare(right.currentArea)
  );
});

const changed = preview.filter((row) => row.decision !== "no-change");
const summary = Object.fromEntries(
  ["high-confidence", "review", "no-proposal", "no-change"].map((decision) => {
    const matching = preview.filter((row) => row.decision === decision);
    return [
      decision,
      {
        areaGroups: matching.length,
        dealers: matching.reduce((sum, row) => sum + row.affectedDealers, 0),
      },
    ];
  }),
);

await fs.mkdir(OUTPUT_DIRECTORY, { recursive: true });
const generatedAt = new Date().toISOString();
const postalSha256 = createHash("sha256").update(postalBytes).digest("hex");
await fs.writeFile(
  path.join(OUTPUT_DIRECTORY, "preview.json"),
  JSON.stringify(
    {
      generatedAt,
      readOnly: true,
      states: [...INCLUDED_STATES].map(titleCase),
      postalSource: POSTAL_SOURCE,
      postalSha256,
      dealerCount: dealers.length,
      uniqueAreaPinStateGroups: preview.length,
      summary,
      rows: preview,
    },
    null,
    2,
  ),
);

const headers = [
  "decision",
  "confidence",
  "affected_dealers",
  "state",
  "pincode",
  "current_area",
  "source_areas",
  "proposed_area",
  "postal_office_evidence",
  "postal_district",
  "reason",
  "sample_dealers",
];
const csv = [
  headers.join(","),
  ...preview.map((row) =>
    [
      row.decision,
      row.confidence,
      row.affectedDealers,
      row.state,
      row.pincode,
      row.currentArea,
      row.sourceAreas.join(" | "),
      row.proposedArea,
      row.postalOffice,
      row.postalDistrict,
      row.reason,
      row.sampleDealers.join(" | "),
    ]
      .map(csvEscape)
      .join(","),
  ),
].join("\n");
await fs.writeFile(path.join(OUTPUT_DIRECTORY, "preview.csv"), `${csv}\n`);

const notable = changed.slice(0, 40);
const markdown = `# Area normalization preview

Generated: ${generatedAt}

This is a read-only preview. No dealer records were changed.

## Scope

- Dealers: ${dealers.length}
- Unique area/PIN/state groups: ${preview.length}
- States: Telangana, Andhra Pradesh, Karnataka
- Postal source: All India Pincode Directory delivery mirror
- Postal source SHA-256: \`${postalSha256}\`

## Decisions

| Decision | Area groups | Dealers |
| --- | ---: | ---: |
${Object.entries(summary)
  .map(
    ([decision, counts]) =>
      `| ${decision} | ${counts.areaGroups} | ${counts.dealers} |`,
  )
  .join("\n")}

## Highest-impact proposed changes

| Decision | Dealers | State | PIN | Current | Proposed | Evidence |
| --- | ---: | --- | --- | --- | --- | --- |
${notable
  .map(
    (row) =>
      `| ${row.decision} | ${row.affectedDealers} | ${row.state} | ${row.pincode} | ${row.currentArea.replaceAll("|", "\\|")} | ${row.proposedArea.replaceAll("|", "\\|")} | ${(row.postalOffice || row.reason).replaceAll("|", "\\|")} |`,
  )
  .join("\n")}

## Interpretation

- **high-confidence**: exact postal match after removing a matching district qualifier, a strong unambiguous spelling match within the exact PIN, or a dominant same-PIN spelling cluster.
- **review**: a plausible postal candidate exists but should not be applied automatically.
- **no-proposal**: the dealer uses a colloquial locality or the postal evidence is insufficient.
- **no-change**: no display-name change is proposed.

The complete evidence is in \`preview.csv\` and \`preview.json\`.
`;
await fs.writeFile(path.join(OUTPUT_DIRECTORY, "README.md"), markdown);

console.log(
  JSON.stringify(
    {
      outputDirectory: OUTPUT_DIRECTORY,
      dealerCount: dealers.length,
      uniqueAreaPinStateGroups: preview.length,
      summary,
      postalSha256,
    },
    null,
    2,
  ),
);
