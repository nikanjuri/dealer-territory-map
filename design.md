---
version: 1.0.0
name: "Dealer Territory Map"
description: "A map-first operational workspace for salesperson coverage and dealer locations across Telangana and Andhra Pradesh."
omitted: []
---

# Dealer Territory Map Design

## Overview

This is a map-first operational tool, not a marketing site. The interface should let a sales manager answer three questions quickly: who owns this area, where are the dealers, and what remains uncovered? `idea.md` owns product intent; this document owns workflow, architecture, and visual decisions.

Design profile: `product`. Use Emil Kowalski design-engineering guidance and Impeccable as judgment references. Existing local components and tokens are the implementation foundation.

## Primary Workflows

1. Review coverage: open the map, compare salesperson colors, and identify grey unassigned polygons.
2. Find a dealer: search by dealer, area, PIN, or salesperson; select a result; focus the map; read details and warnings.
3. Filter ownership: toggle salespeople without losing spatial context.
4. Add one dealer: enter salesperson, state, dealer, PIN, and area; validate; geocode; confirm the map result.
5. Import dealers: choose one state for the file, upload Excel/CSV, normalize agreed columns, locate new PINs, skip duplicates, and report results.
6. Resolve data issues: surface PIN/area conflicts without silently correcting business data.

## Screens and Routes

- `/`: one responsive dashboard containing the summary header, controls, searchable dealer list, map, selection details, add dialog, import dialog, toast feedback, and data-quality warnings.
- Empty state: keep the two-state map visible, explain that grey means unassigned, and offer add/import actions.
- Loading state: show progress while MapLibre loads or PIN geocoding/import is running.
- Error state: preserve entered values and provide a concise correction for invalid PINs, unreadable files, missing columns, geocoding failures, and import limits.

## Information Architecture

- Header: product identity, state scope, record metrics, and add/import actions.
- Sidebar: search, salesperson legend/filters, dealer results, and selected-dealer details.
- Map: state context, approved coverage geometry, dealer pins, navigation, attribution, and a clear prototype notice when geometry is approximate.
- On compact screens, controls and dealer results precede the map in document order so the interface remains understandable without relying on spatial layout.

## Colors

- Canvas: `#eef0ed`; cards: `#ffffff`; primary text: `#18221f`.
- Deep green action/navigation: `#173a34`; lime accent: `#d9f36b`.
- Muted text: `#6e7874`; border: `#d9dedb`; unassigned geography: `#a9b0ad`.
- Kiran: `#df4e3f`; Madhu: `#2f6fe4`; Chander: `#c48a12`.
- New salesperson colors come from the documented fallback palette in `app/dealers.ts` and must remain stable for the same normalized name.
- Never use color alone: names, labels, filters, selected states, and details must communicate ownership textually.

## Typography

- UI sans: Inter when available, then the platform sans-serif stack.
- Body text is at least 14 px in operational surfaces; helper text may be 12 px when contrast and line height remain readable.
- Use weight and spacing for hierarchy. Avoid all-caps except short source data labels that intentionally preserve spreadsheet naming.
- PIN codes and counts use tabular numerals when alignment matters.

## Layout

- Desktop: fixed-width operational sidebar beside a fluid map; map retains a practical minimum height.
- Tablet: allow the sidebar to narrow without truncating essential dealer/PIN labels.
- Mobile: stack controls, list, details, and map; keep touch actions visible and avoid horizontal overflow.
- Base spacing follows a 4 px rhythm, with 8/12/16/24/32 px as the common intervals.
- Dense lists are acceptable, but dealer rows need a minimum 44 px interactive target.

## Elevation and Depth

- Use borders for ordinary grouping.
- Use a restrained shadow only for floating map notices, dialogs, popovers, and focused overlays.
- Map layers communicate geographic hierarchy through opacity and stroke, not decorative depth.

## Shapes

