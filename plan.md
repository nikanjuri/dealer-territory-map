# Dealer Territory Map Plan

## Current Phase

Unified field operations and dealer ordering.

## Release QA — 2026-09-29

- [x] TASK-001: Complete isolated authenticated release QA, then deploy the reviewed main snapshot.
  - Outcome: Release the map resilience changes and matching operations/commerce code without test writes to the shared production database.
  - Acceptance: Exact-address route save/visit/admin readback, offline replay, retailer checkout/reorder, operations-only and dual-role journeys pass; live deployment is reverified.
  - Verification: `npm run verify`, representative authenticated browser journeys, reviewed upload contents, Vercel production smoke checks.
  - Evidence: Application commit `073b5b9` pushed to main; Vercel deployment `dpl_7x5k6ppUM22BsAqHTWtCaQHEJ4Fi` is Ready and promoted to the canonical domain. Final verification passes 142 tests, lint, TypeScript and production build. All 81 isolated authenticated API assertions, representative mobile/desktop route/visit/order/additive-role journeys and 103 canonical production smoke assertions pass. Production administrator/salesperson views and real Google Routes credentials were checked. Real backend connection loss exercised IndexedDB queue/replay and terminal conflict recovery; physical-device offline events remain outside this run. Both disposable QA branches were deleted, the original local environment is restored and 13 live application-table baselines are unchanged. Upstream PIN availability and legacy commerce parity remain explicit limits. See `docs/audits/RELEASE_QA_2026-09-29.md`.
- [x] Exclude private source workbooks and local credentials/provider state from Git and Vercel CLI release packaging. Source workbooks remain on disk.

## 2026-09-29 dealer-state map context

The local checkpoints below are historical. Their code shipped in the release above; live MapLibre fallback was subsequently exercised in isolated mobile QA, and all 36 state assets passed canonical production reads.

- [x] Harden PIN-boundary loading against partial/provider failures, preserve primary results, use fallback during primary outages, validate real geometry and add a bounded 30-day public-only IndexedDB cache. Count unresolved PIN areas, retain dealer markers, scope warnings to current filters and disable concurrent retries. Add persistence, timeout, cancellation, malformed-response and fail-closed server-lookup tests. Local automated and browser evidence: `docs/audits/PIN_BOUNDARY_RESILIENCE_2026-09-29.md`; no push/deployment or hosted data changes.

- [x] Replace the fixed AP/Telangana backdrop with neutral outlines for every state represented by the currently visible, authenticated dealer records, in Google Maps and MapLibre.
- [x] Check in 36 ISO-keyed, on-demand state/union-territory assets with pinned provenance and license attribution; retain the original two-state audit artifact unchanged.
- [x] Cache shared outline requests, retry failed states, clear out-of-scope highlights immediately, and keep PIN ownership colors above state context.
- [x] Complete automated and Google Maps desktop/mobile browser verification of this local-only map change. All 115 tests, lint, typecheck and production build pass; Karnataka, Kerala, reset, empty results and keyboard disclosure were checked. MapLibre shares the tested loader/selector and compiles but was not forced into a live fallback session. See `docs/audits/STATE_CONTEXT_2026-09-29.md`.
- [x] Refine state highlights to more than 50 filtered dealer markers, with an explicit nonempty selected-state exception; preserve dealer pins and PIN ownership layers below the threshold. Fix rebuilt-map readiness so Fast Refresh cannot strand detached markers. All 120 tests, lint, typecheck and production build pass; desktop default pins and mobile Kerala search/selected-state behavior were checked locally. No push or deployment performed.

## 2026-09-26 local implementation checkpoint

