import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { checkDealerLocations, type LocationInput, type LocationIssue } from "./dealer-location-check";
import { fetchPinBoundaries } from "./pin-boundary-service";
import type { PostalDirectory } from "./postal-validation";

let directoryPromise: Promise<PostalDirectory> | null = null;

function postalDirectory() {
  directoryPromise ??= readFile(join(process.cwd(), "public/data/postal-directory-ap-ts.json"), "utf8")
    .then((contents) => JSON.parse(contents) as PostalDirectory)
    .catch((error) => { directoryPromise = null; throw error; });
  return directoryPromise;
}

export async function validateDealerLocations(inputs: LocationInput[]): Promise<LocationIssue[]> {
  const [directory, boundaries] = await Promise.all([
    postalDirectory(), fetchPinBoundaries(inputs.map((input) => input.pincode)),
  ]);
  return checkDealerLocations(inputs, directory, boundaries);
}
