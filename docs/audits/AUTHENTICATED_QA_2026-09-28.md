# Authenticated QA checkpoint — 2026-09-28

## Scope

Verify existing administrator and salesperson sign-in → authenticated APIs → live-data rendering on the local app after migration `0008`. This is a read-only business-data smoke test, not complete role or production readiness. The local app uses the same Neon application database as production; the agent changed no dealers, assignments, accounts, passwords, products, orders, routes, or visits for testing. Normal sign-in creates an authentication session.

Started the existing `npm run dev` workflow on port 5740. `ports sync` and `ports check` confirmed that this listener is registered and running. Browser interaction used the available desktop browser controls for the verification skills' page/content/error checklist.

## Verified boundaries

| Check | Evidence |
| --- | --- |
| Existing administrator authentication | `POST /api/session/login` returned 200; browser reached `/` and displayed Amit / Admin. No new account or password reset. |
| Session and workspace reads | `/api/session` and `/api/workspace` returned 200; Map displayed 12 salespeople, 2,064 dealers and 426 PIN codes. |
| Directory reads | `/api/dealers/directory` returned 200 and rendered the first 100 rows with the authoritative 2,064 total. Search for one observed dealer returned one result. |
| Team | Loaded all 12 salespeople and identified one active login, `chander`, linked to Chandar. The other 11 have no login yet. No setup, reset, deletion, or reassignment actions were submitted. |
| Administrator Activity | `/api/routes` returned 200. Empty team-route state rendered correctly with 12 people and no saved routes. The administrator view showed oversight, not Optimize/Save/visit controls. Existing saved-route detail behavior remains untested because no plans exist. |
| Commerce | `/api/workspace/commerce` and `/api/commerce/orders` returned 200. Dashboard and Accounts rendered: zero products, retailers and orders; the two existing accounts are administrator and salesperson. |
| Mobile | At 390×844, the header displayed `@amit` and Admin; the scrollable tab row and dealer cards rendered. The filter dialog opened and closed with Escape. The edit dialog loaded existing dealer fields and was canceled without saving. This is not a comprehensive accessibility/focus-trap check. |
| Existing salesperson authentication | After the user corrected the supplied credential, `POST /api/session/login` returned 200. `/api/session` and `/api/workspace` returned 200; the browser displayed the salesperson identity and only Map, Dealers and Routes. No credential reset was performed by the agent. |
| Salesperson-scoped UI | Map showed 145 assigned dealers and 45 PIN codes, matching the earlier Team assignment count. Directory returned 200 and displayed the authoritative 145 total; no Add, Import, Edit, Delete, cross-team salesperson selector or data-quality filter was present. |
| Cross-owner dealer read | A direct navigation to `/api/dealers/345`, a dealer previously observed under Kiran, reached the server and returned 404 in 519 ms under the salesperson session. Chrome blocked rendering the error response with `ERR_BLOCKED_BY_CLIENT`; the denial is evidenced by the server log, not a rendered JSON body. Broader API authorization coverage was not exercised. |
| Salesperson route prerequisites | `/api/routes` returned 200. Today showed no saved route; Plan visits fixed the planning identity to CHANDAR and offered a seven-day suggestion. Once loading completed, the configuration badge read “Google road optimization ready.” Selecting one PIN-level dealer displayed an unchecked explicit approximate-route opt-in and disabled Optimize while prerequisites were incomplete. No Save control appeared before a preview. Selection was cleared; no optimization call, save or visit update was submitted. The badge alone does not prove Google routing or address suggestions work end-to-end. |
| Salesperson mobile | At 390×844, `@chander`, Salesperson and the three authorized tabs were visible; Today and its empty route state rendered. The viewport override was reset afterward. |

The mobile screenshot is a local evidence artifact at `/tmp/dealer-role-qa-20260928/admin-mobile.png`; it is not published and may disappear when temporary files are cleaned. The temporary viewport override was reset.

Salesperson mobile evidence is `/tmp/dealer-role-qa-20260928/salesperson-mobile.png`, also a temporary, unpublished artifact.

## Warnings and gates

- Browser console logs contained `Access to storage is not allowed from this context` on sign-in and the root page. The observed admin flow continued to work and the server requests above succeeded. The source of these warnings was not established; do not report a clean console or certify offline storage based on this run.
- The first supplied salesperson password returned 401. The user subsequently supplied a corrected credential and sign-in succeeded; the earlier login blocker is resolved. Neither password value is retained in this report or project files. Route optimization/review/save, visit completion, offline replay and comprehensive authorization-negative cases remain unverified. The historical failure screenshot is `/tmp/dealer-role-qa-20260928/salesperson-login.png`.
- There is no retailer account or catalog in the existing database. Checkout/reorder and retailer isolation need approved representative fixtures in an isolated environment; do not create business records in the shared live database just to complete a smoke test.
- Request durations in the development terminal were roughly 0.2–1.2 seconds for the observed authenticated reads; the successful salesperson login took 2.6 seconds. These include development/compiler overhead and are not a measured production performance benchmark.
- At this initial checkpoint no push or deployment was performed. No application code changed. Subsequent authorized push, Google route preview, isolated persistence checks and a confirmed mobile-planner clipping failure are recorded in [the post-push checks](POST_PUSH_CHECKS_2026-09-28.md). Those checks supersede the earlier untested-preview status above but do not clear the missing browser write journeys.
