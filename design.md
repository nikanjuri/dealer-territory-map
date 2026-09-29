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

1. Review coverage: open the map, compare salesperson colors, and identify shared PINs with dealers assigned to multiple salespeople.
2. Find a dealer: search by dealer, full address, area, PIN, or salesperson; narrow the Map by state, exact PIN code, or area; administrators can additionally narrow the Dealers directory by data quality; select a result; focus the map; read details and warnings.
3. Filter ownership: use the always-searchable multi-select to find, check, or uncheck salespeople without losing spatial context; all salespeople are visible by default and the combined filters persist across Map and Dealers.
4. Add one dealer: enter salesperson, state, dealer, PIN, area, and an optional full address; validate; geocode; confirm the map result.
5. Import dealers: upload up to 500 structured rows or 50 OCR rows, normalize the agreed columns including state and optional full address per row, review extracted records in pages, locate addresses or new PINs, skip workspace-wide dealer/PIN duplicates, and direct the administrator to reassign the existing record.
6. Edit dealer records: update salesperson, dealer, PIN, area, state, or full address from the directory; re-geocode location changes and retain all other record context in the shared store.
7. Resolve data issues: automatically compare PIN, state, and area against the postal directory; surface exceptions with official suggestions; allow an explicit manual verification without silently changing business data.
8. Plan a day: as a salesperson, select a date, choose assigned due dealers, set the work window and start/end, optimize the sequence, review it on the map, and publish the plan.
9. Record visits: as the assigned salesperson, explicitly mark arrival/completion, retain notes and timestamps, and update each dealer's next-due status.
10. Administer the team: sign in with a username, set up a salesperson's username and initial password from their row, reset an existing login's password without exposing the old one, link that account to one salesperson record, and assign or reassign multiple dealers from the salesperson row.
11. Review field activity: as an administrator, filter by date, salesperson, or route state; see attention-ranked team progress, stale or missing routes, and each salesperson's saved route map and stops without planning or updating visits for them.
12. Order as a dealer: as a retailer linked to one dealer record, browse active products and variants, build an MOQ-aware cart, place an order, and review that dealer's order history.
13. Operate commerce: as operations staff or an administrator, maintain products and variants, review all dealer orders, and advance fulfillment status.
14. Manage commerce access: as an administrator, create retailer or operations-staff credentials and optionally add operations access to an existing salesperson account.

The salesperson Routes view opens on today's work. A seven-day suggestion groups due dealers by PIN and capacity, but is not itself a road route: the salesperson chooses a day, checks Google Routes' stop order and timing, then saves. Visit actions can queue on the current device during a network failure; queued actions are visibly labelled and can be retried or explicitly discarded after a conflict. Administrators remain read-only.

Commerce account totals and access-management copy appear only for administrators. Operations staff see catalog/order actions without an invented zero retailer count when account data is withheld. Reorder computes available cart additions and its confirmation together before scheduling the cart update.

Sign-out stays visibly busy until Auth responds, prevents duplicate submissions, and preserves the workspace on a failed response. Dealer editing is confined to the active Dealers workspace; late detail responses cannot open an editor after navigation or supersede a newer edit request.

For new or changed dealer addresses, choosing a Google Places suggestion records its Place ID and candidate coordinates. The administrator must open the pin and confirm it; PIN, state, and available polygon checks must agree. If only free text is available, the administrator can retain it with an explicitly approximate PIN pin instead of implying address-level accuracy. Existing legacy/imported address points are not retroactively certified by this flow.

Map and Dealers filters may be copied as a URL, but the URL contains filter values only and does not grant data access. Retailer order and route-save retries use stable request keys so a lost response does not create a second record. The key-bearing schema migration and authenticated role QA are rollout gates.

## Screens and Routes

- `/`: the single responsive, role-aware application surface. Field roles receive Map, Dealers, salesperson Routes or administrator Activity, and administrator-only Team views; operations roles receive Commerce; linked retailers receive Shop. Additive roles expose all applicable tabs in the same header and workspace switch.
- `/auth/sign-in`: username and password sign-in. Public self-registration is disabled; administrators create salesperson accounts.
- `/shop` and `/commerce`: compatibility entry points that validate the session and redirect to the corresponding role-authorized tab on `/`.
- Empty state: keep the basemap visible, clear dealer-dependent state highlights when no dealers match, and offer filter reset or add/import actions.
- Loading state: show progress while the configured map provider loads, shared dealers synchronize, or PIN geocoding/import is running.
- Error state: preserve entered values and provide a concise correction for invalid PINs, unreadable files, missing columns, OCR uncertainty, geocoding failures, and import limits.

