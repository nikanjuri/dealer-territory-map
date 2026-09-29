# Dealer Territory Map

An authenticated operational suite for salesperson territories, dealer routes and visits, retailer ordering, and order fulfillment across India. It assigns a stable color to each salesperson, supports shared operational filters, and accepts manual or reviewed file imports. The current dealer dataset is source-backed; prototype seed dealers are not loaded.

## Current Status

The 2026-09-29 main-promotion checkpoint fixes mobile route clipping, offline visit outbox races and scoping, address lookup errors, and stale routing-input saves. All 108 automated tests, lint, typecheck, production build and six isolated persistence groups pass. See [the current QA record](docs/audits/MAIN_QA_2026-09-29.md) for browser checks and the remaining isolated authenticated write/retailer/offline gates. Deployment completion must be checked separately from the authorized Git push.

The local application now includes the full retailer-ordering workflow on Neon: an authenticated catalog and cart, MOQ-aware checkout, order history and reorder, commerce dashboards and fulfillment, product/category/variant management, Neon-stored product images, retailer account administration, guarded account deletion, and optional server-side WhatsApp notifications. Field operations, commerce operations, and retailer ordering share the same `/` application shell and role-aware tab row. Retailer, salesperson, operations-staff, and administrator permissions use one Neon Auth username/password system; roles are additive, so a salesperson may also process orders without a second account. Deleting a commerce-only account revokes its access but retains historical order snapshots; administrator and salesperson identities remain managed from Team. There is no OTP login path and no Supabase runtime dependency.

The public Vercel deployment predates this commerce cutover until a new deployment is explicitly approved. Its existing territory and route features include Neon Postgres, Neon Auth, authenticated dealer CRUD, Google Maps, PIN-boundary coverage, administrator read-only Activity oversight, and salesperson-scoped route planning and visit updates.

The local 2026-09-26 work adds a Today-first route workflow, seven-day visit suggestions, per-dealer visit history, shareable filter views, weak-network visit queuing, retry-safe route and order writes, safer dealer Undo, and Google-place-confirmed new address pins. These changes are **not deployed**. Migration `drizzle/0008_ancient_veda.sql` was applied to the existing linked Neon database on 2026-09-28 after a backup, verified local restore, and migration rehearsal. The missing history entries for already-present migrations `0006`–`0007` were reconciled after schema comparison. Development and production currently share this database. Role-based browser QA remains a deployment gate; see [the migration verification record](docs/audits/DATABASE_MIGRATION_2026-09-28.md).

