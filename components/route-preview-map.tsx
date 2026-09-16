"use client";

import { useEffect, useRef, useState } from "react";
import type { Dealer } from "@/app/dealers";
import type { RoutePreview } from "@/lib/route-contract";
import { importGoogleMapsLibrary } from "@/lib/google-maps-loader";

export function RoutePreviewMap({
  preview,
  dealersById,
}: {
  preview: RoutePreview;
  dealersById: Map<number, Dealer>;
}) {
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
    const markers: google.maps.Marker[] = [];
    let routeLine: google.maps.Polyline | null = null;
    let map: google.maps.Map | null = null;

    async function renderMap() {
      await Promise.all([
        importGoogleMapsLibrary(googleMapsApiKey, "maps"),
        importGoogleMapsLibrary(googleMapsApiKey, "geometry"),
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
      });

      routeLine = new google.maps.Polyline({
        map,
        path: routePath,
        geodesic: false,
        strokeColor: "#173a34",
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
      });
      if (!bounds.isEmpty()) map.fitBounds(bounds, 42);
    }

    void renderMap().catch(() => active && setFailed(true));
    return () => {
      active = false;
      markers.forEach((marker) => marker.setMap(null));
      routeLine?.setMap(null);
      if (map) google.maps.event.clearInstanceListeners(map);
    };
  }, [dealersById, preview]);

  if (failed) {
    return (
      <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-[#ccd3cf] bg-[#f7f9f7] px-6 text-center">
        <div>
          <p className="text-sm font-semibold text-[#34423e]">Map preview unavailable</p>
          <p className="mt-1 text-xs leading-5 text-[#73807b]">
            Review the ordered stops below. The route has not been saved.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={`Preview of the optimized route with ${preview.stops.length} dealer stops`}
      className="min-h-64 overflow-hidden rounded-xl border border-[#d8ddda] bg-[#eef1ef] sm:min-h-80"
    />
  );
}
