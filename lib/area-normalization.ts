const AREA_ALIASES: Record<string, string> = {
  ADIDS: "Abids",
  "ADONI KURNOOL": "Adoni",
  "A S RAO NAGAR": "A. S. Rao Nagar",
  "AS RAO NAGAR": "A. S. Rao Nagar",
  ANANTHAPUR: "Anantapur",
  "B N REDDY NAGAR": "B. N. Reddy Nagar",
  "BN REDDY NAGAR": "B. N. Reddy Nagar",
  BELLAMPALLI: "Bellampalli",
  BELLAMPALLY: "Bellampalli",
  "L B NAGAR": "L. B. Nagar",
  "LB NAGAR": "L. B. Nagar",
  "S R NAGAR": "S. R. Nagar",
  "SR NAGAR": "S. R. Nagar",
  "CHAANDA NAGAR": "Chandanagar",
  CHAANDANAGAR: "Chandanagar",
  "CHANDA NAGAR": "Chandanagar",
  CHANDANAGAR: "Chandanagar",
  CHERIAL: "Cherial",
  CHERIYAL: "Cherial",
  DEVARAKONDA: "Devarakonda",
  DEVARKONDA: "Devarakonda",
  "DILSUK NAGAR": "Dilsukhnagar",
  DILSHUKNAGAR: "Dilsukhnagar",
  DILSUKHNAGAR: "Dilsukhnagar",
  DILSUKNAGAR: "Dilsukhnagar",
  DILUKNAGAR: "Dilsukhnagar",
  "GODAVARI KHANI": "Godavarikhani",
  GODAVARIKHANI: "Godavarikhani",
  GODHAWARIKHANI: "Godavarikhani",
  GOVARARIKHANI: "Godavarikhani",
  HANAMKONDA: "Hanamkonda",
  HANAMAKONDA: "Hanamkonda",
  HANMAKONDA: "Hanamkonda",
  HANUMAKONDA: "Hanamkonda",
  HASANPARTHI: "Hasanparthy",
  HASTHINAPURAM: "Hastinapuram",
  HASTINAPURAM: "Hastinapuram",
  "HYDERABAD PATHARGATTI": "Pathargatti",
  KOTHAPETA: "Kothapet",
  KOTHAPET: "Kothapet",
  "LAKDI KA POOL": "Lakdikapool",
  LAKDIKAPOOL: "Lakdikapool",
  LAKDIKAPUL: "Lakdikapool",
  MAHABOOBNAGAR: "Mahabubnagar",
  "MAHABOOB NAGAR": "Mahabubnagar",
  MAHABOOBABAD: "Mahabubabad",
  MAHABUBNAGAR: "Mahabubnagar",
  MAHBUBNAGAR: "Mahabubnagar",
  "MALKAJ GIRI": "Malkajgiri",
  MALKAJGIRI: "Malkajgiri",
  MANCHERAIL: "Mancherial",
  MANCHERIAL: "Mancherial",
  "MANTHANI DIST PEDDAPALLI": "Manthani",
  MEHADIPATNAM: "Mehdipatnam",
  MEHDIPATNAM: "Mehdipatnam",
  MIRYALAGUDA: "Miryalaguda",
  MIRYALGUDA: "Miryalaguda",
  NAGAKURNOOL: "Nagarkurnool",
  "NAGAR KURNOOL": "Nagarkurnool",
  NAGARKARNOOL: "Nagarkurnool",
  NAGARKURNOOL: "Nagarkurnool",
  NIZAMABAD: "Nizamabad",
  NIZAMBAD: "Nizamabad",
  "NIZAMPET DT MEDAK": "Nizampet",
  "NANDYAL DIST KURNOOL": "Nandyal",
  NALGONGA: "Nalgonda",
  NARASAMPET: "Narsampet",
  PEDDAPALL: "Peddapalli",
  PEDDAPALLY: "Peddapalli",
  PRODDUTUR: "Proddatur",
  RAYACHOTY: "Rayachoti",
  SECUNDERABAD: "Secunderabad",
  SECUNDRABAD: "Secunderabad",
  SHAHPURNAGAR: "Shapur Nagar",
  "SHAPOOR NAGAR": "Shapur Nagar",
  "SHAD NAGAR": "Shadnagar",
  SHADNAGAR: "Shadnagar",
  SIRISILLA: "Sirsilla",
  SIRPURKAGAZNAGAR: "Sirpur Kagaznagar",
  "SIRPUR KAGHAZNAGAR": "Sirpur Kagaznagar",
  "SURYA PET": "Suryapet",
  SURYAPET: "Suryapet",
  "TOLI CHOWKI": "Tolichowki",
  TOLICHOWKI: "Tolichowki",
  VANASTHALIPURAM: "Vanasthalipuram",
  VANSATHALIPURAM: "Vanasthalipuram",
  VIJAYWADA: "Vijayawada",
  WARANGAL: "Warangal",
  WARNGAL: "Warangal",
  WANAPARTHY: "Wanaparthy",
  WANPARTHY: "Wanaparthy",
  PATHARGATI: "Pathargatti",
  PATHARGATTI: "Pathargatti",
  "PATHER GHATI": "Pathargatti",
  PATHERGHATH: "Pathargatti",
  PATHERGHATI: "Pathargatti",
  PATTERGHATI: "Pathargatti",
  PATTARGATTI: "Pathargatti",
  PATTHARGATI: "Pathargatti",
  PATTHERGATTI: "Pathargatti",
  CHOTUPPAL: "Choutuppal",
  DHARNASAGAR: "Dharmasagar",
  HYDERANAD: "Hyderabad",
  KAGHAZNAGAR: "Kagaznagar",
  KARNOOL: "Kurnool",
  "HUZURABAD DIST KARIMNAGAR": "Huzurabad",
  "MAHABUB NAGAR": "Mahabubnagar",
  "MULUGU GHANPUR": "Ghanpur",
  TIRUPATHI: "Tirupati",
};

const DISPLAY_ACRONYMS: Record<string, string> = {
  BHEL: "BHEL",
  ECIL: "ECIL",
  HAL: "HAL",
  HMT: "HMT",
  KPHB: "KPHB",
  NGO: "NGO",
  NTR: "NTR",
  RTC: "RTC",
};

/**
 * Produces a comparison key while removing source-only state/city suffixes.
 * The raw source value remains stored separately on the dealer record.
 */
export function normalizeAreaKey(value: string) {
  let normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const suffix = /\s+(?:HYDERABAD|HYD(?:ERABAD)?|HYD\s+BAD|TELANGANA|T\s*S|TS|ANDHRA\s+PRADESH|A\s*P|AP)$/;
  while (normalized.split(" ").length > 1 && suffix.test(normalized)) {
    normalized = normalized.replace(suffix, "").trim();
  }
  return normalized;
}

function titleCaseArea(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) =>
      DISPLAY_ACRONYMS[word]
        ? DISPLAY_ACRONYMS[word]
        : `${word.charAt(0)}${word.slice(1).toLowerCase()}`,
    )
    .join(" ");
}

/**
 * Canonical display form for an imported or manually entered area.
 * Only known, high-confidence spelling variants are merged automatically.
 */
export function canonicalizeAreaName(value: string) {
  const key = normalizeAreaKey(value);
  if (!key) return "";
  return AREA_ALIASES[key] ?? titleCaseArea(key);
}