- [x] Add a Today-first salesperson route view and a reviewable seven-day visit suggestion; keep Google Routes responsible for each day's actual driving order.
- [x] Show visit recency and next-due information in the dealer map detail, and add a copyable, authenticated Map/Dealers filter view.
- [x] Queue visit status changes on the current device when the network fails, retry them online, and expose conflict/discard recovery.
- [x] Make stop/visit/due-date updates one atomic, retry-safe database statement. Verify completion and replay against disposable local Postgres.
- [x] Add idempotency keys to route saves and retailer orders; retain an order retry key across same-tab reloads.
- [x] Change dealer Undo to cancel a pending delete before it reaches the server, preserving the dealer's original ID.
- [x] Require a selected and reviewed Google place for new address-level pins; typed-only addresses may be explicitly saved with a PIN-level pin.
- [x] Batch route-stop reads and expose `Server-Timing` for workspace and directory requests.
- [x] Apply migration `0008` to the approved existing Neon database (2026-09-28). Verify an application-schema backup restored into disposable Postgres 18, compare already-present `0006`/`0007` schema before reconciling their missing journal entries, preserve all application-table data, and verify a repeated Drizzle migration is a no-op. Development and production share the target; authenticated role QA remains required before deploying the matching code. See `docs/audits/DATABASE_MIGRATION_2026-09-28.md`.
- [x] Run authenticated administrator, salesperson, retailer and operations desktop/mobile QA with representative isolated fixtures. The 2026-09-29 release record supersedes the earlier missing-fixture and unverified-write boundaries in `docs/audits/AUTHENTICATED_QA_2026-09-28.md`.
- [ ] Establish quantified workspace latency and performance budgets under representative device/network conditions; this release did not claim a measured load-time improvement.
- [x] Push the authorized application snapshot to `codex/operations-checkpoint-2026-09-28` before further checks, excluding source workbooks and secrets. A subsequent authenticated Google road preview and six isolated persistence/storage test groups passed; no live routes, visits or orders were saved. See `docs/audits/POST_PUSH_CHECKS_2026-09-28.md`.
- [x] Fix and reverify mobile route planning/review clipping at 320, 390 and 768 px (2026-09-29). Fix user-scoped outbox clearing, acknowledgment races, transaction abort handling, Google lookup errors and changed-routing-input save validation. All 108 tests and six isolated persistence groups pass; see `docs/audits/MAIN_QA_2026-09-29.md`.
- [x] Complete isolated authenticated browser route/visit, connection-loss/replay/conflict, retailer checkout/reorder and operations/additive-role journeys. Development shares production's database; fixture writes were isolated to disposable database/Auth copies, both deleted afterward. Physical-device offline-event testing and optional notification delivery are not claimed. See `docs/audits/RELEASE_QA_2026-09-29.md`.

## Completed

- [x] Integrate the retailer catalog, cart, order history, and commerce operations workflows into the Next.js app.
- [x] Expand the shared username/password access model to retailer, salesperson, operations-staff, and administrator roles.
- [x] Allow additive salesperson plus operations-staff access without creating a second login.
- [x] Link retailer accounts to canonical dealer records and enforce dealer-scoped order reads.
- [x] Reprice checkout server-side and save each order with its items atomically.
- [x] Add administrator workflows for retailer/operations accounts and commerce access grants.
- [x] Add guarded Commerce account deletion that revokes sign-in while retaining historical orders; Team identities remain protected.
- [x] Add Team login deletion that removes the shared account and Commerce access while preserving the salesperson, assignments, routes, and visits.
- [x] Integrate field operations, commerce operations, and retailer ordering into one role-aware root workspace; retain `/commerce` and `/shop` only as compatibility redirects.
- [x] Split the root workspace into first-open tab payloads, defer postal/review data, paginate large dealer results, and stop rebuilding every Google marker when only selection changes.

- [x] Replace email-facing sign-in with usernames and disable public self-registration.
- [x] Add administrator-managed salesperson accounts and server-enforced salesperson scoping for dealers, routes, and visit updates.
- [x] Add per-salesperson Team actions for login setup and administrator password reset.
- [x] Separate salesperson route operations from administrator read-only route oversight in both UI and APIs.
- [x] Keep route re-optimization warnings in the salesperson workflow instead of the administrator Activity view.
- [x] Replace the administrator's single-route Activity viewer with a date-filtered, attention-ranked team dashboard, embedded route detail, and visible refresh recency.
- [x] Remove obsolete Google Routes configuration errors once routing is ready while preserving valid location-quality warnings.
- [x] Simplify salesperson Map and Dealers filters by removing redundant cross-team salesperson controls.
- [x] Prevent workspace-wide dealer/PIN duplicates and direct administrators to reassign the existing record.

