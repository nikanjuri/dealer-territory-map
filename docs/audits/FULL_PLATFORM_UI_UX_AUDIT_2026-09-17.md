# Full Platform UI/UX Audit — 2026-09-17

## Verdict

The platform has a coherent operational shell and a distinctive, appropriate visual system. Map and Activity are the strongest views; the shared dropdown and calendar work is now consistent. The platform is not yet uniformly polished across roles, however. Commerce still feels like a newly attached administration module, mobile navigation hides authorized destinations, and several accessibility details fall below the project's own design contract.

**Overall score: 7.1/10**

- **Visual system:** 8/10
- **Information architecture:** 7/10
- **Responsive behavior:** 6.5/10
- **Interaction clarity:** 7/10
- **Accessibility:** 6.5/10
- **Motion and feedback:** 7/10
- **Role/workflow coherence:** 7/10

No production code was changed during this audit.

## Implementation follow-up

The three-phase target-experience pass was implemented after this baseline audit. The original 7.1/10 score remains the evidence-based pre-change baseline rather than being silently rewritten. The follow-up addresses all five P1 findings and the highest-leverage P2 craft items: compact navigation now has roving keyboard focus and visible overflow controls; helper text and initial avatars use accessible foregrounds; account provisioning has explicit credential autocomplete semantics; mobile Dealers is search-first with advanced filters in a dialog; Commerce has guided dashboard/empty states and focused creation dialogs; product uploads use the shared control language; the dealer account selector is searchable; and shared Button, Switch, Tabs, and Progress motion uses explicit properties with a global reduced-motion policy.

Advanced Marker code now covers both dealer pins and route-preview stops, with accessible titles and click behavior plus a development-only Google demo map ID. The linked Vercel project has no `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` in Production, Preview, or Development, so deployed environments deliberately retain the legacy-marker fallback until a project-owned JavaScript map ID is created and configured. Fully authenticated salesperson and retailer journeys also remain release work because current data has one salesperson login but no retrievable test password, no retailer account, and no active products; completing those journeys requires deliberate representative credentials and catalog data.

**Post-change administrator-surface score: 9.0/10.** This follow-up rating is based on fresh desktop Commerce and compact-mobile Commerce, Dealers, Activity, navigation, keyboard, focus, combobox filtering, empty-state, and calendar checks. It is not a production-readiness or all-role release score. The full multi-role rating remains gated on authenticated salesperson and retailer journeys with representative data.

## Scope and evidence

Live-rendered evidence was captured and inspected in the current local administrator session at:

- Desktop: `1440 × 1024`
- Compact mobile: `390 × 844`
- Views: Map, Dealers, Activity, Team, Commerce Dashboard, Orders, Products, and Accounts
- States: Map salesperson filter open, Activity calendar open, empty commerce states, narrow navigation overflow, and browser console warnings

The sign-in screen, salesperson Routes workspace, and retailer Shop were inspected from current source and the role contract only. They were not represented as live authenticated evidence because existing passwords are intentionally not retrievable and this read-only audit did not authorize password resets or account creation.

The live capture tool exposed accepted screenshots inline during the audit but did not provide file-backed screenshot export. The observations below distinguish live-rendered evidence from source-only evidence.

## Reference lens

All supplied references were used, but not treated as interchangeable component catalogs:

