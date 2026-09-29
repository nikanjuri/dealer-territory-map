"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { importGoogleMapsLibrary } from "@/lib/google-maps-loader";

type Availability = "loading" | "ready" | "unavailable";

export type GooglePlaceSelection = {
  address: string;
  placeId: string;
  latitude: number;
  longitude: number;
  postalCode: string | null;
  state: string | null;
};

export function GooglePlaceAutocomplete({
  id,
  value,
  onChange,
  onPlaceSelect,
  onAvailabilityChange,
  placeholder,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect?: (place: GooglePlaceSelection) => void;
  onAvailabilityChange?: (availability: Availability) => void;
  placeholder: string;
  describedBy?: string;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const containerRef = useRef<HTMLDivElement>(null);
  const autocompleteRef = useRef<google.maps.places.PlaceAutocompleteElement | null>(
    null,
  );
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const onPlaceSelectRef = useRef(onPlaceSelect);
  const onAvailabilityChangeRef = useRef(onAvailabilityChange);
  const [availability, setAvailability] = useState<Availability>(
    apiKey ? "loading" : "unavailable",
  );

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onPlaceSelectRef.current = onPlaceSelect;
  }, [onPlaceSelect]);

  useEffect(() => {
    onAvailabilityChangeRef.current = onAvailabilityChange;
  }, [onAvailabilityChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!apiKey || !container) {
      setAvailability("unavailable");
      onAvailabilityChangeRef.current?.("unavailable");
      return;
    }
    const googleMapsApiKey = apiKey;
    const autocompleteContainer: HTMLDivElement = container;

    let active = true;
    let selectionVersion = 0;
    let autocomplete: google.maps.places.PlaceAutocompleteElement | null = null;

    async function mountAutocomplete() {
      const { PlaceAutocompleteElement } = await importGoogleMapsLibrary(
        googleMapsApiKey,
        "places",
      );
      if (!active) return;

      autocomplete = new PlaceAutocompleteElement({
        includedRegionCodes: ["in"],
        requestedLanguage: "en",
        requestedRegion: "in",
        placeholder,
        value: valueRef.current,
      });
      autocomplete.id = id;
      autocomplete.className = "dealer-place-autocomplete";
      autocomplete.description =
        "Search Google Maps for an address or place in India.";
      autocomplete.locationBias = {
        south: 12.0,
        west: 76.0,
        north: 21.0,
        east: 85.0,
      };
      if (describedBy) autocomplete.setAttribute("aria-describedby", describedBy);

      const handleInput = () => {
        selectionVersion += 1;
        if (autocomplete) onChangeRef.current(autocomplete.value);
      };
      const handleSelect = async (event: Event) => {
        const version = ++selectionVersion;
        try {
          const { placePrediction } =
            event as google.maps.places.PlacePredictionSelectEvent;
          const place = placePrediction.toPlace();
          await place.fetchFields({
            fields: ["displayName", "formattedAddress", "location", "id", "addressComponents"],
          });
          if (!active || !autocomplete || version !== selectionVersion) return;
          const selectedValue =
            place.formattedAddress ?? place.displayName ?? autocomplete.value;
          autocomplete.value = selectedValue;
          onChangeRef.current(selectedValue);
          if (place.id && place.location) {
            const component = (kind: string) => place.addressComponents?.find((item) => item.types.includes(kind))?.longText ?? null;
            onPlaceSelectRef.current?.({
              address: selectedValue,
              placeId: place.id,
              latitude: place.location.lat(),
              longitude: place.location.lng(),
              postalCode: component("postal_code"),
              state: component("administrative_area_level_1"),
            });
          }
        } catch {
          if (!active || version !== selectionVersion) return;
          setAvailability("unavailable");
          onAvailabilityChangeRef.current?.("unavailable");
        }
      };
      const handleError = () => {
        if (!active) return;
        setAvailability("unavailable");
        onAvailabilityChangeRef.current?.("unavailable");
      };

      autocomplete.addEventListener("input", handleInput);
      autocomplete.addEventListener("gmp-select", handleSelect);
      autocomplete.addEventListener("gmp-error", handleError);
      autocompleteContainer.replaceChildren(autocomplete);
      autocompleteRef.current = autocomplete;
      setAvailability("ready");
      onAvailabilityChangeRef.current?.("ready");

      return () => {
        autocomplete?.removeEventListener("input", handleInput);
        autocomplete?.removeEventListener("gmp-select", handleSelect);
        autocomplete?.removeEventListener("gmp-error", handleError);
      };
    }

    let removeListeners: (() => void) | undefined;
    void mountAutocomplete()
      .then((cleanup) => {
        removeListeners = cleanup;
      })
      .catch(() => {
        if (!active) return;
        setAvailability("unavailable");
        onAvailabilityChangeRef.current?.("unavailable");
      });

    return () => {
      active = false;
      removeListeners?.();
      autocompleteRef.current = null;
      autocompleteContainer.replaceChildren();
    };
  }, [apiKey, describedBy, id, placeholder]);

  useEffect(() => {
    valueRef.current = value;
    if (autocompleteRef.current && autocompleteRef.current.value !== value) {
      autocompleteRef.current.value = value;
    }
  }, [value]);

  if (availability === "unavailable") {
    return (
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={describedBy}
        placeholder={placeholder}
      />
    );
  }

  return (
    <div className="relative min-h-9 min-w-0 max-w-full">
      <div ref={containerRef} className="min-h-9 w-full min-w-0 max-w-full" />
      {availability === "loading" ? (
        <Input
          value={value}
          aria-label="Loading Google Maps address search"
          placeholder="Loading Google Maps suggestions…"
          disabled
          className="absolute inset-0"
        />
      ) : null}
    </div>
  );
}