- [x] Seed the app with the 10 supplied dealer rows.
- [x] Cover Telangana and Andhra Pradesh in the base map viewport.
- [x] Assign stable colors to Kiran, Madhu, and Chander.
- [x] Show dealer pins with salesperson, dealer, PIN, area, and state details.
- [x] Add dealer search and salesperson filters.
- [x] Add manual dealer entry with PIN geocoding.
- [x] Add first-sheet Excel/CSV import with validation and duplicate protection.
- [x] Flag three questionable PIN/area values from the sample.
- [x] Verify the prototype at desktop and mobile sizes.
- [x] Publish a private review deployment through Sites.
- [x] Migrate the runtime from Sites/vinext to native Next.js for Vercel.
- [x] Publish and verify the public Vercel deployment, including the nine sample PIN boundary features.
- [x] Replace radius-based coverage circles with PIN-code boundary polygons for all nine sample PINs.
- [x] Load additional PIN boundaries on demand when new dealer PINs are added or imported.
- [x] Replace the stacked mobile layout with a map-first Map/Dealers workflow and focused dealer bottom card.
- [x] Add a full Dealers workspace with responsive table/cards, shared filters, record status, and direct map focus.
- [x] Fix dialog contrast under dark system appearance while keeping the approved light visual system.
- [x] Add automatic PIN/state/area validation with review suggestions and manual verification for legitimate local names.
- [x] Add automated tests for postal normalization and validation decisions.
- [x] Add optional full addresses with address-level geocoding across add, edit, import, search, and dealer details.
- [x] Distinguish address-derived pins from approximate PIN-code locations.
- [x] Add shared state, salesperson, data-quality, PIN-code, and area filters across Map and Dealers.
- [x] Scope add/import actions to the Dealers workspace and provide a compact mobile map-filter dialog.
- [x] Select Google Maps for the production map and Neon Postgres for shared persistence.
- [x] Provision and link a free Singapore-region Neon database through the Vercel Marketplace.
- [x] Add Drizzle schema and migrations for salespeople, dealers, territory assignments, visit rules, route plans/stops, and visits.
- [x] Apply the initial Neon migration and seed the existing ten approved sample rows.
- [x] Add authenticated dealer CRUD APIs and Neon Auth sign-in/sign-up screens.
- [x] Add a Google Maps renderer for the existing PIN GeoJSON and dealer pins, with MapLibre fallback until the browser key is configured.
- [x] Deploy the authenticated Neon-backed build with the Google Maps browser key configured.
- [x] Add the canonical Vercel domain to Neon Auth trusted origins and verify production sign-in/session protection.
- [x] Restrict the Google Maps browser key to localhost, the production Vercel origin, and Maps JavaScript API only.
- [x] Add a responsive Routes workspace for salesperson/date selection, start/end locations, work hours, daily dealer selection, saved stop order, Google Maps handoff, and visit status.
- [x] Add authenticated route APIs backed by the existing Neon route-plan, route-stop, visit-rule, and visit-history tables.
- [x] Add a deterministic geometry preview with explicit approximate-location warnings while Google road optimization is not configured.
- [x] Send the selected India workday departure to Google for future plans and include dealer service time in the saved schedule.
- [x] Reject routes that cannot fit inside the selected workday before any plan is saved.
- [x] Save each route plan and all of its stops atomically in one Postgres statement.
- [x] Split long Google Maps handoffs into ordered, mobile-safe parts with no more than three waypoint parameters each.
- [x] Add route-flow tests for Google request/response mapping, workday fit, stop scheduling, and Maps handoff segmentation.
- [x] Split route optimization from persistence with a signed map-and-stop review preview before Save route.
- [x] Remove the redundant salesperson planner selector, clarify route lifecycle headings, and add last-used/current/manual start-location choices.
- [x] Audit role-specific Map, Dealers, Routes, Activity, and Team views; add textual map ownership, scalable Team filters, 44 px touch targets, a saved-route map, and a tested 25-stop selection guard.