## Information Architecture

- Header: product identity, state scope, signed-in identity, and high-level record metrics. Compact screens show the username and role; larger screens show the display name and role.
- Workspace switch: one horizontally scrollable, role-aware tab row for Map, Dealers, Routes/Activity, Team, Commerce, and Shop. Only authorized tabs appear, and switching domains does not introduce a second application shell.
- Sidebar: shared search plus searchable PIN/area and state filters, filtered dealer results, and selected-dealer details. The cross-team salesperson filter appears only for administrators; salesperson accounts are already scoped to their own assignment. Data quality is deliberately absent because it is a directory-maintenance concern, not a spatial-coverage filter.
- Dealer directory: the shared role-aware filter set with its current visible-dealer count, add/import actions for administrators, full record columns on desktop, compact cards on mobile, data-quality status, and direct map focus. Administrators receive the data-quality filter here; salespeople see “My dealers” without data-quality or redundant salesperson controls and columns.
- Team: administrator-only salesperson directory, per-row login setup/password reset/deletion, account status, assigned-dealer counts, and a searchable bulk-assignment dialog. Existing salesperson records without logins are clearly labelled. Deleting a login removes the shared account and any additive Commerce access, but preserves the salesperson record, dealer ownership, route history, and visit history so a replacement login can be created later. Administrator identities cannot be deleted here.
- Route operations: salesperson-only daily planning, optimization, Google Maps handoff, and visit updates, scoped to that salesperson's assigned dealers.
- Activity oversight: administrator-only read-only control tower with date, salesperson, and state filters; compact KPIs; attention-ranked salesperson progress; missing, delayed, and skipped-route exceptions; an embedded saved-route map and ordered stops; automatic one-minute refresh plus visible manual refresh recency. It has no planning or visit-state controls and no salesperson-actionable optimization warnings.
- Map: state context, PIN-boundary coverage geometry, dealer pins, navigation, attribution, and a compact disclosure for coverage meaning and boundary provenance.
- On compact screens, the map opens first and a persistent Map/Dealers switch exposes the searchable list without forcing the primary map below the fold.

## Colors

- Canvas: warm parchment `#f7f3ea`; raised surfaces: `#ffffff` / `#fffcf7`; primary text: `#252a30`.
- Ink-indigo structure: `#252a44`; accessible terracotta action/navigation: `#b65a38`; denim focus: `#356a9a`.
- Muted text: `#746f6a`; border: `#ded7cc`; state geography remains a neutral grey, independent of the application brand palette. Shared PINs use slate with an amber outline.
- Terracotta is reserved for selected navigation and meaningful actions. Ink-indigo carries the header, route structure, and high-contrast operational states; do not reintroduce lime or dark forest green as brand colors.
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
- Mobile: keep the app within the viewport, show either the map or dealer panel at a time, and present selected-dealer details as a dismissible map-bottom card.
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

- Google Maps renderer with required attribution, plus a MapLibre/OpenStreetMap resilience fallback.
- Workspace switch, search input, searchable salesperson multi-select, searchable PIN/area selectors, state/data-quality selects, Team name/access filters, reset action, responsive dealer table/cards, dealer result row, metric badge, selected-dealer panel, alert state, dialog, input, button, toast, and responsive shell.
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
- Dealer deletion requires explicit confirmation, names the affected dealer, and explains the map impact before removal.
- Selection and ownership need text/shape support in addition to color.
- Maintain WCAG AA contrast for UI text and controls; map content must have an equivalent list/detail representation.
- Dialog focus must enter, remain trapped, and return to the trigger.
- Minimum touch target is 44 by 44 px for primary mobile actions.
- Map loading, import progress, success, and error feedback should be announced to assistive technology.

## Responsive Behavior

