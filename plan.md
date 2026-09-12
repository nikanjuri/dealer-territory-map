# Dealer Territory Map Plan

## Current Phase

Prototype validation and territory-model definition.

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

## Current Objective

Replace approximate 12 km PIN-centroid circles with approved territory polygons so salesperson coverage and grey gaps are geographically meaningful.

## Next Work

- [ ] Decide whether territory ownership follows PIN boundaries, districts/mandals, or manager-drawn polygons.
- [ ] Resolve the two dealer rows that share PIN `500004` before enforcing one owner per PIN.
- [ ] Source and license the chosen boundary dataset for both states.
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
- [ ] Territory polygons are visually reviewed against a trusted boundary source.
- [ ] Keyboard, focus, contrast, touch targets, reduced motion, empty states, and error states receive a complete accessibility pass.
- [ ] A shared backend, if selected, is tested locally before any remote migration.
- [ ] Preview and production deployments are reverified after territory-model changes.

## Risks

- PIN centroids are not territory boundaries; the current circles can overstate or understate coverage.
- One PIN appears in two different area records, so PIN-level ownership needs a conflict rule.
- The sample has no Andhra Pradesh dealers and cannot validate real AP assignments.
- Nominatim is suitable for light prototype geocoding, not unrestricted bulk production use.
- Browser local storage is neither shared nor auditable.

## Deployment Gates

- The existing Sites deployment is a private review prototype, not a production system of record.
- Do not provision a database, change access policy, deploy a new version, or migrate data without an explicit project decision.
- Do not claim production readiness until territory geometry, persistence, access control, backups, and operational ownership are verified.