## Current Objective

Complete the retailer-ordering cutover to Neon, then validate the hardened road-aware daily planning workflow with reviewed, exact dealer locations.

## Next Work

- [x] Apply the commerce schema through Drizzle, including categories, products, variants, product images, retailer links, immutable order items, and legacy reconciliation records.
- [x] Replace the Supabase runtime with authenticated Neon route handlers, Neon Auth username/password access, polling-based new-order alerts, and optional server-side Twilio notifications.
- [x] Align Commerce navigation, form controls, content width, and card styling with the shared workspace UI.
- [x] Standardize native, searchable, single-select, and multi-select dropdowns across Map, Dealers, Activity, Team, Commerce, and Shop.
- [x] Replace native Activity and route-planning date inputs with the shared app-styled calendar control.
- [x] Replace the sports-like green/lime visual identity with the selected ink-indigo, terracotta, parchment, and denim retail-operations palette across every role workspace.
- [x] Implement the three-phase target-experience UI pass: searchable Commerce entity selectors, focused product/account creation, actionable Commerce states, compact mobile Dealer filters, discoverable keyboard-correct workspace navigation, AA helper-text/avatar contrast, and explicit reduced-motion-safe primitive transitions.
- [x] Migrate dealer pins and route-preview stops to accessible Google Advanced Markers with a development-only demo map ID and a production-safe legacy fallback.
- [ ] Create a project-owned Google Maps JavaScript map ID, set `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` in the linked Vercel environments, and reverify the deployed map before removing the legacy fallback.
- [x] Add an idempotent, dry-run-first Supabase-to-Neon importer that preserves legacy IDs, timestamps, prices, order history, retailer metadata, and product image bytes.
- [ ] Recover an export or service-role connection for the legacy `amit-retail` Supabase project and run the importer; its configured project URL no longer resolves and the project is not visible in the currently authenticated Supabase account.
- [ ] Reconcile every staged legacy retailer to a canonical dealer and a deliberately created Neon Auth username/password account; never match shops by name alone or manufacture passwords.
- [ ] Exercise retailer, salesperson-plus-operations, operations-only, and administrator journeys against an isolated migrated database.
- [ ] Configure Twilio server credentials and verify order-created and status-change WhatsApp delivery in a non-production recipient flow.
- [x] Use PIN boundaries as the initial territory model.
- [x] Record the boundary source and license provenance.
- [ ] Confirm whether the two `500004` dealer areas intentionally share one Chander-owned PIN territory.
- [ ] Build an assignment editor with explicit unassigned-area handling.
- [ ] Add Andhra Pradesh sample rows and verify cross-state behavior.
- [x] Decide Neon as the shared data authority and establish an authenticated backend.
- [x] Move add/edit/delete/import operations to authenticated Neon APIs and remove browser-cache fallback for scoped data.
- [x] Configure a browser-restricted Google Maps JavaScript API key for localhost and the Vercel domain.
- [ ] Verify sign-up, sign-in, session protection, shared CRUD, and sign-out with an owner account.
- [ ] Replace Nominatim entry geocoding with Google Places and store Place IDs for reviewed exact dealer locations.
- [x] Add administrator and salesperson roles before operational data is loaded.
- [x] Build the Routes workspace: due-dealer selection, workday constraints, draft optimization, stop sequence, and Google Maps handoff.
- [x] Connect a Routes-API-only server credential, cap Compute Routes at 1,000 requests/day, and persist route metrics.
- [x] Enforce planned departure times and workday capacity, including dealer service duration.
- [x] Make route-plan persistence atomic and long-route Google Maps handoff mobile-safe.
- [x] Add foreground visit arrival/completion actions and next-due frequency reporting.
- [ ] Add automated tests for import normalization, duplicate detection, assignments, persistence, and map-data generation.
- [ ] Apply the workspace-wide dealer identity migration after the database recovery gate is approved, then deploy the matching API behavior.