- Compact mobile: map-first viewport with a 44 px minimum Map/Dealers switch, a compact map-filter dialog, dealer-management actions within the Dealers view, and an independently scrollable dealer-card directory.
- Tablet: balanced split or stacked layout depending on available width; no clipped filters.
- Desktop/wide: sidebar and map share the viewport; map is the dominant surface.
- Never hide state scope, attribution, data warnings, or the distinction between approximate and approved territories.

## Data Model

Current `Dealer` fields: `id`, `salesperson`, `dealer`, `pincode`, `area`, optional `address`, `state`, `latitude`, `longitude`, optional `locationPrecision`/`geocodedAddress`, review details, and postal-validation status/source/timestamp/dataset metadata.

The shared model separates:

- dealer records and exact/approximate locations;
- salesperson identities and display colors;
- territory geometry and geographic unit type;
- dated territory assignments with approval status;
- import batches, validation issues, and audit events.
- recurring visit rules, daily route plans/stops, and completed visit events.
- app users, roles, usernames, and one-to-one salesperson account links.
- additive user-role grants, retailer-to-dealer account links, typed categories, products, variants, authenticated product images, orders, immutable order-item price snapshots, and staged legacy retailer identities.

Each dealer name/PIN identity is unique across the workspace and has exactly one salesperson owner. The app also catches the same normalized dealer name at the same full address when its PIN differs. Assignment changes update that existing row; they never create a second copy for another salesperson.

PIN-code geometry is authoritative for area coloring in the current model. Dealer-point proximity is never used as ownership.

## Architecture and Integrations

