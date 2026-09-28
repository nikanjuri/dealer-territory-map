# Performance implementation verification

## 2026-09-28 migration follow-up

- Migration `0008` is now applied to the existing linked Neon database, shared by development and production. An application-schema backup was restored and migration-tested against disposable Postgres 18 before live application; all 18 application-table row counts and data digests were unchanged afterward. The missing `0006`/`0007` journal entries were repaired only after their schema matched the checked-in migrations. A second `npm run db:migrate` made no further changes. See [the migration record](audits/DATABASE_MIGRATION_2026-09-28.md).
- This removes the schema gate, not the authenticated UI/role or measured-performance gates. No account changes, push, or deployment were performed.

## 2026-09-26 follow-up

- The route workspace now fetches stops for up to 200 displayed plans in one batch rather than one query per plan. Workspace and directory responses expose `Server-Timing`, and the account shell begins loading in parallel with the larger workspace payload. These are structural changes, not measured latency claims.
- The full local verification passes with 101 tests, ESLint, TypeScript, and the production build. The atomic stop update was additionally exercised twice against a disposable Postgres 17 database: one visit was recorded, the plan became completed, and next due was set once. The route-save and retailer-order CTEs were parsed and planned by a second disposable Postgres 17 instance with migration `0008` present. These instances were removed afterward; hosted data was not touched.
- At this checkpoint, the local server ran on port 5740 and the sign-in screen was checked at a 390 px mobile viewport. The browser's saved test login was rejected, so authenticated map/routes/checkout rendering, real response timings, and weak-network replay remained unverified. Migration `0008` was generated but not yet applied at that time; see the 2026-09-28 follow-up above.


Date: 2026-09-25. Scope: local code and read-only checks only. The existing worktree was already heavily modified; no push, deployment, migration, credential change, or hosted-data write was made.

## Implemented

- Bootstrap requests share only concurrent fetches. Settled successes and failures do not stay in a process-wide promise cache; sign-in and sign-out invalidate in-flight entries. Workspace, Commerce, Shop, and pending-review failures expose retry controls without clearing usable data. Review fetch failure keeps the known pending count. Commerce polling ignores stale responses after a local order update and stops while the tab or document is inactive.
- Both map providers use one public PIN-boundary loader. It fetches missing PINs in batches of 30 with two concurrent requests and a 12-second timeout, retains successful results in a versioned, bounded in-memory cache, distinguishes actual missing PINs from failed batches, and offers retry while preserving loaded coverage. Google coverage features and dealer markers reconcile by ID instead of being recreated on selection. The initial viewport fits all dealer coordinates when available.
- Map provider effects are gated while the Map tab is hidden; map instances and viewport stay mounted. Route oversight polling also observes document visibility. All filtered map points are supplied independently of the sidebar's 50-row reveal limit. The sidebar sorts once per changed filtered set and resets its limit on filter actions.
- The workspace bootstrap returns explicit dealer summaries with the fields needed for maps, filters, counts, and lists. Admin editing fetches a full current record through a scoped detail route. The new `/api/dealers/directory` query applies server-side filters and `LIMIT/OFFSET`, returns an authoritative total, and orders by dealer name, area, PIN, then ID. The existing complete `/api/dealers` contract remains available for consumers that require it. Server authorization guards scope summary, directory, and detail reads to the signed-in role and salesperson.
- Map clustering was removed at the user's request. Google Maps and MapLibre show individual salesperson-colored dealer pins with their earlier click and selection behavior.

## Evidence

- `npm run verify` passed: 91 tests, ESLint, TypeScript, and an optimized Next.js production build. Focused tests cover concurrent bootstrap deduplication, invalidation across identity changes, partial boundary failure followed by retry, and filter/page reset identity. `git diff --check` passed.
- The existing local server remained listening on port 5740. An unauthenticated request to each new read route (`/api/dealers/directory?page=1` and `/api/dealers/1`) returned HTTP 401. Chrome opened the local app and redirected to the sign-in form.
- Checked-in public geometry is 82,048 bytes for `pincode-boundaries.geojson` and 288,455 bytes for `region-boundaries.geojson`. These are file sizes, not network timings or evidence of private workspace payload size.

## Limits and follow-up

- No authenticated session or disposable representative large dataset was available for this run. Initial workspace payload bytes and timings, Directory SQL results, desktop/mobile map interactions, PIN coverage, editing, tab-state preservation, and live role journeys remain unverified. A successful local build does not establish production behavior.
- The new server-side directory query and detailed dealer fetch need authenticated administrator and salesperson QA before rollout. Check filter totals/options, 100-row page boundaries, edit freshness, role isolation, pending-review counts, and route/Team candidate completeness.
- MapLibre's GeoJSON source still receives a full coverage `setData` when a new boundary batch arrives; the loader reduces duplicate requests and retains partial results, but a large authenticated dataset is needed to judge render cost.
- The canceled clustering target has no performance claim. Individual pins may still be costly at regional zoom with a very large dealer dataset; any future marker strategy should be decided from measurements and the user's preferred map presentation.
