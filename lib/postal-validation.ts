export type PostalState = "Telangana" | "Andhra Pradesh";

export type PostalDirectoryEntry = {
  state: PostalState;
  districts: string[];
  offices: string[];
  blocks: string[];
};

export type PostalDirectory = {
  meta: {
    generatedAt: string;
    retrievedAt: string;
    sourceAuthority: string;
    sourceCatalog: string;
    deliveryMirror: string;
    license: string;
    sourceSha256: string;
  };
  records: Record<
    string,
    Partial<Record<PostalState, PostalDirectoryEntry>>
  >;
};

export type PostalValidationStatus =
  | "verified"
  | "review"
  | "invalid"
  | "unavailable";

export type PostalValidationResult = {
  status: PostalValidationStatus;
  message: string;
  suggestions: string[];
  matchedName?: string;
  datasetVersion?: string;
};

export function normalizePostalName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/\b(?:BRANCH|SUB|HEAD)\s+POST\s+OFFICE\b/g, " ")
    .replace(/\b[BSH]\s*\.?\s*O\.?(?:\s|$)/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
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

function uniqueUsefulNames(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = normalizePostalName(value);
    if (!normalized || normalized === "NA" || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

export function validatePostalDetails(
  directory: PostalDirectory,
  pincode: string,
  state: PostalState,
  area: string,
): PostalValidationResult {
  const datasetVersion = directory.meta.sourceSha256;
  const entries = directory.records[pincode];
  if (!entries) {
    return {
      status: "invalid",
      message: `PIN ${pincode} is not present in the Telangana and Andhra Pradesh postal directory.`,
      suggestions: [],
      datasetVersion,
    };
  }

  const entry = entries[state];
  if (!entry) {
    const listedStates = Object.keys(entries).join(" / ");
    return {
      status: "invalid",
      message: `PIN ${pincode} is listed under ${listedStates}, not ${state}.`,
      suggestions: [],
      datasetVersion,
    };
  }

  const normalizedArea = normalizePostalName(area);
  const candidates = uniqueUsefulNames([...entry.offices, ...entry.blocks]);
  const exactMatch = candidates.find(
    (candidate) => normalizePostalName(candidate) === normalizedArea,
  );
  if (exactMatch) {
    return {
      status: "verified",
      message: `${area.trim()} matches the postal directory for PIN ${pincode}.`,
      suggestions: [],
      matchedName: exactMatch,
      datasetVersion,
    };
  }

  const ranked = candidates
    .map((candidate) => ({
      candidate,
      score: similarity(normalizedArea, normalizePostalName(candidate)),
    }))
    .sort((left, right) => right.score - left.score);
  const closest = ranked[0];
  const suggestions = ranked.slice(0, 3).map(({ candidate }) => candidate);

  if (closest && closest.score >= 0.72) {
    return {
      status: "review",
      message: `Area “${area.trim()}” is close to “${closest.candidate}” for PIN ${pincode}. Confirm the spelling or keep the local name.`,
      suggestions,
      datasetVersion,
    };
  }

  const districtContext = uniqueUsefulNames(entry.districts).slice(0, 2);
  return {
    status: "review",
    message: `Area “${area.trim()}” is not listed for PIN ${pincode}${districtContext.length ? ` in ${districtContext.join(" / ")}` : ""}. Confirm the local area name.`,
    suggestions,
    datasetVersion,
  };
}

let directoryPromise: Promise<PostalDirectory> | null = null;

export async function loadPostalDirectory() {
  directoryPromise ??= fetch("/data/postal-directory-ap-ts.json", {
    cache: "force-cache",
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Postal directory failed to load (${response.status}).`);
    }
    return (await response.json()) as PostalDirectory;
  });
  return directoryPromise;
}

export async function validatePostalDetailsFromApp(
  pincode: string,
  state: PostalState,
  area: string,
): Promise<PostalValidationResult> {
  try {
    const directory = await loadPostalDirectory();
    return validatePostalDetails(directory, pincode, state, area);
  } catch {
    return {
      status: "unavailable",
      message:
        "Postal validation is temporarily unavailable. Confirm this PIN and area manually.",
      suggestions: [],
    };
  }
}
