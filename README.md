# Dealer Territory Map

An interactive operational map for salesperson territories and dealer locations across Telangana and Andhra Pradesh. The prototype loads 10 sample dealers, assigns a stable color to each salesperson, supports search and filtering, and accepts manual or Excel/CSV additions.

## Current Status

The app is a review prototype. Dealer pins are real PIN-centroid approximations, while colored 12 km circles are placeholders—not official territory boundaries. New entries are stored in the current browser only.

Private review deployment: [dealer-territory-map-ap-ts.nikanjuri.chatgpt.site](https://dealer-territory-map-ap-ts.nikanjuri.chatgpt.site)

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
npm run build      # production Sites artifact
npm run start      # serve the built Worker locally on port 5740
npm run verify     # lint, typecheck, and production build
```

## Data Import

The first worksheet of an `.xlsx`, `.xls`, or `.csv` file is read in the browser. Required columns are:

```text
SALES PERSON | DEALER NAME | PINCODE | AREA
```

Choose Telangana or Andhra Pradesh for the uploaded file. The prototype accepts up to 50 rows per import and geocodes up to 10 previously unknown PIN codes in one batch. Duplicate dealer/PIN rows are skipped.

## Architecture

- React and TypeScript on vinext/Next-compatible routing
- Tailwind CSS and local shadcn-derived UI primitives
- MapLibre GL with OpenStreetMap raster tiles
- Local GeoJSON outlines for Telangana and Andhra Pradesh
- SheetJS for browser-side spreadsheet parsing
- Nominatim for low-volume prototype PIN geocoding
- Browser local storage for temporary persistence
- Optional browser WebMCP tools for listing and adding dealers

The future shared model should separate dealers, salespeople, approved territory polygons, dated assignments, import issues, and audit history.

## Territory Semantics

- Grey means unassigned only when the complete boundary set is available.
- Salesperson colors must fill approved polygons—not arbitrary proximity circles.
- PIN, district/mandal, and custom-drawn territories are different models and must not be mixed without a documented rule.
- The supplied sample contains a PIN shared by two area rows, so one-owner-per-PIN behavior requires a business decision.

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

Local verification, Sites linkage, private review deployment, and production readiness are separate states. The current deployment is a private review artifact and not a shared system of record.

## Deployment

`.openai/hosting.json` preserves the existing Sites project linkage. Publishing a new version, changing access, attaching storage, or migrating data is a deliberate remote action and is not part of routine local development.
