# Performance execution plan

Status: implemented locally except map clustering, which the user canceled in favor of individual dealer pins. Authenticated interaction and large-dataset timing remain unverified; see `docs/performance-verification.md`.

## Outcome and scope

Make initial loading, map interaction, filtering, and workspace switching faster with the full dealer dataset. Keep the existing visual system, permissions, territory semantics, and workflows. This is local implementation and verification only: no push, deployment, production data changes, or new infrastructure.

Preserve all existing worktree changes. Read AGENTS.md, idea.md, plan.md, design.md, README.md, and applicable installed Next.js documentation before implementation. Use the React performance skill. Avoid unrelated refactors and new UI libraries.

## Baseline

- Record current request sizes/counts and relevant render/loading behavior with a representative large dataset. Distinguish development compilation from production runtime performance.
- Measure workspace bootstrap, first usable map, filtering, reopening a tab, and geometry loading separately. A fast auth redirect is not a workspace benchmark.
- Capture repeatable before/after evidence where possible; otherwise report structural improvements without invented speed claims.
- Never log credentials, private dealer payloads, or session tokens. Do not bypass authentication for testing.

## Phase 1: Request correctness and recovery

The bootstrap helpers currently retain fulfilled promises indefinitely. Replace this with deliberate in-flight deduplication or an explicitly session-scoped, bounded freshness policy. Prevent rejected/stale requests from overwriting fresher data.

- Ensure login, logout, identity changes, and relevant mutations cannot reuse another session's data or indefinitely stale workspace state.
- Provide explicit loading, error, and retry states for bootstrap, commerce, shop, and pending review loading. Preserve already usable records and unsaved work on background failures.
- A failed review fetch must not turn a known pending count into zero or permanently prevent retries.
- Avoid making requests on every render or duplicating requests on ordinary tab changes.

Acceptance: retries recover; failed requests do not erase good data; concurrent calls deduplicate appropriately; no cross-session data reuse; mutation results remain current.

## Phase 2: Cluster map points (canceled by user)

The user preferred the earlier individual salesperson-colored pins. Keep every filtered dealer visible as a separate map point and retain marker reconciliation so unchanged Google markers survive selection and unrelated updates. The clustering implementation and its helper were removed.

- Cluster dealer points at regional zoom; clicking a cluster reveals its dealers through zoom/expansion. Handle several dealers at identical coordinates without making them unreachable.
- Support the configured Google map and the existing MapLibre fallback. Prefer existing capabilities; use a small maintained dependency only if necessary and verify official documentation.
- Preserve an identifiable selected dealer, keyboard-accessible dealer selection, and all matching map points regardless of sidebar pagination.
- Reconcile changed markers instead of rebuilding every marker for selection or unrelated state changes.
- Do not change PIN ownership or coverage colors: single-owner territories stay salesperson-colored; shared ownership retains its current distinct treatment; grey context does not mean dealer review status.

Acceptance: a representative large dataset can be explored without one DOM marker per dealer at regional zoom; cluster expansion and selected dealers work; all filtered dealers remain accessible.

## Phase 3: Shared progressive boundary loading

- Replace duplicate Google/MapLibre fetching with a shared loader/cache for public PIN geometry.
- Use versioned, bounded caching; retain successful geometry across tab/filter changes. If persisted, cache public geometry only, not private dealer/account records.
- Fetch missing PINs in bounded batches with limited concurrency, timeout, cancellation, and retry. Render successful batches incrementally.
- Distinguish missing data from temporary network failure. Do not permanently negative-cache transient errors.
- Keep partial coverage usable with a concise retry/error indicator. Avoid abort/refetch loops caused by each incremental update.
- Avoid rebuilding every existing map feature for one newly loaded batch or a selected dealer. Preserve current viewport; fit all relevant dealer coordinates initially, not only sample boundaries.

Acceptance: repeat visits reuse geometry; partial failures do not hide successful boundaries; retry works; pending requests do not accumulate on filter changes; no repeated viewport snapping.

## Phase 4: Inactive workspaces stay quiet

- Preserve map instances, filters, selection, scroll position, route drafts, and shopping state when switching tabs.
- Gate expensive hidden-tab filtering/rendering, marker/layer reconciliation, polling, and effects using active state. Resume/revalidate deliberately on return.
- Respect document visibility for recurring polling where appropriate. Do not conflate keeping a tab mounted with keeping all its work running.
- Avoid rebuilding the Google map on ordinary tab switches or selection changes.

Acceptance: navigating to Dealers/Team/Commerce stops unnecessary map work; returning preserves position and state; route drafts survive; active views still receive required updates.

## Phase 5: Smaller data loading and real pagination

- Introduce explicit lightweight dealer summary types for map/filter/list needs. Fetch full dealer details on demand for editing and workflows that require them; do not pretend partial objects are complete Dealer records.
- Implement server-side directory pagination and filtering with stable ordering and authoritative totals. Preserve search semantics, role scope, quality filters, and all filter options; never derive global counts/options from only the loaded page.
- Keep the map supplied with all authorized matching coordinates/ownership information, independent of the number of sidebar rows rendered.
- Preserve the requested sidebar behavior: 50 initially, alphabetical stable order, Show 50 more repeatedly, reset on every filter change. Sort once per changed dataset/filter rather than on each expansion. Avoid delimiter-based filter key collisions and restoring an obsolete expanded count when switching filters back.
- Load complete data for Team assignment, route selection, review, or other consumers only when required. Do not silently truncate assignment candidates or route stops.
- Keep pending-import and mapped-dealer review records in one admin workflow and maintain correct aggregate counts.

Acceptance: smaller bootstrap payload; Directory pages operate over the full authorized dataset; search/filter/counts remain correct; edits load complete current details; salesperson and retailer isolation remain enforced server-side.

## Verification and delivery

- Add focused tests for request caching/retry/identity boundaries, stale response races, geometry partial success and retry, stable pagination/filtering, role-scoped data access, and sidebar reset behavior where practical.
- Run npm run verify (tests, lint, TypeScript, production build). Investigate failures without reverting unrelated work.
- Exercise desktop and mobile layouts, keyboard navigation, cluster expansion/colocated dealers, selection, filters, Show more, directory pages/editing, tab state preservation, and recoverable loading failures.
- Use the supported browser tool for real UI checks. If authenticated accounts are unavailable, state that limitation; synthetic fixtures are not proof of authenticated production behavior. Do not guess credentials or mutate live business records to test.
- Check the local server on port 5740 and leave it usable if practical. Follow AGENTS.md port-management rules if restarting it.
- Update plan.md/design.md/README.md only as needed. Record results and limitations in docs/performance-verification.md, including measured evidence and any deferred work.
- Report exactly what is complete, what is unverified, and whether anything remains. Do not describe a passing build as production verification.

## Execution guardrails

Work through phases in dependency order, with short progress checkpoints. Read consumers before changing data shapes. Prefer small shared helpers over a broad rewrite of app/page.tsx. No changes to routing algorithms, geocoding acceptance rules, dealer data, review decisions, auth roles, or visual redesign are needed. If a materially different architecture or paid service is necessary, stop that part and report the choice instead of expanding scope.
