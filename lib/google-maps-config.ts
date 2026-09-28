export function resolveGoogleMapsMapId(
  configuredMapId: string | undefined,
  environment: string | undefined,
) {
  const configured = configuredMapId?.trim();
  if (configured) return configured;
  return environment === "development" ? "DEMO_MAP_ID" : undefined;
}
