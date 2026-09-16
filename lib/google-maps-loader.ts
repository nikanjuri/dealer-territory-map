import type { LibraryMap } from "@googlemaps/js-api-loader";

let configuredApiKey: string | null = null;

export async function importGoogleMapsLibrary<
  LibraryName extends keyof LibraryMap,
>(apiKey: string, libraryName: LibraryName): Promise<LibraryMap[LibraryName]> {
  const loader = await import("@googlemaps/js-api-loader");

  if (!window.google?.maps?.importLibrary && !configuredApiKey) {
    loader.setOptions({ key: apiKey, v: "weekly" });
    configuredApiKey = apiKey;
  }

  return loader.importLibrary(libraryName);
}
