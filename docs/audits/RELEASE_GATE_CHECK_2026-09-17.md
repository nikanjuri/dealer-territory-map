# Release Gate Check — 2026-09-17

## Outcome

Neither gate should be described as production-verified yet.

| Gate | Current state | Evidence | Remaining release action |
| --- | --- | --- | --- |
| Authenticated salesperson journey | Blocked on representative credentials | Neon contains one active salesperson login, and role/access contract coverage exists, but passwords are intentionally neither retrievable nor prefilled. The current administrator session cannot prove the salesperson browser journey. | Exercise a deliberately provisioned representative salesperson account in an isolated test environment, including own-dealer scoping, route creation, visit updates, and denial of other-salesperson records. |
| Authenticated retailer journey | Blocked on representative data and credentials | Neon contains no retailer account and no active commerce product. A meaningful browse-to-order journey therefore cannot be exercised without creating test identity, dealer linkage, catalog, and order data. | Seed an isolated test environment with a linked retailer, active product and variant, then verify product browsing, cart totals resolved server-side, order creation, and dealer/order isolation. |
| Google Advanced Markers | Code complete; deployed configuration open | Dealer pins and route-preview stops now use Advanced Markers when a map ID is present. Local development falls back to Google's documented `DEMO_MAP_ID`; deployed environments use the legacy-marker fallback when no map ID exists. The linked Vercel project currently has no `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` in Production, Preview, or Development. | Create a project-owned JavaScript map ID in Google Cloud, configure it in the intended Vercel environments, deploy, and visually verify marker selection, accessibility, route numbering, and fallback behavior before removing legacy markers. |

## Boundaries

- No hosted account was created, reset, or deleted during this check.
- No hosted catalog, order, database, Google Cloud, or Vercel environment state was changed.
- The existing administrator browser session was preserved because its password is not available for an automatic re-login.
- Source-level tests and an administrator session are supporting evidence, not substitutes for separate authenticated salesperson and retailer journeys.

## Recommended closure sequence

1. Create an isolated representative-data environment rather than inserting disposable orders into the current hosted database.
2. Provision one salesperson account and one retailer account linked to an existing representative dealer, plus one active product and variant.
3. Run the salesperson and retailer browser matrices at desktop and compact-mobile widths, including direct URL and API authorization checks.
4. Create and configure the project-owned Google Maps JavaScript map ID.
5. Deploy that configuration and repeat the map-marker checks before declaring both gates closed.