- [animations.dev](https://animations.dev/) and [Motion](https://motion.dev/) informed timing, motion purpose, performance, and reduced-motion checks.
- [Emil Kowalski's skills](https://github.com/emilkowalski/skills), [Taste Skill](https://www.tasteskill.dev/), [Impeccable](https://impeccable.style/), and [Hallmark](https://github.com/nutlope/hallmark) informed the anti-template, audit-first, task-fit, hierarchy, and craft review.
- [Motion Primitives](https://motion-primitives.com/) was considered for purposeful disclosure/state transitions, not ornamental motion.
- [DESIGN.md Directory](https://designdotmd.directory/) was used as a design-system comparison and documentation lens. The repository's own `design.md` remained authoritative.
- [21st.dev](https://21st.dev/community/components), [Aceternity UI](https://ui.aceternity.com/components), and [Jiro](https://jiro.build/components/background) were used to compare empty states, navigation, filters, forms, and responsive compositions. Their decorative backgrounds, shaders, marquees, and hero effects are inappropriate for this dense operations product.
- [Prompt Kit](https://www.prompt-kit.com/) was inspected as a benchmark for accessible, composable interface building blocks. Its AI-chat components do not solve a current product need here.
- [shadcn/ui](https://ui.shadcn.com/) remains the closest fit: local, composable, accessible primitives that can be shaped into this product's system rather than pasted in as a second visual language.

## What is working

1. **The new palette is a real improvement.** Ink indigo, terracotta, parchment, and denim focus create an identifiable operational product without borrowing the pickleball project's green/lime register.
2. **The shell is genuinely unified.** Field work, team administration, commerce, and retailer ordering share one role-aware application frame instead of separate mini-products.
3. **Dropdowns now follow one visual contract.** Native selects and searchable popovers share 44 px triggers, borders, radii, focus treatment, menu density, and selected states. Search appears where a list is multi-select or potentially large; its absence in small fixed lists is acceptable.
4. **The Activity calendar is now coherent.** It uses the same trigger geometry as other controls, has a clear selected day, previous/next controls, programmatic date labels, and closes with Escape.
5. **Map-first hierarchy is strong.** The map dominates desktop and mobile, while the dealer list provides a text equivalent for ownership and location information.
6. **Activity is the best non-map workspace.** Filters, KPI selectors, attention-ranked people, and route detail form a clear operational sequence on desktop and mobile.
7. **The mobile header preserves identity.** Username and role remain visible at narrow widths.
8. **The source shows useful accessibility discipline.** Labels, alert/status roles, explicit destructive confirmations, 44 px primary mobile controls, textual ownership labels, and reduced-motion checks exist in critical flows.

## Prioritized findings

### P1 — Fix before calling the integrated platform UI complete

#### 1. Authorized destinations disappear off-screen on mobile

**Live evidence:** At `390 px`, the workspace tab row measured `532 px` wide inside a `390 px` viewport. On Map, Commerce was entirely off-screen; on Commerce, Map was entirely off-screen. The selected item scrolls into view, but there is no fade, chevron, partial tab, or other affordance showing that more destinations exist.

**Accessibility evidence:** every custom workspace tab has `tabIndex=0`. The control uses `role="tablist"`/`role="tab"` but does not implement the expected roving focus and arrow-key behavior. The tab classes also lack an explicit focus-visible treatment.

**Impact:** administrators and additive-role users can miss entire workspaces; keyboard users must tab through every tab rather than navigate the tab set as a unit.

**Recommendation:** use the existing Tabs primitive or implement the ARIA tabs keyboard pattern. On compact widths, add a visible overflow affordance and keep the selected tab fully visible. A stable `More` destination is preferable if the authorized set grows further.

**Source:** `app/page.tsx:3687-3801`.

#### 2. Secondary text falls below AA contrast across common surfaces

The design contract requires WCAG AA. Current token combinations include:

- `#7c7771` on white: **4.44:1**
- `#7c7771` on parchment: **4.01:1**
- `#746f6a` on parchment: **4.49:1**
- white on Kiran red `#df4e3f`: **3.96:1**
- white on Chander ochre `#c48a12`: **3.00:1**

The first three are used for 12–14 px helper copy throughout Activity, Team, Commerce, and empty states. The last two affect initials rendered inside salesperson avatars.

**Impact:** quiet text is visually elegant but too quiet for normal-size operational copy, especially on lower-quality phone displays or outdoors.

**Recommendation:** promote normal helper text to `#6f6a65` or darker, reserve `#7c7771`/`#97918a` for non-text decoration, and use ink text or a dark overlay for initials on lighter salesperson colors.

**Source:** `app/globals.css:22-55`, `app/dealers.ts:22-35`, and repeated component usages.

#### 3. Browser autofill can contaminate the administrator account-creation form

**Live evidence:** the desktop Accounts capture showed a saved username and a masked saved password inserted into the Create account form even though component state initializes empty.

**Source evidence:** the reusable Commerce `Field` forwards `type`, `value`, and validation attributes, but has no `autoComplete` contract. The provisioning form therefore looks like a login form to browsers.

**Impact:** an administrator can accidentally create an account with their own saved identifier or password. It also exposes personal autofill data on a shared operations screen.

**Recommendation:** give the provisioning form explicit autocomplete semantics; use `new-password` for the initial password and an intentional username strategy, and verify behavior in Safari/Chrome/Arc. Do not rely on `autocomplete="off"` alone.

**Source:** `components/commerce-workspace.tsx:878-910` and `components/commerce-workspace.tsx:937-957`.

#### 4. Commerce has navigation consistency, but not operational depth

**Live evidence:** the Dashboard renders four zero-value cards followed by a large blank canvas. Orders renders a passive “Dealer orders will appear here” box. Products and Accounts place an empty list beside a long creation form, leaving a large desktop dead zone and requiring substantial mobile scrolling before the primary submit action.

**Impact:** the page technically belongs to the same shell, but it does not yet help staff decide what to do next. Empty data makes the entire module feel unfinished.

**Recommendation:** make empty states actionable and task-oriented. Dashboard should explain setup progress and link to the next required step. Orders should expose filters/status structure even when empty. Product and account creation should be explicit modes (drawer, dialog, or dedicated in-page state) with a sticky action footer, not permanent right rails.

**Source:** `components/commerce-workspace.tsx:140-227`, `components/commerce-workspace.tsx:453-490`, and `components/commerce-workspace.tsx:875-912`.

#### 5. Mobile Dealers is a filter wall before it is a dealer directory

**Live evidence:** at `390 × 844`, the first screen contains the title, add/import icons, search, salesperson, state, data quality, PIN, area, and reset controls; no dealer record is visible.

**Impact:** the most common task—finding or opening a dealer—requires a full-screen scroll even when no advanced filter is needed.

**Recommendation:** keep search visible, summarize active filters as chips, and move advanced filters into a disclosure/sheet. A restrained Motion Primitives-style disclosure would be appropriate here if it respects reduced motion; a decorative animated panel would not.

**Source:** the compact Dealers live capture and `app/page.tsx` dealer directory layout.

### P2 — Important polish and scale work

#### 6. Product image upload breaks the visual control system

The Products form exposes the browser-native `Choose Files / No file chosen` control inside an otherwise carefully standardized form.

**Recommendation:** wrap the file input in the existing button/input language, show selected file names and limits, and preserve a real labelled input for accessibility.

#### 7. Dealer row actions are too prominent and destructive actions are too easy to scan as peers

Desktop rows show Edit, Map, and Delete at equal visual weight. Delete is always exposed on every row. Confirmation reduces accident risk, but the table still becomes noisy and the destructive option dominates repeated scanning.

**Recommendation:** keep Edit and Map visible, move Delete into an overflow action, or give it lower default emphasis while preserving the explicit confirmation.

#### 8. The motion system is disciplined in feature code but inconsistent at the primitive layer

Map flight and responsive scroll-to-detail correctly check `prefers-reduced-motion`. Most feature controls animate explicit properties. However, the base Button and Switch still use `transition-all`, and durations/easing are not centralized.

**Impact:** future components can accidentally animate layout or unrelated properties, producing the “almost polished” feel that the supplied animation references warn about.

**Recommendation:** replace broad transitions with named properties, add shared fast/control and panel timing tokens, and keep motion limited to state continuity, disclosure, feedback, and spatial orientation.

**Source:** `components/ui/button.tsx:7-8`, `components/ui/switch.tsx`, `app/page.tsx:634-637`, and `components/routes-workspace.tsx:259-270`.

#### 9. Fixed-list selects are fine; large dealer/account selects need search

The absence of search in state, status, fabric, or design lists is appropriate. The Accounts dealer selector is different: it can grow with the full dealer workspace and should support type-ahead/search while retaining the shared dropdown shell.

**Recommendation:** use the same searchable popover pattern already proven in Map/Dealers for dealer assignment and any other unbounded entity list.

#### 10. Several helper labels are smaller than the repository's own typography floor

The design system says body copy is at least 14 px and helper text may be 12 px. Header role text, some map provenance notes, and status badges use 10 px.

**Recommendation:** keep 10 px only for nonessential map attribution supplied by the map provider; use at least 12 px for app-owned role, status, and explanatory text.

**Source:** `design.md:64-69` and `app/page.tsx:3622-3668`.

#### 11. Google Maps emits a deprecation warning

**Live browser evidence:** the console reports that `google.maps.Marker` is deprecated in favor of `google.maps.marker.AdvancedMarkerElement`.

**Impact:** not an immediate UX failure, but current marker bugs will not receive general fixes and this becomes future maintenance debt on the core surface.

**Recommendation:** plan an Advanced Marker migration after the UI P1s, preserving the current text/list equivalent and salesperson color rules.

## View-by-view health

| Step | View/state | Evidence | Health | Summary |
|---:|---|---|---|---|
| 1 | Desktop Map | Live render | Healthy | Strong hierarchy, useful sidebar, readable ownership, clear map dominance. |
| 2 | Map salesperson dropdown | Live open state | Healthy | Searchable multi-select is consistent with the shared dropdown contract. |
| 3 | Mobile Map | Live render | Needs work | Map itself is strong; workspace destinations are hidden by un-signaled horizontal overflow. |
| 4 | Desktop Dealers | Live render | Mostly healthy | Good table and filters; repeated actions are noisy. |
| 5 | Mobile Dealers | Live render | Needs work | Advanced filters consume the first viewport before any dealer appears. |
| 6 | Desktop Activity | Live render | Healthy | Best task hierarchy outside Map; clear attention-first structure. |
| 7 | Activity calendar | Live open state | Healthy | Cohesive trigger/popover, clear selection, keyboard-labelled dates. |
| 8 | Mobile Activity | Live render | Healthy | Filters and KPIs adapt well; content order remains understandable. |
| 9 | Desktop Team | Live render | Mostly healthy | Clear account status and actions; scales better than the original unfiltered list. |
| 10 | Mobile Team | Live render | Mostly healthy | Good stacking and touch sizes; rows become vertically long as actions grow. |
| 11 | Commerce Dashboard | Live desktop/mobile | Needs work | Consistent shell, but zero-data state provides no direction and wastes space. |
| 12 | Commerce Orders | Live desktop | Needs work | Passive empty state; no visible future filtering or workflow structure. |
| 13 | Commerce Products | Live desktop | Needs work | Creation rail dominates; native file input breaks the component language. |
| 14 | Commerce Accounts | Live desktop/mobile | Needs work | Clear cards, but persistent creation rail is long and browser autofill is unsafe. |
| 15 | Sign in | Current source only | Mostly healthy, not live-verified | Clear labels, autocomplete for login, alert role, and concise recovery copy. |
| 16 | Salesperson Routes | Current source only | Promising, not live-verified | Strong task model and reduced-motion handling; authenticated field journey remains a release gate. |
| 17 | Retailer Shop | Current source only | Promising, not live-verified | Catalog/cart/order structure is sound; no populated retailer session was exercised. |
| 18 | Keyboard/focus semantics | Live DOM + source | Needs work | Most controls are labelled; custom workspace tabs do not implement the full tabs pattern. |
| 19 | Console/runtime UI health | Live browser logs | Mostly healthy | No app runtime errors during the pass; one Google Marker deprecation warning. |

## Today → target experience

| Area | Today | Target |
|---|---|---|
| Mobile navigation | Hidden overflow; destinations appear/disappear as the row scrolls. | Obvious complete destination model with proper tabs keyboard behavior. |
| Dealers mobile | Search plus every advanced filter before results. | Search-first directory with compact filter summary and optional advanced disclosure. |
| Commerce empty states | Correct but passive cards and placeholders. | Guided setup and operational next actions. |
| Product/account creation | Permanent long right rail. | Intentional create/edit mode with focused form and persistent submit context. |
| Color hierarchy | Distinctive palette with too-light secondary text. | Same palette, adjusted text tokens that consistently meet AA. |
| Motion | Mostly restrained, but broad primitive transitions. | Small, explicit, interruptible transitions with central timing and reduced-motion policy. |
| Component references | Many attractive external patterns available. | Selective use of accessible primitives only when they improve the job at hand. |

## Recommended sequence

### Phase 1 — usability and accessibility

1. Repair compact workspace navigation and implement proper tab keyboard behavior.
2. Correct failing text/avatar contrast combinations.
3. Prevent credential-manager autofill in administrator provisioning forms.
4. Collapse mobile Dealers advanced filters.

### Phase 2 — Commerce productization

1. Redesign Dashboard and Orders empty states around next actions.
2. Move Product and Account creation into focused create/edit modes with sticky actions.
3. Replace the native file input presentation and add searchable dealer selection.

### Phase 3 — craft and maintenance

1. Consolidate motion durations/easing and remove `transition-all` from primitives.
2. Reduce repeated destructive-action prominence.
3. Migrate Google markers after the P1 interaction work.
4. Run authenticated salesperson and retailer journeys with realistic populated data.

## Accessibility evidence limits

This audit verified live accessibility roles/labels exposed by the browser, keyboard dismissal of the calendar/popovers, focus-related source styles, responsive touch sizing, color contrast calculations, and role-specific source contracts. It did **not** validate VoiceOver output, 200–400% zoom/reflow, forced-colors mode, switch control, a physical touch device, outdoor readability, or complete keyboard traversal of every modal and destructive flow. Those remain release checks rather than inferred passes.

## Final recommendation

Keep the current design direction. Do not replace it with Aceternity/Jiro-style backgrounds, shaders, glowing borders, or animated hero treatments. The best next move is a focused correction pass: fix navigation discoverability, contrast, provisioning autofill, and Commerce task hierarchy; then validate the live salesperson and retailer journeys. The product will feel more premium from clearer operational decisions and fewer dead zones—not from more visual effects.
