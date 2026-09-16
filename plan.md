# Dealer Territory Map Plan

## Current Phase

Daily route planning and visit operations.

## Completed

- [x] Replace email-facing sign-in with usernames and disable public self-registration.
- [x] Add administrator-managed salesperson accounts and server-enforced salesperson scoping for dealers, routes, and visit updates.
- [x] Add per-salesperson Team actions for login setup and administrator password reset.
- [x] Separate salesperson route operations from administrator read-only route oversight in both UI and APIs.
- [x] Keep route re-optimization warnings in the salesperson workflow instead of the administrator Activity view.
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

## Current Objective

Validate the hardened road-aware daily planning workflow with reviewed, exact dealer locations.

## Next Work

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
- [ ] A salesperson completes a fresh exact-address route end to end in the local UI without changing production records.
- [ ] The Vercel preview and production deployments are reverified after territory-model changes.

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

## Deployment Gates

- The Vercel deployment is a public prototype, not a production system of record; use only sample or approved non-sensitive data.
- Apply future schema migrations only with an explicit project decision and a verified backup/recovery path.
- The linked Neon database currently contains only the ten sample rows; do not upload browser-local or operational data implicitly.
- Do not claim production readiness until territory geometry, persistence, access control, backups, and operational ownership are verified.
