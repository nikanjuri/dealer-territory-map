"use client";

import { useEffect, useRef, useState } from "react";
import type { Dealer } from "@/app/dealers";
import type {
  RoutePreview,
  SavedRoutePlan,
} from "@/lib/route-contract";
import { importGoogleMapsLibrary } from "@/lib/google-maps-loader";
import { resolveGoogleMapsMapId } from "@/lib/google-maps-config";

export function RoutePreviewMap({
  preview,
  dealersById,
}: {
  preview: Pick<RoutePreview | SavedRoutePlan, "stops" | "encodedPolyline">;
  dealersById: Map<number, Dealer>;
}) {
  const mapId = resolveGoogleMapsMapId(
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID,
    process.env.NODE_ENV,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey || !containerRef.current) {
      setFailed(true);
      return;
    }
    const googleMapsApiKey = apiKey;

    let active = true;
    const markers: Array<google.maps.Marker | google.maps.marker.AdvancedMarkerElement> = [];
    let routeLine: google.maps.Polyline | null = null;
    let map: google.maps.Map | null = null;

    async function renderMap() {
      const [, , markerLibrary] = await Promise.all([
        importGoogleMapsLibrary(googleMapsApiKey, "maps"),
        importGoogleMapsLibrary(googleMapsApiKey, "geometry"),
        mapId
          ? importGoogleMapsLibrary(googleMapsApiKey, "marker")
          : Promise.resolve(null),
      ]);
      if (!active || !containerRef.current) return;

      const dealerPath = preview.stops.flatMap((stop) => {
        const dealer = dealersById.get(stop.dealerId);
        return dealer
          ? [{ lat: dealer.latitude, lng: dealer.longitude }]
          : [];
      });
      const routePath = preview.encodedPolyline
        ? google.maps.geometry.encoding.decodePath(preview.encodedPolyline)
        : dealerPath;
      const initialCenter = dealerPath[0] ?? { lat: 17.385, lng: 78.4867 };
      map = new google.maps.Map(containerRef.current, {
        center: initialCenter,
        zoom: 11,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        clickableIcons: false,
        gestureHandling: "cooperative",
        ...(mapId ? { mapId } : {}),
      });

      routeLine = new google.maps.Polyline({
        map,
        path: routePath,
        geodesic: false,
        strokeColor: "#252a44",
        strokeOpacity: 0.92,
        strokeWeight: 5,
      });

      const bounds = new google.maps.LatLngBounds();
      routePath.forEach((point) => bounds.extend(point));
      preview.stops.forEach((stop) => {
        const dealer = dealersById.get(stop.dealerId);
        if (!dealer) return;
        const position = { lat: dealer.latitude, lng: dealer.longitude };
        bounds.extend(position);
        if (markerLibrary && mapId) {
          const pin = new markerLibrary.PinElement({
            background: "#252a44",
            borderColor: "#ffffff",
            glyphColor: "#ffffff",
            glyphText: String(stop.sequence),
            scale: 1.1,
          });
          const marker = new markerLibrary.AdvancedMarkerElement({
            map,
            position,
            title: `${stop.sequence}. ${dealer.dealer}`,
          });
          marker.append(pin);
          markers.push(marker);
        } else {
          markers.push(
            new google.maps.Marker({
              map,
              position,
              title: `${stop.sequence}. ${dealer.dealer}`,
              label: {
                text: String(stop.sequence),
                color: "#ffffff",
                fontSize: "12px",
                fontWeight: "700",
              },
            }),
          );
        }
      });
      if (!bounds.isEmpty()) map.fitBounds(bounds, 42);
    }

    void renderMap().catch(() => active && setFailed(true));
    return () => {
      active = false;
      markers.forEach((marker) => {
        if (marker instanceof google.maps.Marker) marker.setMap(null);
        else marker.map = null;
      });
      routeLine?.setMap(null);
      if (map) google.maps.event.clearInstanceListeners(map);
    };
  }, [dealersById, mapId, preview]);

  if (failed) {
    return (
      <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-[#d6cfc4] bg-[#fbf7f1] px-6 text-center">
        <div>
          <p className="text-sm font-semibold text-[#34333a]">Route map unavailable</p>
          <p className="mt-1 text-xs leading-5 text-[#7c7771]">
            Review the ordered stops below or open the route in Google Maps.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={`Route map with ${preview.stops.length} dealer stops`}
      className="min-h-64 overflow-hidden rounded-xl border border-[#ded7cc] bg-[#f4efe8] sm:min-h-80"
    />
  );
}