## Verification Gates

- [x] Lint passes.
- [x] TypeScript typecheck passes.
- [x] Production build succeeds.
- [x] Excel import accepts the supplied sample and rejects duplicate rows.
- [x] WebMCP list/add tools handle valid and invalid input.
- [x] Port `5740` is registered and matches package scripts and docs.
- [x] Mobile viewport, dealer-list switching, dealer selection, map resizing, and desktop layout are visually verified.
- [ ] Territory polygons are visually reviewed against business expectations for the sample areas.
- [ ] Keyboard, focus, contrast, touch targets, reduced motion, empty states, and error states receive a complete accessibility pass.
- [x] The shared Neon backend is tested locally before production deployment.
- [x] The initial database migration and idempotent ten-row seed succeed against the linked Neon database.
- [x] Unauthenticated dealer API access returns `401`.
- [x] Production sign-in issues a session and authenticated access reaches the app shell.
- [x] Admin username login, team creation, salesperson login, scoped dealer/route reads, and blocked salesperson dealer writes are verified in production.
- [x] Google Maps rendering is verified after a restricted browser key is configured.
- [x] A live `ComputeRoutes` request succeeds through the Routes-only server credential.
- [x] Route contract tests cover planned departure, Google stop-order mapping, service-time scheduling, workday overruns, and mobile-safe Maps segmentation.
- [x] Commerce contract tests cover category validation, multiple images, product variants, order quantities/statuses, and account activation.
- [x] All commerce migrations through `0005` are applied to the configured Neon database.
- [ ] Legacy Supabase source and Neon target counts, image bytes, totals, and representative order histories match after the one-time import.
- [x] Retailer, operations-staff, dual-role salesperson/staff, and administrator commerce journeys are visually and behaviorally verified in disposable fixtures; legacy migrated-data parity remains open.
- [x] A salesperson completes a fresh synthetic exact-address route end to end in the isolated local UI without changing production records.
- [x] The staged production deployment and canonical origin are reverified after territory-map changes; no application fixture writes were repeated in production.

## Risks

- Published PIN polygons are a starting model and may differ from the sales team's operational territories.
- One PIN appears in two area records assigned to the same salesperson; both dealers share one colored polygon.
- The sample has no Andhra Pradesh dealers and cannot validate real AP assignments.
- Nominatim is suitable for light prototype geocoding, not unrestricted bulk production use.
- Address geocoding is an address-level estimate, not proof of a storefront entrance; users should visually review important pins.
- Account recovery and password reset still need an administrator workflow.
- Neon Auth and the current Google Maps loader integration are provider dependencies that need monitoring and a documented recovery owner.
- Route optimization is billable and must be protected by server-side credentials, quotas, and role checks.
- The app-layer duplicate check is active locally; the generated database uniqueness migration must ship with the matching API deployment to provide race-safe enforcement.
- The original Supabase project is currently unreachable, so zero imported commerce rows proves only that the target is empty; it does not prove the source had no data.
- Product image bytes are stored in Neon Postgres to keep this cutover Neon-only. The 4 MB administrative upload limit and 12 MB migration limit must remain enforced until a reviewed object-storage decision is made.

## Deployment Gates

- The Vercel deployment is a public prototype, not a production system of record; use only sample or approved non-sensitive data.
- Apply future schema migrations only with an explicit project decision and a verified backup/recovery path.
- The linked Neon database has the commerce schema but currently contains no recovered legacy commerce rows. Do not delete `amit-retail` or retire any remaining Supabase backup until source counts and representative records are reconciled, or the owner explicitly confirms that the source contained no data.
- Do not claim production readiness until territory geometry, persistence, access control, backups, and operational ownership are verified.
