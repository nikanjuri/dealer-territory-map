import { pointInPinFeature, type PinFeature } from "./dealer-geography.ts";
import { normalizeIndianState } from "./indian-states.ts";
import type { GooglePlaceSelection } from "../components/google-place-autocomplete.tsx";

export function validateSelectedDealerPlace(
  place: GooglePlaceSelection,
  pincode: string,
  state: string,
  boundary: PinFeature | null,
): string | null {
  if (!Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) {
    return "Google did not return a usable map point. Choose another suggestion.";
  }
  if (place.postalCode && place.postalCode !== pincode) {
    return `The selected place has PIN ${place.postalCode}, not ${pincode}. Check the dealer PIN or choose another address.`;
  }
  if (place.state && normalizeIndianState(place.state) !== state) {
    return `The selected place is in ${place.state}, not ${state}. Choose a matching address.`;
  }
  if (boundary && !pointInPinFeature([place.longitude, place.latitude], boundary)) {
    return "The selected point falls outside this PIN boundary. Check the address and PIN before saving.";
  }
  if (!boundary && (!place.postalCode || !place.state)) {
    return "Google did not provide enough postal detail to verify this point. Choose another address or save an approximate PIN location.";
  }
  return null;
}
