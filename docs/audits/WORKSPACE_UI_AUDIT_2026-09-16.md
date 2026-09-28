# Workspace UI Audit — 2026-09-16

## Scope and evidence

This pass covers the shared Map and Dealers views, the administrator Team view, and the salesperson Routes view. The administrator flows were inspected in the running local app at desktop and compact widths. Salesperson-only behavior was audited from the role-conditioned implementation and route contracts because an existing salesperson password is intentionally not retrievable and no credential was reset for this review.

## Findings and fixes

| Area | Before | After | Why |
| --- | --- | --- | --- |
| Map ownership | Administrator dealer rows used color as the primary ownership signal. | Each administrator row names the salesperson; the map caption is role-aware. | Ownership must remain understandable without color perception. |
| Role framing | Header metrics and dealer detail repeated administrator-oriented salesperson information for everyone. | Salespeople see `My dealers`, their own coverage label, and no redundant owner field. | The signed-in role should define the information hierarchy. |
| Dealers | The directory opened directly into controls and records. | A concise role-aware explanation states what can be managed or reviewed. | Users can understand the purpose before acting. |
| Team scale | All salespeople were shown in one unfiltered list. | Search by name/username and access-status filters support larger teams. | The view remains usable as headcount grows. |
| Route limits | Selecting `All` could exceed the server's 25-stop route contract. | Initial selection, bulk selection, and individual selection all enforce 25 stops with an inline limit message. | Invalid plans are prevented before the network request. |
| Saved routes | The unsaved preview had an embedded map, but a saved salesperson route did not. | Saved routes retain the same map context alongside metrics and stop progress. | Review, navigation, and field execution now share one spatial reference. |
| Interaction targets | Several filter, close, route-history, and visit controls were below the 44 px mobile target. | Primary/touch controls use a minimum 44 px target. | Reduces missed taps and aligns with the app's accessibility rules. |
| Mobile tab bar | The Dealers tab repeated the result count in a badge, crowding the four-tab administrator navigation. | The tab is label-only; the live result count remains in the Dealers filter panel. | Keeps navigation stable at narrow widths and places counts where they are actionable. |
| Tab semantics | Some workspace panels were visually switched without complete tab-panel relationships. | Map, Dealers, Routes/Activity, and Team panels are labelled tab panels. | Improves navigation context for assistive technology. |

## Flow health

1. Administrator Map — healthy after ownership-label and role-copy fixes.
2. Administrator Dealers — healthy for search, filtering, add/import, edit, delete, and map focus.
3. Administrator Activity — healthy for read-only date/person/status filtering, progress review, and route detail.
4. Administrator Team — healthy after searchable access/dealer assignment controls.
5. Salesperson Map — structurally healthy and scoped to the signed-in salesperson.
6. Salesperson Dealers — structurally healthy and read-only for assigned dealer details.
7. Salesperson Routes — healthy at the UI/contract level after the 25-stop guard and saved-route map fix; a fresh authenticated salesperson browser run remains a release gate.

## Remaining validation

- Complete a keyboard and screen-reader pass across dialogs, popovers, and map alternatives.
- Run one fresh exact-address route end to end with a real salesperson session without modifying production records.
- Recheck compact widths with a larger team and a salesperson assigned more than 25 dealers.