- Base radius: 12 px; controls: 8-12 px; dialogs/cards: 12-16 px.
- Dealer pins remain circular because shape encodes point location.
- Territory polygons follow real boundaries and must never be rounded or cosmetically altered.

## Components

- MapLibre map with OpenStreetMap raster tiles and required attribution.
- Search input, salesperson filter chips/rows, dealer result row, metric badge, selected-dealer panel, alert state, dialog, select, input, button, toast, and responsive shell.
- Use the existing shadcn-derived local primitives; do not add a component catalog during ordinary feature work.
- Record substantially copied external UI in `docs/component-sources.md` before merging it.

## Motion

- Map focus may use a short fly-to transition of about 850 ms.
- Hover/focus/control feedback should remain under 200 ms.
- No autoplay, decorative loops, or polling-driven replay.
- Respect `prefers-reduced-motion`: remove smooth map flight and nonessential transitions when reduction is requested.

## Accessibility

- Every form field needs a programmatic label and actionable errors.
- Dealer rows and map-linked controls must be keyboard operable with visible focus.
- Selection and ownership need text/shape support in addition to color.
- Maintain WCAG AA contrast for UI text and controls; map content must have an equivalent list/detail representation.
- Dialog focus must enter, remain trapped, and return to the trigger.
- Minimum touch target is 44 by 44 px for primary mobile actions.
- Map loading, import progress, success, and error feedback should be announced to assistive technology.

## Responsive Behavior

- Compact mobile: single-column flow, icon-plus-label actions where space permits, vertically scrollable list, map at least 420 px tall.
- Tablet: balanced split or stacked layout depending on available width; no clipped filters.
- Desktop/wide: sidebar and map share the viewport; map is the dominant surface.
- Never hide state scope, attribution, data warnings, or the distinction between approximate and approved territories.

## Data Model

Current `Dealer` fields: `id`, `salesperson`, `dealer`, `pincode`, `area`, `state`, `latitude`, `longitude`, and optional `reviewNote`.

The production model should separate:

- dealer records and exact/approximate locations;
- salesperson identities and display colors;
- territory geometry and geographic unit type;
- dated territory assignments with approval status;
- import batches, validation issues, and audit events.

Territory geometry is authoritative for area coloring. Dealer proximity or PIN-centroid circles are never authoritative ownership.

## Architecture and Integrations

- UI: React/TypeScript, vinext/Next-compatible routing, Tailwind CSS, local shadcn-derived components.
- Mapping: MapLibre GL; OpenStreetMap raster tiles; local GeoJSON for the two state outlines.
- Import: SheetJS parses the first worksheet from `.xlsx`, `.xls`, or `.csv` in the browser.
- Geocoding: Nominatim by six-digit PIN for small prototype additions. Production bulk usage needs a compliant provider and caching strategy.
- Persistence: browser local storage only in this phase.
- Agent interface: browser WebMCP exposes constrained list/add dealer tools where supported.
- Hosting: an existing private Sites deployment is linked through `.openai/hosting.json`; remote publication remains an explicit action.

## Do's and Don'ts

- Do preserve the full Telangana and Andhra Pradesh context.
- Do show grey as explicitly unassigned only when the underlying polygon set is complete.
- Do expose source-data warnings and assignment conflicts.
- Do keep data entry reversible and validate before persistence.
- Don't imply that PIN centroids are boundaries.
- Don't silently assign a whole PIN when source rows conflict.
- Don't expose operational dealer or employee data publicly by default.
- Don't add animation runtimes, mapping providers, databases, or design systems without a concrete need and documented decision.

## Tradeoffs and Decisions

- MapLibre plus OpenStreetMap avoids a required map API key for the prototype, but tile and geocoding usage policies still apply.
- Client-side import is fast and private to the current browser, but cannot support shared operations or auditability.
- The 12 km coverage circles make early data visible but are deliberately labeled approximate and must be removed once approved polygons exist.
- One dashboard route minimizes navigation during the prototype; administration may become a separate route when permissions and audit workflows are added.
