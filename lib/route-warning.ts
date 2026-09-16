const legacyMissingKeyWarning =
  "Road-aware optimization was unavailable (GOOGLE_ROUTES_API_KEY is not configured.). This draft uses a distance estimate and must be re-optimized before field use.";

export function routeFallbackWarning(existingWarning: string | null) {
  const fallback =
    "Road-aware optimization is temporarily unavailable. This draft uses a distance estimate and must be optimized again before field use.";
  return `${existingWarning ? `${existingWarning} ` : ""}${fallback}`;
}

export function routeWarningForDisplay(
  warning: string | null,
  googleOptimizationConfigured: boolean,
) {
  if (!warning) return null;
  if (!warning.includes(legacyMissingKeyWarning)) return warning;

  if (googleOptimizationConfigured) {
    return warning.replace(legacyMissingKeyWarning, "").trim() || null;
  }

  return warning.replace(
    legacyMissingKeyWarning,
    "Road-aware optimization is temporarily unavailable. This draft uses a distance estimate and must be optimized again before field use.",
  );
}
