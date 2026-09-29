# PIN-boundary resilience — local verification

Date: 2026-09-29. Local URL: `http://localhost:5740/`.

Story: authenticated dealer PIN scope → local/public-geometry cache → 2025 primary/2024 backup lookup → progressive real polygons → scoped map coverage and unavailable-area feedback.

## Cause and implementation

Live diagnostics found HTTP 500 responses from Esri India, including a stopped-service-instance response from the 2024 endpoint. The prior client discarded successful primary results when a fallback request failed, never attempted fallback during primary failure, swallowed failure details into one generic notice, and kept geometry only in memory.

- Primary results are published, validated and persisted before fallback begins; fallback can recover a failed primary batch.
- The IndexedDB cache contains public postal geometry only, with dataset version, PIN and retrieval time. It expires after 30 days, caps records at 4,000 PINs, rejects malformed rings/coordinates, and tolerates blocked, unavailable, aborted, timed-out or quota-limited storage.
- A failed seed file cannot prevent cached/on-demand loading. Missing geometry is not permanently negatively cached and is never fabricated.
- Retry requests only unresolved PINs. The warning reports the remaining PIN count and explicitly says dealer pins remain visible, is scoped to the current filter key, supports keyboard activation, announces changes politely, and disables concurrent retry clicks. Desktop placement avoids the Coverage info control.
- Server lookup also attempts backup during a primary outage and retains successful primary geometry before fallback. Unresolved failed requests still reject; geographic validation never uses browser cache authority.

## Evidence

- Targeted tests: 21/21 pass across client loader, persistent cache and server service, including partial results, primary outage, exact retry scope, new-loader restoration, HTML/ArcGIS error responses, seed failure, storage refusal, retryable absence, timeout/cancellation, polygon pieces and finite closed geometry, version/expiry, capacity and fail-closed server behavior.
- The existing performance-loading regression fixture now uses valid closed geometry and expects the newly required failed-primary fallback request.
- `npm run verify`: all 140 tests, ESLint, TypeScript and production build pass.
- Local browser: initially 88 unresolved PINs with 2,064 dealer marker buttons. Enter on Retry disabled the action and showed Retrying. The request completed with no unavailable-area warning and the same 2,064 markers.
- A full local reload retained the 2,064 marker buttons and no unavailable-PIN warning. Browser refresh fixtures separately prove restoration skips upstream requests for stored geometry; live reload alone does not prove that every browser request was served from cache.
- Desktop 1280 × 900 and mobile 390 × 844: keyboard selection focused the Habsiguda dealer, rendered actual colored PIN polygons alongside dealer markers, and opened readable dealer details. Details were closed and the viewport override reset. A focus attempt timed out during a development hot reload; after rendering settled the same action succeeded.

Screenshot: `/tmp/dealer-state-map-qa.sGCZmK/pin-cache-retry-desktop.png`.

Coverage screenshots: `/tmp/dealer-state-map-qa.sGCZmK/pin-cache-coverage-desktop.png` and `/tmp/dealer-state-map-qa.sGCZmK/pin-cache-coverage-mobile.png`.

## Limits

This repairs application handling, not Esri's availability. Never-fetched or expired geometry still requires a working provider. Missing polygons remain honestly unavailable. This change does not verify dealer locations or certify provider data quality, and no dealer/account/route/visit data, credentials, schema, listeners, remote branch or deployment was changed. Google Maps was exercised locally; shared MapLibre data handling compiles but live fallback was not forced.
