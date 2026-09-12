# Dealer Territory Map Plan

## Current Phase

PIN-boundary prototype validation and territory-model refinement.

## Completed

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

## Current Objective

Validate PIN-level salesperson ownership across a broader Telangana and Andhra Pradesh dataset before introducing shared persistence.

## Next Work

- [x] Use PIN boundaries as the initial territory model.
- [x] Record the boundary source and license provenance.
- [ ] Confirm whether the two `500004` dealer areas intentionally share one Chander-owned PIN territory.
- [ ] Build an assignment editor with explicit unassigned-area handling.
- [ ] Add Andhra Pradesh sample rows and verify cross-state behavior.
- [ ] Decide the shared data authority and role model before adding a backend.
- [ ] Move browser-only changes to persistent, auditable storage.
- [ ] Add automated tests for import normalization, duplicate detection, assignments, and map-data generation.

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
- [ ] A shared backend, if selected, is tested locally before any remote migration.
- [ ] The Vercel preview and production deployments are reverified after territory-model changes.

## Risks

- Published PIN polygons are a starting model and may differ from the sales team's operational territories.
- One PIN appears in two area records assigned to the same salesperson; both dealers share one colored polygon.
- The sample has no Andhra Pradesh dealers and cannot validate real AP assignments.
- Nominatim is suitable for light prototype geocoding, not unrestricted bulk production use.
- Browser local storage is neither shared nor auditable.

## Deployment Gates

- The Vercel deployment is a public prototype, not a production system of record; use only sample or approved non-sensitive data.
- Do not provision a database, add authentication, or migrate operational data without an explicit project decision.
- Do not claim production readiness until territory geometry, persistence, access control, backups, and operational ownership are verified.
