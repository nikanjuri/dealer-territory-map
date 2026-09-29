# Dealer-present state highlights — local verification

Date: 2026-09-29. Local application: `http://localhost:5740/`.

Story: authenticated visible dealer records → canonical state ISO identifiers → on-demand static outlines → neutral map context, alongside independent salesperson-colored PIN polygons.

## Flow evidence

| Boundary | Result | Evidence |
| --- | --- | --- |
| Dealer scope → state selection | Pass | Tests cover deduplicated aliases, a Karnataka-only supplied scope, unknown states, and no-dealer results; the existing authenticated dealer API is unchanged. |
| Selection → static data | Pass | All 36 per-state assets match canonical names/ISO IDs and have finite, closed polygon rings. The local Karnataka asset returned HTTP 200. The generator pins the upstream revision and hash. |
| Fetch/cache/error handling | Pass | Concurrent requests and repeat selections reuse cached assets; partial failures retain successful states, failed requests retry, and malformed/mismatched geometry is rejected. |
| Data → Google rendering | Pass | Existing administrator session shows 2,064 dealers. All-dealer view displays neutral outlines beyond AP/Telangana. Selecting Karnataka yields 124 matches and only Karnataka context; a zero-match search removes state highlights and markers. |
| Mobile response → rendering | Pass | At 390 × 844, all-state context is visible; keyboard-selecting Kerala removes the other outlines and dealer markers. No horizontal document overflow (`scrollWidth = innerWidth = 390`) or Next error dialog was present. Filters were reset and the viewport override removed. |
| Coverage explanation/accessibility | Pass | Enter opens Coverage info; Escape dismisses it. The disclosure separates neutral state context from PIN ownership and links source/license attribution. |
| MapLibre fallback | Code/test verified; live fallback not exercised | Uses the same state data prop and cached selector, initializes an empty state source, and updates it on relevant filter/active changes. Typecheck and build pass. The browser session used Google Maps; it was not deliberately disrupted to force fallback. |

## Checks

- `node --test tests/state-boundaries.test.ts`: 7/7 pass.
- `npm run verify`: 115 tests pass, ESLint pass, TypeScript pass, production build pass.
- `git diff --check`: pass.
- Existing `public/region-boundaries.geojson` remains unchanged; exact comparisons to the new AP/Telangana assets pass. Existing audit/repair scripts and dealer records were not modified.
- Google state feature identities use ISO codes, not array positions; explicit layer ordering keeps PIN colors above state fills.

## Evidence and limits

Screenshots from the local browser check:

- `/tmp/dealer-state-map-qa.sGCZmK/all-states-desktop.png`
- `/tmp/dealer-state-map-qa.sGCZmK/all-states-mobile.png`
- `/tmp/dealer-state-map-qa.sGCZmK/kerala-mobile.png`

An initial all-dealer render showed the existing retryable PIN-boundary notice; subsequent filtered/reset renders recovered without a state-outline error. Captured browser logs also included generic storage-access errors without a stack; these do not establish an application error or its source. The final map and filters rendered without a Next error overlay.

No live dealer/account/route/visit data was changed. No credentials were altered, migrations applied, listeners changed, commits made, remote push performed, or deployment published for this change. State highlights are cartographic context based on recorded dealer states; they do not certify exact dealer coordinates, administrative/legal boundary currency, or statewide business coverage.

## Follow-up: dealer-count threshold and marker lifecycle

The approved refinement now highlights a state only when it contains **more than 50 currently filtered dealer markers**, unless that state is explicitly selected and has matching dealers. Counts normalize state aliases and use the complete supplied dealer scope, not distinct PIN codes or the sidebar's paginated results. Empty results still clear all state highlights. PIN ownership polygons and dealer markers are not reduced by this rule.

Both map providers now signal initialization with a readiness revision rather than a boolean. Fast Refresh preserves React state while rebuilding map objects; incrementing the revision makes marker/layer effects synchronize with the new map instead of retaining a stale `true` value with detached markers.

- `node --test tests/state-boundaries.test.ts`: 12/12 pass, including 49/50/51 thresholds, same-PIN dealer counting, normalized aliases, selected-state exceptions, empty scopes and filter transitions.
- `npm run verify`: all 120 tests, ESLint, TypeScript and production build pass.
- Existing local administrator session: 2,064 dealer marker buttons remain after the hot update without manual reload. Current recorded states/counts are Telangana 1,453, Andhra Pradesh 269, Maharashtra 194, Karnataka 124, Kerala 23 and Haryana 1. Only the first four qualify for default state highlights; Kerala/Haryana markers remain visible.
- Mobile 390 × 844: explicitly selecting Kerala shows its neutral outline and 23 marker buttons. Searching Kerala with **All states** retains the same 23 markers without the state highlight. Keyboard selection and Escape dismissal work.
- Desktop 1280 × 900: resetting filters restores all 2,064 marker buttons. Filters were left reset and the temporary viewport override removed.
- The existing retryable PIN-boundary notice appeared in the default view; this change does not claim that all external PIN geometry requests succeed. Google Maps was tested live; MapLibre's shared eligibility and lifecycle compile/test successfully but were not forced into a live fallback session.

Follow-up screenshots:

- `/tmp/dealer-state-map-qa.sGCZmK/threshold-kerala-selected-mobile.png`
- `/tmp/dealer-state-map-qa.sGCZmK/threshold-kerala-search-mobile.png`
- `/tmp/dealer-state-map-qa.sGCZmK/threshold-default-desktop.png`

No hosted data, credentials, schema, listeners, remote branches or deployments were changed by this refinement.