- UI: native Next.js App Router with React/TypeScript, Tailwind CSS, and local shadcn-derived components.
- Mapping: Google Maps JavaScript API is the selected production renderer. Dealer pins and route-preview stops use accessible Advanced Markers when a project-owned JavaScript map ID is configured; local development may use Google's `DEMO_MAP_ID`, while production retains the legacy-marker fallback rather than shipping the demo ID. Both renderers highlight states with more than 50 supplied, authenticated and filtered dealer markers as neutral context, never salesperson territory. An explicitly selected state with matching dealers bypasses the threshold; empty results do not create a highlight. Counts use dealer records, not distinct PIN codes or sidebar pagination. Dealer markers and salesperson-colored PIN polygons remain visible regardless of state-highlight eligibility. State geometry is loaded from per-state static GeoJSON assets only when needed, cached across provider/filter changes, keyed by stable ISO identifiers, and removed immediately when out of scope. Map readiness uses a revision so rebuilt maps recreate markers and layers after Fast Refresh. All 36 states/union territories are supported; the original AP/Telangana audit artifact is preserved separately. Initial PIN boundaries are local, with on-demand Esri India boundary queries for other PINs. MapLibre/OpenStreetMap is retained as a resilience fallback.
- Import: SheetJS parses the first worksheet from `.xlsx`, `.xls`, or `.csv`; JSON accepts a top-level array or `dealers`/`rows` array; Tesseract.js and PDF.js provide client-side OCR for images and PDFs. All sources enter an editable review step before persistence.
- PIN resilience: publish and persist validated primary geometry before the backup lookup, and attempt the backup even if the primary fails. A versioned IndexedDB cache stores only public postal polygons for 30 days, capped at 4,000 PINs; blocked, timed-out or quota-limited storage degrades to memory/network loading. Never cache dealer records or ownership. The local seed is optional when cached/on-demand geometry is available. Missing polygons remain retryable. A filter-scoped warning counts unavailable PINs and preserves pins, with a keyboard-operable, disabled-while-retrying action. Neither unavailable geometry nor cache retention confers geographic verification or permission to save approximate data. Server geographic validation remains fail-closed for unresolved requests while retaining successful real polygons in its in-process cache.
- Geocoding: Nominatim uses the full address plus area/PIN/state when an address is supplied; otherwise it uses the six-digit PIN. Address results that explicitly resolve to a different PIN are rejected. Production bulk usage needs a compliant provider, caching, and a pin-review workflow.
- Postal validation: a checked-in Telangana/Andhra Pradesh subset of the Department of Posts directory is loaded on demand. Exact normalized office/block matches verify automatically; fuzzy or absent area-name matches require review; unknown PIN and wrong-state combinations are rejected.
- Persistence: Neon Postgres through authenticated Next.js route handlers and Drizzle. Authenticated operational data is never restored from a browser cache. Commerce categories, products, variants, image bytes, retailer links, orders, line-item price snapshots, and legacy reconciliation rows share this authority; Supabase is not a runtime dependency.
- Authentication: Neon Auth handles password storage and sessions; the app exposes usernames and maps them to internal non-user-facing auth identifiers. Public sign-up is blocked. App roles are stored in `app_users`: administrators can manage team/dealer data and read team route activity, while route planning and visit writes require a salesperson account and are scoped to the linked `salesperson_id`.
- Commerce authorization: retailer accounts are linked to an existing dealer and can read or create only that dealer's orders. Operations staff can manage catalog and fulfillment without receiving dealer-assignment authority. Role grants are additive, allowing one salesperson account to also process orders. Checkout accepts variant IDs and quantities only; current catalog prices and totals are resolved server-side and the order plus items are inserted atomically. Administrators create username/password accounts in Neon Auth; the former phone-OTP identity model is not retained.
- Commerce account deletion: administrators may permanently remove retailer and commerce-only operations accounts after an explicit confirmation. Active sessions and credentials are revoked, retailer and role links are removed, and historical orders retain their dealer and retailer snapshots while dropping the deleted credential link. Administrator, salesperson, and dual-role Team identities are protected from this Commerce action.
- Commerce media and events: product uploads are capped and stored as authenticated Neon records so the cutover does not depend on Supabase Storage. New-order awareness uses a 30-second authenticated refresh rather than Supabase Realtime. Optional Twilio WhatsApp messages run after the response with server-only credentials and never determine whether an order is committed.
- Legacy import: the one-time importer is dry-run-first, idempotent, preserves source IDs/timestamps/order snapshots, and fails on missing references or image objects. Profiles and pending registrations enter a reconciliation table; only exact phone equality may attach an already-created retailer account, while dealer selection and password creation remain explicit administrator actions.
- Credential management: an administrator chooses a username and initial password when establishing a salesperson login. Passwords are never returned by the app; a reset replaces the password and revokes that salesperson's existing sessions.
- Routing: the Routes workspace and authenticated route APIs use the existing visit-rule, route-plan, route-stop, and visit tables. The signed-in salesperson is the fixed planner identity; the planner never presents a salesperson selector. Start location defaults to the most recent saved route when available, while explicit device geolocation and manual address/coordinate entry remain available. Device coordinates are sent to Google as coordinates rather than an address string. Google Routes `ComputeRoutes` is the road-aware provider when `GOOGLE_ROUTES_API_KEY` is configured. Future plans use the selected India workday start as the traffic-aware departure time. Driving plus per-dealer service duration must fit before the selected finish time or the request is rejected. Optimization returns a signed, short-lived preview with a map, timing, and ordered stops; it does not persist data. The salesperson can adjust or discard that preview, and only an explicit Save route action creates the plan and stops atomically after server-side ownership and schedule checks are repeated. Google Maps handoff preserves the optimized order and splits long saved plans into ordered parts capped at three waypoint parameters for mobile-browser compatibility. Until Google routing is available, an explicitly labelled geometry preview may be saved for planning but is never presented as field-ready navigation. User-facing fallback copy remains actionable and does not expose internal environment-variable names; obsolete configuration warnings disappear once road optimization is available. Approximate PIN points require an explicit opt-in.
- Agent interface: browser WebMCP exposes constrained list/add dealer tools where supported.
- Hosting: Vercel serves the authenticated app and injects Neon variables. Production readiness requires separate admin and salesperson browser checks proving that a salesperson cannot read or mutate another salesperson's records.

## Do's and Don'ts

- Do preserve Telangana and Andhra Pradesh support while allowing neutral state context wherever the authenticated dealer scope contains records.
- Do not label the grey state backdrop as unassigned. Label slate, amber-outlined PINs as shared when their dealers have multiple salespeople.
- Do expose source-data warnings and assignment conflicts.
- Do keep data entry reversible and validate before persistence.
- Don't imply that PIN centroids are boundaries.
- Don't silently assign a whole PIN when source rows conflict.
- Don't treat a fuzzy area-name match as verified or silently replace a colloquial area name with a postal-office name.
- Don't silently fall back to a PIN-centre point when a supplied full address fails to resolve.
- Don't load sensitive operational dealer or employee data into the public prototype before authentication exists.
- Don't add animation runtimes, mapping providers, databases, or design systems without a concrete need and documented decision.

