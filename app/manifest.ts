import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dealer Operations",
    short_name: "Dealer Ops",
    description:
      "Dealer territory, field activity, catalog, and ordering workspace.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f3ea",
    theme_color: "#252a44",
    icons: [
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
