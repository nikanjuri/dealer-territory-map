# Post-push workflow checks — 2026-09-28

## Checkpoint and boundaries

Application snapshot `dc431323ed64a404d51338ddeef874401333ceb2` was pushed first to `origin/codex/operations-checkpoint-2026-09-28`. `main` was not changed. The repository is public, so raw dealer workbooks, credentials, local provider state and backups were excluded. A pattern scan and comparison against loaded runtime secret values flagged no files in the candidate source set; this is not a comprehensive security audit.

`npm run verify` passed all 101 tests, ESLint, TypeScript and the production build before the push. No application source was edited during these subsequent checks.

The existing Neon CLI credentials could not authorize the linked project's branch-management API. No new Neon account or project was created, and local environment variables were not repointed. Full browser write journeys remain gated on an isolated application database plus appropriate Auth access. Do not substitute local persistence checks for that gate.

## Actual persistence functions on disposable PostgreSQL

Applied the checked-in Drizzle migrations, in journal order, to a fresh PostgreSQL 18 container. All fixtures were synthetic: two salespeople, three dealers, two retailer links and one product/variant. No production dump, identities, passwords or runtime environment file was loaded.

Bundled the actual route, commerce and outbox modules for a test harness. The `server-only` import marker was stubbed for Node execution; business logic and authorization parameters were unchanged. Neon's configurable HTTP transport was adapted to a local `pg` connection using the original SQL and bound parameters. Every query asserted a loopback-only target. These were function/database tests, not authenticated route-handler or browser-save tests.

| Check group | Evidence |
| --- | --- |
| Route save and retries | Two simultaneous saves plus a subsequent replay returned one plan ID, one plan and two correctly ordered stops. A mismatched creator was rejected. |
| Atomic route failure | A synthetic missing dealer passed the timing input stage but caused a PostgreSQL foreign-key violation (`23503`) during insertion. Neither the failed plan nor partial stops persisted. |
| Visits and scoped reads | Another salesperson's scoped stop update returned null. Concurrent completion plus replay produced one visit and preserved completion/due timestamps. Reverting a finished stop failed. Completing/skipping the plan's stops made the plan completed; own-team and admin readbacks reflected the result while the other salesperson's route list remained empty. |
| Checkout pricing and replay | Changing the stored price before checkout produced the current server price and correct total. A lost-response retry returned the existing order. Changing items or retailer/dealer with the same key was rejected. Another dealer's scoped order list was empty. |
| Concurrent orders and fulfillment | Two simultaneous requests returned one order ID and exactly one creation. Below-MOQ and out-of-stock requests were rejected without extra orders. A fulfillment update appeared in order readback. |
| Outbox storage | The real storage module, using a test IndexedDB implementation, retained only the latest action for a user/plan/stop, separated users' reads and removed the acknowledged item without deleting another user's pending item. This does not exercise browser network failure or online replay. |

All six groups passed. The final harness included the database-level foreign-key assertion rather than merely checking a pre-insert validation error. Temporary container `dealer-write-qa-20260928-akcpm6`, including all synthetic records, was removed. Helper/runtime artifacts remain temporarily under `/tmp/dealer-write-qa-20260928.aKCpm6/`; they are not production assets or committed credentials. `ports sync` and `ports check` were run after the temporary listener was removed; port 5740 remains the registered running web server.

## Authenticated Google preview

The existing salesperson selected two assigned PIN-level dealers, supplied a public Hyderabad coordinate as the start, explicitly opted into approximate planning and selected Optimize. `POST /api/routes/optimize` returned 200 in 2.3 seconds. The review showed a road polyline on Google Maps, ordered stops, 27.0 km, 1h 22m driving, 1h with dealers and a finish of 11:22 am. The only location warning concerned the two approximate PIN points; no distance-provider fallback warning appeared. Save route was available only after the review.

The preview was discarded, dealer selection cleared and the app returned to Today. No route save or visit/order write was submitted to the live database. A subsequent read-only count check confirmed zero live route plans, visits and commerce orders. These PIN-level preview results are not field-ready exact-address routing, and Google Places suggestion selection was not tested.

Desktop evidence: `/tmp/dealer-role-qa-20260928/road-preview.png`.

## Confirmed failure — stop UI QA here

At a 390×844 viewport, the Routes panel measured 390 px wide but had a 679 px scroll width. The planning and review headers' containing rows measured approximately 629 px. The approximate-location warning, Optimize button and map visibly extended beyond the viewport and were clipped. The document itself remained 390 px wide, so normal page scrolling did not resolve the clipped content.

Inspect the planner grid's implicit small-screen track sizing and the minimum widths of its children, Google autocomplete and preview content. Add constrained single-column sizing and shrinking/wrapping behavior, then recheck the actual planner and preview at 390 px and narrower widths; hiding overflow alone is not a fix. No CSS patch was made during this verification-only request.

Mobile evidence: `/tmp/dealer-role-qa-20260928/road-preview-mobile-overflow.png`. The viewport override was reset. UI verification stopped at this confirmed failure under the verification skill's stop rule.

Remaining gates: mobile route clipping, exact-address save/visit/admin browser readback, real offline reconnect/replay, retailer checkout/reorder and comprehensive API authorization-negative cases in an isolated authenticated environment. Existing storage-context console errors remain unattributed. No production readiness or deployment claim is made.
