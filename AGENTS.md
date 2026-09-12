# Agent Instructions

## Authority

- Read `idea.md`, `plan.md`, `design.md`, and `README.md` before substantial changes.
- `idea.md` owns product intent, `plan.md` owns status, and `design.md` owns workflow, architecture, and visual decisions.
- Treat package scripts and `.project.json` as execution truth; keep docs and the port registry synchronized with behavior.
- Scope is Telangana and Andhra Pradesh, not Hyderabad alone.

## Setup and Commands

```bash
npm run install:ci
npm run dev
npm run lint
npm run typecheck
npm run build
npm run verify
```

- Local web URL: `http://localhost:5740`
- Package manager and lockfile authority: npm and `package-lock.json`
- Node.js requirement: `>=22.13.0`

## Product and Data Rules

- Do not present dealer points or 12 km PIN-centroid circles as official salesperson territories.
- Territory fill requires approved polygon geometry and an explicit assignment rule.
- Keep unassigned areas grey only when the geographic boundary set is complete.
- Preserve source values and surface PIN/area conflicts for human review; do not silently correct them.
- Keep salesperson colors stable and provide textual ownership labels because color alone is insufficient.
- The hosted app is public; use only sample or approved non-sensitive dealer and employee assignment data until authentication exists.
- Exact addresses are required before implementing route optimization.

## Implementation Conventions

- Use TypeScript and existing React/local component patterns.
- Reuse the existing design tokens and primitives before adding dependencies.
- Keep the dealer list/detail view equivalent to essential map information for accessibility.
- Respect reduced motion for map flights and UI transitions.
- Add tests alongside territory assignment, import normalization, or persistence logic.
- Record substantially adapted external UI in `docs/component-sources.md`.

## Verification

- Run `npm run verify` after code changes.
- For map/UI changes, inspect real desktop and mobile renders and exercise keyboard/focus/error states.
- Run `python3 /Users/nikhilanjuri/.codex/skills/dev-project-bootstrap/scripts/verify_project.py /Users/nikhilanjuri/GitHub/dealer-territory-map` after bootstrap/config changes.
- Run `ports sync /Users/nikhilanjuri/GitHub` and `ports check` after listener changes.
- Local success does not establish hosted or production readiness.

## Remote and Risk Boundaries

- Do not provision a database, modify hosted data, change access policy, publish a deployment, or push to a remote without explicit user intent.
- Vercel is the selected provider; keep `.vercel/` local and never commit provider credentials or linkage state.
- Never commit credentials, `.env*` secrets, local provider state, or browser-derived authentication data.
- Avoid force-pushes, destructive resets, and silent territory reassignment.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