Public deployment: [dealer-territory-map.vercel.app](https://dealer-territory-map.vercel.app)

Accounts use usernames in the UI. Public registration and direct email sign-in are disabled; an administrator sets each salesperson's username and initial password from the Team workspace. Existing passwords are never displayed. An administrator can replace a forgotten password or delete the login from the salesperson row. Login deletion removes the shared account and any Commerce access while preserving the salesperson, assigned dealers, routes, and visits. Passwords remain managed by Neon Auth and must never be committed to project files.

## Local Setup

Prerequisites:

- Node.js `>=22.13.0`
- npm

Install and start:

```bash
npm run install:ci
npm run dev
```

Open [http://localhost:5740](http://localhost:5740).

Pull the linked development environment before starting:

```bash
npx vercel env pull .env.local --environment=development --yes
```

Neon connection, Auth, and Google Maps browser variables are pulled from the linked Vercel project. Restrict the browser key to `http://localhost:5740/*` and the production Vercel origin in Google Cloud. Never store server credentials in a `NEXT_PUBLIC_` variable.

`NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` enables accessible Google Advanced Markers in deployed environments. Local development uses Google's documented `DEMO_MAP_ID` when this variable is absent, while production deliberately retains legacy markers until a project-owned JavaScript map ID is configured. Do not treat the demo map ID as production configuration.

`GOOGLE_ROUTES_API_KEY` is optional during development. Without it, route plans use a clearly labelled geometric preview. Configure it as a server-only Vercel variable restricted to the Routes API before using optimized plans in the field. The signed-in salesperson is the fixed planner identity. Their most recent saved start point is reused by default, with manual address entry and explicit device geolocation available as alternatives. Future route dates send the selected India workday start as Google's traffic-aware departure time. The API rejects a plan when driving plus configured dealer service time cannot fit before the selected finish time. Optimization first returns a signed, short-lived map-and-stop preview; nothing is persisted until the salesperson reviews it and selects **Save route**. `ROUTE_PREVIEW_SECRET` can supply a separate signing secret in production; existing environments fall back to another server-only project secret.

## Commands

```bash
npm run dev        # local development on port 5740
npm run update:postal # refresh the checked-in all-India postal directory
npm run db:generate # generate a Drizzle migration after schema changes
npm run db:migrate  # apply pending migrations to the configured Neon branch
npm run db:normalize-dealers # dry-run the one-time area/prototype cleanup
npm run db:import-new-dealers # dry-run newly added raw-data salesperson workbooks
npm run db:auto-verify-dealer-areas # dry-run safe postal area auto-verification
npm run db:audit-dealer-locations # read-only PIN/state/coordinate audit of the configured database
npm run db:migrate:amit-retail # dry-run the one-time Supabase export/import
npm run lint       # ESLint
npm run test       # geocoding, import, and postal validation tests
npm run typecheck  # TypeScript without emission
npm run build      # production Next.js build
npm run start      # serve the production build locally on port 5740
npm run verify     # tests, lint, typecheck, and production build
```

## Data Import

The first worksheet of an `.xlsx`, `.xls`, or `.csv` file is read in the browser. JSON files may contain a top-level array or a `dealers`/`rows` array. Images and PDFs use client-side OCR and must be checked in the review step. Required fields are:

```text
SALES PERSON | DEALER NAME | PINCODE | AREA | STATE
```

`FULL ADDRESS` is optional. Common aliases such as `ADDRESS`, `STREET ADDRESS`, and `DEALER ADDRESS` are accepted. When supplied, it is geocoded with the area, PIN, and state to place an address-level marker. Without it, the marker remains an approximate PIN-code point.

Column order may vary, and common aliases such as `SALESPERSON`, `PIN CODE`, `AREA NAME`, and `STATE NAME` are accepted. A single file may contain rows from multiple Indian states. No records are saved until the editable, paginated review step is confirmed. Structured Excel/CSV/JSON imports accept up to 500 rows; OCR imports accept up to 50 extracted rows. The prototype performs up to 10 new address/PIN geocoding requests in one batch. A dealer name/PIN combination can exist only once across the workspace; the same normalized dealer name at the same full address is also treated as a match. Matching imports are skipped and the administrator is directed to reassign the existing dealer from Dealers or Team.

PIN, state, and area values are automatically checked against the checked-in all-India postal directory. Exact post-office matches are verified; close spellings and unlisted local-area names are retained with a review warning and official suggestions. Unknown PINs and wrong-state combinations are rejected. A reviewer may explicitly mark a valid colloquial area name as verified. New or changed coordinates must also fall inside a matching PIN polygon, using the 2024 layer only where the 2025 layer has a gap. If a polygon is missing or the sources disagree, the save is held for location review rather than placing a guessed marker. This is geographic consistency, not proof of an exact shop address.

## Retail Ordering and Supabase Retirement

- `/` is the canonical workspace. Authorized users see Map, Dealers, Routes/Activity, Team, Commerce, and/or Shop tabs according to their roles.
- `/shop` and `/commerce` remain only as validated compatibility redirects into the Shop or Commerce tab on `/`.
- Neon Postgres is the authority for all commerce records. Neon Auth owns password and session handling.
- Product image bytes are stored in `commerce_product_images` and served only through authenticated route handlers. Administrative uploads are capped at 4 MB per image.
- New-order alerts use a lightweight authenticated refresh rather than Supabase Realtime. Optional WhatsApp delivery is server-only through Twilio.
- Legacy retailer metadata is staged for explicit dealer/account reconciliation. Supabase OTP users and passwords are not transferable and are never converted into guessed credentials.

The importer is dry-run-first and idempotent. It requires a temporary source service-role key in the shell environment; run `npm run db:migrate:amit-retail -- --apply` only after source counts are reviewed. The former project URL currently does not resolve, so no legacy commerce rows have been copied. See [docs/amit-retail-neon-cutover.md](docs/amit-retail-neon-cutover.md) for the mapping, commands, and deletion gate.

## Architecture

- Next.js App Router with React and TypeScript
- Tailwind CSS and local shadcn-derived UI primitives
- Google Maps JavaScript API when configured, with MapLibre/OpenStreetMap transition fallback
- Local GeoJSON outlines for Telangana and Andhra Pradesh
- On-demand postal PIN-boundary polygons for dealer PINs
- SheetJS for browser-side spreadsheet parsing, plus JSON support
- Tesseract.js and PDF.js for client-side image/PDF extraction with mandatory review
- Google Places selection and explicit pin review for new/edited dealer address pins; low-volume legacy import geocoding still uses Nominatim and remains a separate review path
- A checked-in Department of Posts directory extract for automatic PIN/state/area validation
- Neon Postgres with Drizzle migrations and authenticated Next.js dealer and commerce APIs
- Neon Auth password/session handling behind username-based application accounts
- Four additive application roles: retailer, salesperson, operations staff, and administrator
- Server-enforced scopes: retailers are limited to their linked dealer orders, operations staff manage commerce, administrator route oversight is read-only, and route planning/visit updates are salesperson-only
- Neon-backed commerce categories, products, variants, product images, retailer links, orders, immutable price snapshots, and legacy reconciliation rows
- Route-planning schema for recurring visit rules, daily plans/stops, and completed visits
- Authenticated route planning with India-biased Google Places suggestions for route endpoints, daily dealer selection, traffic-aware planned departure, a signed review preview before saving, workday capacity including visit duration, atomic plan/stop persistence, mobile-safe segmented Google Maps handoff, visit completion, and next-due updates
- Google Routes `ComputeRoutes` adapter with a labelled local distance-preview fallback
- Optional browser WebMCP tools for listing and adding dealers

The shared model separates dealers, salespeople, approved territory polygons, dated assignments, visit rules, route plans/stops, and visit history. Import-batch audit records and role enforcement remain next work.

## Territory Semantics

- Grey state outlines are neutral geographic context, not unassigned coverage.
- A salesperson color fills a PIN when all dealers in it have one salesperson.
- A slate PIN with an amber outline means dealers in that PIN are assigned to
  multiple salespeople; records under import review are not shown on the map.
- PIN, district/mandal, and custom-drawn territories are different models and must not be mixed without a documented rule.
- The canonical area is displayed and filtered in the app while the original
  workbook area remains preserved as `source_area` for audit and editing.

Boundary and postal-directory provenance and limitations are recorded in `docs/data-sources.md`.

Address geocoding improves marker placement but does not prove a storefront entrance or GPS-surveyed coordinate. Important dealer pins should be reviewed on the map before route planning.

Google Maps URLs accept fewer waypoints on mobile browsers than the Routes API can optimize. Saved routes with more than three stops are therefore opened as ordered parts; the salesperson completes the parts in sequence without losing the optimized stop order.

## Project Documents

- `idea.md`: problem, audience, scope, constraints, and open questions
- `plan.md`: completed prototype work, next tasks, risks, and release gates
- `design.md`: workflows, visual system, architecture, data model, and accessibility
- `docs/audits/WORKSPACE_UI_AUDIT_2026-09-16.md`: role-by-role UI findings, fixes, and remaining validation
- `docs/amit-retail-neon-cutover.md`: legacy mapping, one-time import procedure, and the gate for deleting the old repository
- `AGENTS.md`: coding, verification, data, and remote-operation rules
- `.project.json`: bootstrap profile and registered local URL

## Verification

```bash
npm run verify
python3 /Users/nikhilanjuri/.codex/skills/dev-project-bootstrap/scripts/verify_project.py /Users/nikhilanjuri/GitHub/dealer-territory-map
ports sync /Users/nikhilanjuri/GitHub
ports check
```

Local verification, Vercel linkage, public deployment, and production readiness are separate states. The public deployment is a review artifact and not a shared system of record.

## Deployment

Vercel is the selected host and the linked Neon resource uses the free plan in the Singapore region. `.vercel/` contains local provider linkage and remains ignored. Application migrations through `0008` are recorded in the configured Neon database, but the commerce changes have not been deployed and legacy Supabase data has not been recovered. The existing production deployment has verified sign-in/session protection, Google Maps rendering, and a live Google Routes request. Do not delete the old repository or call the commerce cutover data-complete until source counts, product images, retailer reconciliation, representative orders, and all four role journeys pass the documented gate.
