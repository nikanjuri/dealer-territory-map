# Dealer Territory Map

An authenticated operational map and dealer directory for salesperson territories across Telangana and Andhra Pradesh. The app loads 10 sample dealers, assigns a stable color to each salesperson, supports shared operational filters, and accepts manual or reviewed file imports.

## Current Status

The public Vercel deployment includes Neon Postgres, Neon Auth, username-based role access, authenticated dealer CRUD, and the Google Maps renderer while preserving the existing PIN-boundary behavior. Administrators manage salespeople and the full dealer directory and receive read-only route activity oversight; salesperson accounts receive only their linked dealers and can plan routes and update their own visits. Its dedicated Google Maps browser key is limited to the production site and local development, and can access only the Maps JavaScript API. A salesperson Routes workspace supports daily stop selection, saved plans, visit progress, and frequency tracking; road-aware Google optimization uses a separate server credential.

Public deployment: [dealer-territory-map.vercel.app](https://dealer-territory-map.vercel.app)

Accounts use usernames in the UI. Public registration and direct email sign-in are disabled; an administrator sets each salesperson's username and initial password from the Team workspace. Existing passwords are never displayed. An administrator can replace a forgotten password from the salesperson row, which revokes that account's current sessions. Passwords remain managed by Neon Auth and must never be committed to project files.

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

`GOOGLE_ROUTES_API_KEY` is optional during development. Without it, route plans use a clearly labelled geometric preview. Configure it as a server-only Vercel variable restricted to the Routes API before using optimized plans in the field. The signed-in salesperson is the fixed planner identity. Their most recent saved start point is reused by default, with manual address entry and explicit device geolocation available as alternatives. Future route dates send the selected India workday start as Google's traffic-aware departure time. The API rejects a plan when driving plus configured dealer service time cannot fit before the selected finish time. Optimization first returns a signed, short-lived map-and-stop preview; nothing is persisted until the salesperson reviews it and selects **Save route**. `ROUTE_PREVIEW_SECRET` can supply a separate signing secret in production; existing environments fall back to another server-only project secret.

## Commands

```bash
npm run dev        # local development on port 5740
npm run update:postal # refresh the checked-in Telangana/AP postal directory
npm run db:generate # generate a Drizzle migration after schema changes
npm run db:migrate  # apply pending migrations to the configured Neon branch
npm run db:seed     # idempotently seed the ten approved sample rows
npm run lint       # ESLint
npm run test       # geocoding, import, and postal validation tests
npm run typecheck  # TypeScript without emission
npm run build      # production Next.js build
npm run start      # serve the production build locally on port 5740
npm run verify     # lint, typecheck, and production build
```

## Data Import

The first worksheet of an `.xlsx`, `.xls`, or `.csv` file is read in the browser. JSON files may contain a top-level array or a `dealers`/`rows` array. Images and PDFs use client-side OCR and must be checked in the review step. Required fields are:

```text
SALES PERSON | DEALER NAME | PINCODE | AREA | STATE
```

`FULL ADDRESS` is optional. Common aliases such as `ADDRESS`, `STREET ADDRESS`, and `DEALER ADDRESS` are accepted. When supplied, it is geocoded with the area, PIN, and state to place an address-level marker. Without it, the marker remains an approximate PIN-code point.

Column order may vary, and common aliases such as `SALESPERSON`, `PIN CODE`, `AREA NAME`, and `STATE NAME` are accepted. A single file may contain rows from both Telangana and Andhra Pradesh. No records are saved until the editable, paginated review step is confirmed. Structured Excel/CSV/JSON imports accept up to 500 rows; OCR imports accept up to 50 extracted rows. The prototype performs up to 10 new address/PIN geocoding requests in one batch. A dealer name/PIN combination can exist only once across the workspace; the same normalized dealer name at the same full address is also treated as a match. Matching imports are skipped and the administrator is directed to reassign the existing dealer from Dealers or Team.

PIN, state, and area values are automatically checked against the checked-in Telangana/Andhra Pradesh postal directory. Exact post-office matches are verified; close spellings and unlisted local-area names are retained with a review warning and official suggestions. Unknown PINs and wrong-state combinations are rejected. A reviewer may explicitly mark a valid colloquial area name as verified.

## Architecture

- Next.js App Router with React and TypeScript
- Tailwind CSS and local shadcn-derived UI primitives
- Google Maps JavaScript API when configured, with MapLibre/OpenStreetMap transition fallback
- Local GeoJSON outlines for Telangana and Andhra Pradesh
- Local PIN-boundary polygons for all nine sample PINs, with on-demand boundary lookup for newly added PINs
- SheetJS for browser-side spreadsheet parsing, plus JSON support
- Tesseract.js and PDF.js for client-side image/PDF extraction with mandatory review
- Nominatim for low-volume prototype full-address and PIN geocoding
- A checked-in Department of Posts directory extract for automatic PIN/state/area validation
- Neon Postgres with Drizzle migrations and authenticated Next.js dealer APIs
- Neon Auth password/session handling behind username-based application accounts
- Server-enforced administrator and salesperson scopes: administrator route oversight is read-only, while route planning and visit updates are salesperson-only
- Route-planning schema for recurring visit rules, daily plans/stops, and completed visits
- Authenticated route planning with India-biased Google Places suggestions for route endpoints, daily dealer selection, traffic-aware planned departure, a signed review preview before saving, workday capacity including visit duration, atomic plan/stop persistence, mobile-safe segmented Google Maps handoff, visit completion, and next-due updates
- Google Routes `ComputeRoutes` adapter with a labelled local distance-preview fallback
- Optional browser WebMCP tools for listing and adding dealers

The shared model separates dealers, salespeople, approved territory polygons, dated assignments, visit rules, route plans/stops, and visit history. Import-batch audit records and role enforcement remain next work.

## Territory Semantics

- Grey means unassigned only when the complete boundary set is available.
- Salesperson colors fill PIN-code polygons in the current model.
- PIN, district/mandal, and custom-drawn territories are different models and must not be mixed without a documented rule.
- The supplied sample contains two Chander dealer rows in PIN `500004`; they intentionally render as one Chander-owned polygon unless the business assignment changes.

Boundary and postal-directory provenance and limitations are recorded in `docs/data-sources.md`.

Address geocoding improves marker placement but does not prove a storefront entrance or GPS-surveyed coordinate. Important dealer pins should be reviewed on the map before route planning.

Google Maps URLs accept fewer waypoints on mobile browsers than the Routes API can optimize. Saved routes with more than three stops are therefore opened as ordered parts; the salesperson completes the parts in sequence without losing the optimized stop order.

## Project Documents

- `idea.md`: problem, audience, scope, constraints, and open questions
- `plan.md`: completed prototype work, next tasks, risks, and release gates
- `design.md`: workflows, visual system, architecture, data model, and accessibility
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

Vercel is the selected host and the linked Neon resource uses the free plan in the Singapore region. `.vercel/` contains local provider linkage and remains ignored. The authenticated build is deployed, the initial schema and ten sample rows have been applied, and production sign-in/session protection and Google Maps rendering have been checked with a test account. A separate Routes-API-only server credential is configured in Vercel, Compute Routes is capped at 1,000 requests per day, and a live optimized-route request succeeds. Operational data has not been imported. Add reviewed full dealer addresses and complete role/access testing before treating optimized routes as field-ready.