## Tradeoffs and Decisions

- Google Maps aligns the map, Places, Routes, and Route Optimization stack, but introduces billing, quota, key-restriction, and Google content-retention requirements.
- MapLibre remains a temporary resilience fallback; it is not used to display Google Route Optimization content.
- Client-side parsing keeps raw imports local until review; approved rows are then written to authenticated Neon storage.
- The Supabase-to-Neon cutover keeps legacy source identifiers alongside target records for count and record reconciliation. The old repository and a recoverable export remain deletion-gated until parity checks pass.
- PIN polygons provide meaningful area coverage now, while remaining replaceable if the sales team later adopts districts, mandals, or custom territories.
- One dashboard route with role-authorized field, commerce, and retailer tabs preserves context and identity while keeping access control visible. Legacy `/commerce` and `/shop` links redirect into this canonical workspace rather than maintaining duplicate shells.
- The shared shell bootstraps identity and field records once, then code-splits and loads Routes, Team, Commerce, Shop, and the review queue only when first opened. Postal-reference data remains on demand for validation actions, while the dealer directory pages large result sets. The Map sidebar starts with 50 alphabetically ordered matches and reveals 50 more per explicit action, resetting to 50 when its filters change.
- Commerce uses the same content width, page-heading hierarchy, compact 44 px controls, and restrained card treatment as the field workspaces. Its Dashboard, Orders, Products, and Accounts switch is a secondary underline navigation rather than a second pill-shaped application tab bar.
- Every selection control uses one dropdown visual contract: 44 px triggers, consistent radius/border/focus treatment, an anchored compact menu, 40 px option rows, and the same selected state. Searchable and multi-select filters may add a search field, status summary, or bulk actions without changing that shared shell and density.
- Entity selectors that can grow with workspace data, including retailer-to-dealer assignment, use the shared searchable combobox; fixed, short enums remain native Select menus. Creation workflows open in focused dialogs instead of permanently occupying list space, and browser credential autofill is explicitly scoped away from administrator provisioning fields.
- Date fields use the same 44 px trigger contract and open the shared keyboard-accessible calendar popover; do not fall back to browser-native date controls in role-specific workspaces.
- Header metrics and map coverage labels are role-aware: administrators see team totals and textual dealer ownership, while salespeople see only their own dealer scope.
- The salesperson planner shows a fixed identity label, not an identity dropdown. Route-panel titles reflect lifecycle state: Route plan, Review route, Today's route, or Saved route; historical plans live under Route history.
- The planner enforces the 25-stop route contract during initial, bulk, and individual selection, and saved routes retain an embedded map rather than dropping back to a text-only stop list.
- Route start and optional end fields use Google Places suggestions restricted to India, while retaining device-location and manual-coordinate fallbacks.
- Add and import actions live in the Dealers view so the global header stays focused on identity and summary metrics.
- Dealer result counts live inside the Dealers filter panel, not in the workspace tab. The role-aware tab row scrolls horizontally on narrow screens when an administrator or dual-role user has more destinations than fit.
- Compact workspace navigation exposes previous/next overflow controls, keeps the selected destination visible, and follows the roving-focus ARIA tabs keyboard pattern. Mobile Dealers keeps search in the page and moves advanced filters into an optional dialog so results enter the first viewport.
- Operational helper text uses the accessible `#6f6a65` floor on white and parchment surfaces. Initial-based salesperson avatars choose light or dark foreground text from the actual background luminance instead of assuming white.
- Administrators can edit or delete dealer records from the Dealers view. Deletion is confirmed, offers a short-lived undo action, and immediately updates pins, coverage, filters, and selection.
- Administrators can bulk-assign dealers from a salesperson’s Team row. The dialog names each dealer’s current owner before a confirmed reassignment and sends one authenticated update request.
- The Team view supports name/username search plus access-status and unassigned-dealer filters so account administration remains usable as the team grows.
- Matching dealer/PIN imports are rejected across all salespeople. The result identifies the current owner and points the administrator to Dealers or Team for an explicit reassignment.
