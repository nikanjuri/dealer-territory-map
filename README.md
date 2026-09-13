# Dealer Territory Map

An interactive operational map and dealer directory for salesperson territories across Telangana and Andhra Pradesh. The prototype loads 10 sample dealers, assigns a stable color to each salesperson, supports search and filtering, and accepts manual or Excel/CSV additions.

## Current Status

The app is a public review prototype hosted on Vercel. Its Map view combines PIN-boundary coverage with dealer pins, while the Dealers view provides complete record columns, quality status, and direct map focus. New entries are stored in the current browser only, so changes are not shared between visitors.

Public deployment: [dealer-territory-map.vercel.app](https://dealer-territory-map.vercel.app)

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

The current prototype requires no environment variables. `.env.example` records that contract. Keep any future secrets in ignored `.env.local` or provider-managed environment storage.

## Commands

```bash
npm run dev        # local development on port 5740
npm run lint       # ESLint
npm run typecheck  # TypeScript without emission
npm run build      # production Next.js build
npm run start      # serve the production build locally on port 5740
npm run verify     # lint, typecheck, and production build
```

## Data Import

The first worksheet of an `.xlsx`, `.xls`, or `.csv` file is read in the browser. Required columns are:

```text
SALES PERSON | DEALER NAME | PINCODE | AREA
```

Choose Telangana or Andhra Pradesh for the uploaded file. The prototype accepts up to 50 rows per import and geocodes up to 10 previously unknown PIN codes in one batch. Duplicate dealer/PIN rows are skipped.

## Architecture

- Next.js App Router with React and TypeScript
- Tailwind CSS and local shadcn-derived UI primitives
- MapLibre GL with a same-origin worker and OpenStreetMap raster tiles
- Local GeoJSON outlines for Telangana and Andhra Pradesh
- Local PIN-boundary polygons for all nine sample PINs, with on-demand boundary lookup for newly added PINs
- SheetJS for browser-side spreadsheet parsing
- Nominatim for low-volume prototype PIN geocoding
- Browser local storage for temporary persistence
- Optional browser WebMCP tools for listing and adding dealers

The future shared model should separate dealers, salespeople, approved territory polygons, dated assignments, import issues, and audit history.

## Territory Semantics

- Grey means unassigned only when the complete boundary set is available.
- Salesperson colors fill PIN-code polygons in the current model.
- PIN, district/mandal, and custom-drawn territories are different models and must not be mixed without a documented rule.
- The supplied sample contains two Chander dealer rows in PIN `500004`; they intentionally render as one Chander-owned polygon unless the business assignment changes.

Boundary provenance and limitations are recorded in `docs/data-sources.md`.

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

Vercel is the selected host. `.vercel/` contains local provider linkage and must remain ignored. Publishing a new version, attaching storage, adding authentication, or migrating operational data is a deliberate remote action and is not part of routine local development.
