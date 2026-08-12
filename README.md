# Roster Builder v2

Automated roster scheduling that assigns team members to events while respecting hard constraints and optimizing for fairness preferences.

The same bundle runs in **two modes**, chosen at build time:

- **Local playground** (default): a login-free, in-memory YAML editor. Nothing is persisted; great for experimenting and for the public GitHub Pages deployment.
- **Production**: backed by [Supabase](https://supabase.com) with Google auth, a Postgres database, per-roster roles (RBAC), and an in-app admin flow. Enabled only when Supabase env vars are present.

Components never branch on the mode — they read data and call mutations through a uniform **provider contract** and gate UI on **permission flags**. See [Architecture](#architecture).

## Tech Stack

- **Frontend**: React 18 + Vite 5
- **Styling**: Tailwind CSS 3
- **Testing**: Vitest + jsdom
- **YAML**: js-yaml, with CodeMirror for editing
- **Backend (production mode)**: Supabase (Postgres + Row-Level Security + Auth)

## Quick Start

```bash
npm install                # Install dependencies
npm run dev                # Dev server → localhost:5173
npm test                   # Run tests
npm run test:coverage      # Coverage report
npm run build              # Production build
npm run preview            # Test production build locally
```

With no environment variables set, the app runs entirely as the local YAML playground — no account, no backend.

## Development Workflow

**Daily development** (use 99% of the time):
```bash
npm run dev                # → http://localhost:5173 (no base path)
```

**Test the production build** (before deploying):
```bash
npm run build              # Build with GitHub Pages base path
npm run preview            # → http://localhost:4173/roster-builder/
```

**Deploy to GitHub Pages**:
```bash
git add -A && git commit -m "Your message" && git push
npm run deploy             # gh-pages → https://caleb-llh.github.io/roster-builder/
```

> The `/roster-builder/` base path only applies to production builds; local dev runs without it.

## Enabling Production Mode (Supabase)

Production mode activates when both env vars are set at build time (see `.env.example`):

```bash
VITE_SUPABASE_URL=...       # Supabase project URL
VITE_SUPABASE_ANON_KEY=...  # anon/public key (safe to ship in a static bundle)
```

`detectMode()` returns `'production'` when both are present, otherwise `'local'`.

**Database** lives in `supabase/migrations/`:
- `0001_init.sql` — `rosters` (whole roster as one JSONB `document`), `roster_members` (RBAC), RLS policies, owner-membership trigger.
- `0002_admin_rpcs.sql` — owner-guarded RPCs: create roster, set/remove member role, list members.
- `0003_invites.sql` — email whitelist: `roster_invites`, auto-claim on signup, invite/revoke RPCs.

Apply to a hosted or local project:
```bash
npm run db:push            # push migrations to the linked project
npm run db:start           # (optional) run Supabase locally via Docker
```

Google OAuth is configured in the Supabase dashboard (Authentication → Providers); the app requests a redirect back to `window.location.origin + import.meta.env.BASE_URL`.

## Architecture

### Dual-mode data layer

```
        detectMode()                (env vars decide once, at runtime)
             │
   ┌─────────┴──────────┐
   ▼                    ▼
useLocalRosterProvider   useSupabaseRosterProvider
   │                    │
   └────────┬───────────┘
            ▼
   providerContract  ← uniform shape: { data, effectiveEvents, hasUncommitted,
            │            permissions, role, rosters, importData, updateEvents,
            │            replaceData, undo, redo, commitDraft, discardDraft, admin RPCs… }
            ▼
      useRosterData()  ← the hook every component uses
            ▼
    UI (App, EventsView, YamlDrawer, AdminModal, …)
```

- **`src/data/mode.js`** — `detectMode()`.
- **`src/hooks/useRosterData.js`** — selects the provider for the active mode and returns the contract.
- **`src/data/providerContract.js`** — the documented shape both providers satisfy. Mutations are async and fallible (`{ ok, errors }`), so code written against the local playground already handles production realities (network / RLS / validation failures).
- Components gate on `permissions` (`canEditRoster`, `canImport`, `canUndo`) and `role`, **never** on the mode. Local mode returns `LOCAL_PERMISSIONS` (all true, single-user sandbox); production derives them from the user's role.

**Roles (production RBAC)**:
- `owner` — everything, including import/replace YAML and the admin panel.
- `editor` — edit assignments, generate, undo.
- `viewer` — read-only.

The YAML drawer is gated on `canImport`, so it's available in the local playground and to owners in production only.

### Data flow (per roster)

```
YAML / JSONB document → getDerivedState → generation → UI
        ↓                     ↓                ↓
     js-yaml         merges source-code    rosterGenerator
                      defaults + document
```

- **Local mode**: the working document lives in memory only. No URL state, no localStorage.
- **Production mode**: the working document is a single JSONB `document` column on the roster row; mutations persist through Supabase and are protected by RLS.

### Source-code defaults

Roster-level **constraints** (hard rules) and **preferences** (soft goals) are policy, not data. They live in **`src/config/rosterDefaults.js`** and are merged under any values a document provides:

```
effective = { ...DEFAULT_ROSTER_CONSTRAINTS, ...document.roster_constraints }
```

A document only needs to specify the keys it wants to override. **Roles are intentionally not defaults** — they are data that belongs to a team/roster.

### Generation algorithm

**Promotion-aware seeding, greedy construction, then local search:**

0. **Seeding** — pre-fill understudy slots so trainees shadow early, choosing whoever can be promoted soonest (see [Design Decisions → Understudy feature](#understudy-feature)).
0.5. **Promotion planning** — backtrack to promote as many unlocked trainees into later real-role slots as possible before greedy spends their monthly budget; pin those slots.
1. **Greedy** — for each event, score eligible members per slot (fairness, spread, day prefs), understudy slots first, assign the best with a seeded tie-break, apply via a reversible move layer.
2. **Local search** — hill-climb by applying the best *improving* move (member↔member swap or empty-slot fill), each validated against hard constraints and applied reversibly, until no improving move remains. **Locked (pre-assigned) slots are never moved**, and **by default so are all slots that were already filled when the run started** (generation only fills empty slots — see "Generation only fills empty slots" below; `optimizeExisting` opts back into whole-roster re-optimization).

A fixed seed keeps generation deterministic. Every decision is captured by a verbose logger and surfaced as an "Algorithm log" in the result dialog.

See [`src/utils/rosterGenerator/README.md`](src/utils/rosterGenerator/README.md) for scoring weights and details.

## Design Decisions (binding spec)

This section is the **binding specification** for non-obvious behavior. It records *why* the system works the way it does so that future changes don't silently regress a decision that was made deliberately. **Changing any behavior described here requires updating this section in the same change** (see [`AGENTS.md`](AGENTS.md)).

### Data structure: `event.roster` is a positional array

`event.roster` is an **array** of slot objects `{ role, member_id, isGenerated? }` — *not* a role-keyed map. This is intentional so a role can appear multiple times in one event (e.g. two `support` slots, or a role plus its understudy). Any view that needs a role→member lookup must group into positional buckets (`byRole[role][index]`) rather than collapsing to a single value per role, or duplicate slots disappear.

- The CSV / "Copy to Excel" exports compute an `exportColumns` layout: for each role, the max count across all events → that many numbered columns; understudy roles get their own columns; cells are filled positionally from the per-event `byRole` buckets.

### `sample.yaml` is the canonical valid-schema example

[`public/sample.yaml`](public/sample.yaml) is the **single source of truth for what a valid input document looks like**. It must always parse (`js-yaml`) and pass `runAllValidators` with zero errors, and it should exercise every supported field so that reading it teaches the full schema — including the object form of member `roles` (`- name: <role>`) and the `understudy: true` flag. When the schema changes, update `sample.yaml` in the same change (it is part of the [feedback loop](#developer-workflow)); a stale sample is a spec regression. Member `roles` accept both the object form and a bare string for backward compatibility (`normalizeMemberRoles` handles both), but the sample and new documents use the object form for consistency and to make the understudy flag expressible.

### Draft/commit is separate from undo/redo history

Assignment edits (manual slot edits, swaps, generation, YAML-editor roster changes) do **not** touch the persisted "binding" immediately. They accumulate in an uncommitted **draft** that overlays the committed events; the UI renders `effectiveEvents = draftEvents ?? data.events`. Only **Save** (`commitDraft`) writes the draft into the working document — in production it also writes through to Supabase. **Discard** drops the draft. This gives one explicit, reviewable "publish" step and keeps a half-finished roster from becoming the shared source of truth.

The mechanism lives in [`useDraftHistory.js`](src/data/useDraftHistory.js) as **pure transitions** (`applyEdit`/`undoState`/`redoState`/`clearDraft`) wrapped by a hook; both providers use it, so the two modes behave identically and the logic is unit-testable without a renderer. Non-event document fields (members, roles, constraints) still apply immediately — the draft only tracks events.

**Undo/redo are a distinct concern from commit.** They navigate a two-stack history (`undoStack`/`redoStack`) of event snapshots and never persist. Crucially, **commit and discard leave both history stacks intact** — saving is not "the end of history", so you can still undo past a save (the pre-edit snapshot is compared against the new committed state). Conflating the two (e.g. clearing history on save) was deliberately rejected: users expect Ctrl+Z to keep working after they save. Every edit funnels through `updateEvents`, which is the single place that records an undo snapshot; individual handlers must not snapshot separately (that was the old `saveToHistory` pattern, now removed). Shortcuts: Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z (or Ctrl+Y) redo, ignored while typing in a field.

**Uncommitted changes are shown inline, not in a separate panel.** [`computeRosterDiff`](src/utils/rosterDiff.js) compares committed vs. draft positionally (by `date` + `roleIndex`, matching the array data structure) and yields per-slot `added`/`removed`/`changed` markers plus the net set of members added-to / removed-from the roster. Each changed slot shows a small colored dot in its corner (no heavy border) whose hover tooltip gives the detail (`role: before → after`); a sticky Save/Discard bar summarises the count and affected members. Membership is computed net (a member moved between slots is *not* reported as removed). The bar's count is a toggle that expands an IDE-copilot-style **change-review list** ([`ChangeReviewPanel`](src/components/ChangeReviewPanel.jsx)) grouping every change by event date with its `role` and `before → after`; the list is **read-only** (Save/Discard act on the whole draft) — per-change accept/reject was deliberately not built because the draft/commit model treats the draft as one atomic publish unit.

### Generated vs. locked (pre-assigned) slots
- A slot with `isGenerated: true` was placed by the generator. Within the run that places it, it may be freely moved/replaced by local search — **but a slot that was *already* filled when the run started is locked by default** (see "Generation only fills empty slots" below), so re-running generate does not reshuffle prior work.
- A slot that is **filled and *not* `isGenerated`** is a **manually pre-assigned ("locked") slot**. `RosterState.isLocked(slot)` identifies these.
- A generated slot may also be **pinned** (`slot._pinnedPromotion`) by the promotion-planning phase; pinned slots are treated as locked for the duration of the run (transient — stripped before results are returned).
- **Local search must never move a locked slot.** Phase 2 swap enumeration excludes locked slots (`slots.filter(s => getOccupant(s) && !isLocked(s))`). Pre-assigned members are respected as hard commitments.

### Generation only fills empty slots (binding, default)
By default `generateRoster` is **additive**: it fills the empty slots and never reshuffles assignments that already exist — including ones an *earlier, still-uncommitted* generation produced. Rationale: a user reported "I only have 1 unfilled slot, and generating makes 8 unsaved changes." That was Phase 2 local search doing its job — re-optimizing the *whole* roster (fairness/spread/preferences) by swapping already-generated slots — but it is surprising and undesirable as a default: each generate should add to the roster, not churn what the user already has and is reviewing in the draft. **Mechanism:** before Phase 1, every slot occupied at run start is tagged `_preExisting` and `RosterState.isLocked` treats it as locked, so Phase 2 can only rearrange the slots *this* run filled. Manually pre-assigned slots were already locked (`!isGenerated`); this extends the same protection to prior *generated* slots. The tag is transient — stripped before results are returned (like `_pinnedPromotion`), so it never leaks into roster data. The whole-roster re-optimization is preserved behind an **`optimizeExisting` option** (default `false`), intended to become a user toggle on a future algorithm-settings page. Note this means generate cannot *improve* an already-full roster in the default mode — that is the deliberate trade for predictability.


### Understudy feature

The system supports **understudies**: members training to perform a role, who must shadow it before performing it for real.

**Model** (`src/utils/understudy.js`):
- A member has `{ roles, understudyFor }`. `understudyFor: ["multi-vm"]` means "training to perform `multi-vm`".
- An understudy **slot** uses the suffix convention: `multi-vm-understudy` (`understudySlotRole(base)` / `baseRoleOf(slot)` / `isUnderstudyRole(slot)`).
- Two distinct role-compatibility rules exist and must not be conflated:
  - **`canFillSlotRole`** (UI): who may fill a slot from scratch — for an understudy slot, trainees only; for a real role, full performers only.
  - **`isRoleCapable`** (generator): a trainee counts as capable of the base role for lookahead/promotion purposes.

**Manual assignment dropdown includes promoted understudies.** The slot picker (`getAvailableMembersForEvent`) lists, for a real role `X`: full performers, **plus** any trainee who has already **completed an understudy session for `X` on an earlier date in the roster** (`isPromotedForRole` → `countUnderstudySessionsBefore`). Those trainees are tagged "understudy" in the list. This mirrors the generator's promotions so a human can reproduce/adjust them; trainees who haven't understudied yet stay out, honouring understudy-before-role. The same promotion-aware check gates drag-and-drop (`canOccupy` in `App.jsx`). No data-structure change was needed — `roles` + `understudyFor` already model this; the UI simply consults the event history.

**Hard constraints** (`eligibilityChecker.js`, gated by `ENFORCE_UNDERSTUDY_BEFORE_ROLE`):
- **Understudy-before-role**: a member may not be assigned a real role until they have completed `UNDERSTUDY_MIN_SESSIONS` understudy sessions for it, on **strictly earlier** dates.
- **Understudy cap = 1** (`UNDERSTUDY_MIN_SESSIONS = 1`): once a trainee has completed their required understudy session, they are **hard-blocked** from further understudy slots for that role. Rationale: repeatedly shadowing without ever being promoted (the "Ozborn understudied twice, never performed" bug) is wasteful — one session is enough to become eligible.

**Assignment-time validation mirrors the gate** (`assignmentValidator.js`, `checkUnderstudyBeforeRole`, gated by the same `ENFORCE_UNDERSTUDY_BEFORE_ROLE`): the generator's eligibility check only guards *generated* rosters, but slots can also be filled/edited/dragged by hand. So the validator independently flags any member who is only a **trainee** for a real role `X` (in `understudyFor`, not `roles`) but has **not** completed an understudy session for `X` on a strictly-earlier date (`countUnderstudySessionsBefore < UNDERSTUDY_MIN_SESSIONS`). Full performers and promoted trainees are never flagged. This surfaces "understudy rostered for the actual role before promotion" as an error in the UI regardless of how the assignment was made.

**Promotion** — handled by the Phase 0.5 promotion planner (below), **not** by scoring:
- Once trainees are unlocked (have done their understudy session but not yet performed the real role), the planner reserves later real-role slots for as many of them as possible, up front.
- There is deliberately **no promotion scorer**. A soft score can't help once a trainee is hard-blocked by the monthly cap (see the Phase 0.5 rationale), so the earlier `promoteUnderstudy` scorer was **removed** to avoid confusion — promotion is a hard, planned reservation, not a preference.

**Phase 0 — promotion-aware seeding** (`understudySeeding.js`):
- Before greedy construction, understudy slots are seeded so trainees get their required shadowing early. Seeding is **base-role-centric with lookahead**, not member-order greedy.
- For each base role, it tracks trainees still needing a session, walks events chronologically, and at each shadowing opportunity picks the trainee who can be **promoted soonest** afterwards — ranked by `EligibilityChecker.canBePromotedTo(memberId, baseRole, laterEvent)` (capability + availability + not-already-assigned, deliberately *ignoring* the understudy gate since seeding is what satisfies it).
- Rationale: naive member-order seeding parked a trainee (e.g. denise) who was unavailable at the next real event, wasting the promotion chain. Promotion-aware seeding matches the hand-tuned reference (2 promotions instead of 1).

**Phase 0.5 — promotion planning (backtracking)** (`promotionPlanning.js`):
- Being *eligible* to perform the real role isn't enough to actually get promoted. Greedy fills events chronologically and `MAX_ASSIGNMENTS_PER_MONTH` (default **2**) is a hard cap, so a trainee's monthly budget can be spent on ordinary slots **before** their real-role opportunity arrives — leaving them capped out and unable to be promoted. The `promoteUnderstudy` scorer can't help once the trainee is hard-blocked.
- This dedicated phase runs right after seeding. Across the whole population of unlocked trainees it **backtracks** to find the assignment of trainees→later real base-role slots that **maximises the number of promoted trainees**, honouring all hard constraints (it re-uses `EligibilityChecker.isEligible` and records/reverts each tentative promotion in the tracker so monthly/weekly counters stay accurate during the search — a static bipartite matching won't do because assignments interact through the caps).
- Chosen promotions are committed as generated slots and **pinned** (`slot._pinnedPromotion`) so Phase 2 local search won't swap them away. The pin is transient and stripped before results are returned.
- Rationale: the real "promotions not maximised" bug — jia-lin understudied Sep 26 and *was* eligible for the Oct 31 real multi-vm, but greedy had already spent her 2 October slots on ordinary roles, so the monthly cap blocked the promotion. Securing promotions up front achieves 2 promotions (matching the reference) instead of 1.

**Phase 1 — understudy slots first**: within each event, understudy slots are scored/filled **before** real-role slots (`orderedSlots` sorts understudy roles ahead), so trainees are scheduled before the roles that depend on them.

**Members view**: the role filter includes understudies — filtering by `multi-vm` shows both performers and `multi-vm` trainees (`matchesRole` checks `roles` *and* `understudyFor`).

### Roster statistics are real-time, not a generation snapshot

Roster statistics — including the quality metrics (the shift-distribution bell curve, per-member Time Spacing, and per-role Role Rotation Quality) — are computed from the **current** roster state on every render by `calculateRosterStats(events, members, rosterPeriod)` (`rosterStats.js`). It builds a live `AssignmentTracker` from the present `events` so the fairness/spread formulas are identical to the generator's, and returns `fairnessMetrics` + `assignedRoles`. Rationale: previously the detailed quality metrics read from the frozen `generationResult` snapshot, so hand-edits/swaps left them **stale** while the summary numbers above them updated — an inconsistency. `generationResult` is now used **only** for genuinely generation-time artifacts: the unassignable-roles warning and the algorithm log. **Invariant: anything a user can change by editing the roster must be recomputed from `events`, not read from a generation snapshot.**

**Quality metrics are shown as human-meaningful quantities, not raw std-devs.** The compact `QualityMetrics` panel deliberately does **not** surface `assignmentStdDev`/`spreadStdDev` as bare numbers — a "1.34" told a scheduler nothing. Instead: the Shift Balance card was **removed** (the bell curve already shows workload spread); **Time Spacing** is a per-member **timeline** that plots each shift as a dot positioned by date across the roster period (`memberStats[].assignmentDates` on a shared `periodStart`/`periodEnd` axis) so clustering vs. even spacing reads visually — chosen over a single `avgGapDays` bar because a bar collapses *when* shifts fall into one scalar and hides bunching; the numeric `~avgGapDays` is kept only as a right-hand annotation; **Role Rotation Quality** is one bar per role of `rotationRatio = uniqueMembers / totalAssignments` (1.0 = every shift went to a different person, low = the same few people repeat the role). The old "Avg Members Per Role" gauge and the separate "Member Workload Distribution" list were removed (the bell curve + Time Spacing timeline cover per-member insight). `avgGapDays` is `null` for members with fewer than two shifts (no gap to measure). The raw std-dev fields still exist on `fairnessMetrics` for the generator's objective and the full `QualityMetrics` view (RosterStatsPanel "Show Details").

### Generation runs immediately; no confirm gate, no result modal

Clicking **Auto** (the generate FAB) runs `generateRoster` **immediately** — there is no "How it works → Continue & Generate" gate. Rationale: generation is **non-destructive** — its output lands in the draft and is fully undoable (Ctrl/Cmd+Z / discard draft), so a mandatory pre-action explainer was pure friction (the same anti-pattern as gating bulk-clear behind a menu). The old `GenerationResultModal` was **deleted**: its only unique content over the always-present Roster Statistics panel was three headline counts, and it otherwise re-rendered the same `QualityMetrics` + unassignable-roles list. Confirmation that a run happened is now a **transient neutral toast** — it reports **how many slots *this* click filled**, computed as `(slots empty before) − (slots still unassignable after)`. **Bug fixed (twice):** the toast first read `Generated {assignedRoles} of {totalRoles}` (whole-roster counts) so filling 2 empty slots on an otherwise-full roster confusingly said "65 of 65"; the naive fix of using `stats.generatedAssignments` was *also* wrong because that field counts **every** slot tagged `isGenerated` across the whole roster — including slots filled by earlier, still-uncommitted runs — so a click that filled 1 slot could report "53". The empty-before delta is the only count that reflects the single action. It now reads `Filled N slot(s)` (or `Nothing to generate — all slots already filled` when nothing was added), with `· K unassignable` appended when some slots could not be filled. The persistent detail lives in the stats panel. The "How the Roster Generator Works" explainer (`AlgorithmDescriptionModal`) is **kept but on-demand** — **hovering (or focusing) the Auto FAB reveals an inline glass info card** (built with the shared `HoverCard`) summarising the active rules/goals (the same `getAlgorithmDescription()` text), and clicking that card opens the full modal. An earlier version showed only a bare "How it works" pill that you still had to click, which didn't actually surface the information on hover. Because the explainer is about *generating*, it is only reachable while Auto is shown (i.e. there are unassigned roles). Note the two distinct `stats` shapes: `generationResult.stats` holds **scalar counts** (`assignedRoles`, `totalRoles`, `generatedAssignments`) plus the `unassignableRoles` array, whereas `calculateRosterStats(...)` returns arrays.

**Sticky chrome must not stack on top of each other (binding).** The app has up to three stacked sticky bars: the pinned amber **draft ("N unsaved changes") bar** (`top: 0`), the **mobile tab switcher** (Events/Members, `lg:hidden`, pinned at `top: draftBarHeight`), and, in the Events column, the **multi-select toolbar** — all on the `zSticky` rung (see the z-index scale below). They previously overlapped (the draft bar obscured the select toolbar; the tab bar obscured the draft bar). Fix: `App` measures **both** the draft bar and the tab bar with `ResizeObserver`s (`draftBarHeight`, `tabBarHeight`) and offsets each lower bar by the height of the ones above it — the tab bar pins at `draftBarHeight`, and the select toolbar receives `stickyTop = draftBarHeight + tabBarHeight` (consumed via `style={{ top }}`). Measured offsets (not hard-coded heights) are used because the draft bar wraps/grows (mobile wrap + expandable review list); the tab bar is measured too but reports `0` on desktop where it is `display:none`, so the same expression works in both layouts. **All floating action buttons are one size (`h-12 w-12`)** — Auto, undo, redo and the YAML `{ }` button. **Undo/redo use proper curved-arrow SVG icons** (not the `↶`/`↷` glyphs, which rendered inconsistently across fonts). **The two bottom toasts (swap / generation) sit at `bottom-20`, not `bottom-4`,** so they clear the bottom-centered floating month selector instead of covering it.

**Z-index is a single named scale, not ad-hoc numbers (binding).** Stacking order lives in `statsTheme.js` as five rungs — `zInCard` (10) < `zSticky` (30) < `zPopover` (40) < `zToast` (45) < `zModal` (50) — and every overlapping layer imports one of them instead of writing a raw `z-*`. **Bug fixed:** the Events issue-summary dropdown and the sticky multi-select toolbar were *both* `z-40`, so the dropdown opened *underneath* the toolbar (equal z-index → later-painted sticky element won). The rule: a layer that opens **on top of** another must be on a higher rung. Concretely — card-local pickers/menus are `zInCard`; pinned chrome (draft bar, mobile tabs, select toolbar, month selector, header action menu) is `zSticky`; dropdowns/pickers that must escape sticky chrome (the issue dropdown, a slot picker opened from a pill's raised card) and the FAB cluster are `zPopover`; toasts are `zToast` (above sticky + popovers, below modals); modals/the YAML drawer and their backdrops are `zModal`. This is the layering source of truth — do not reintroduce bare `z-*` for cross-layer stacking.

**Hover popups have one shared behaviour — the `HoverCard` primitive (binding).** All hover-triggered popups (the Auto FAB explainer, the per-slot unsaved-change dot tooltip, and future ones) go through `HoverCard` in `SharedComponents.jsx` rather than bespoke `group-hover` CSS. It fixes three recurring problems: (1) **no dead gap** — trigger and floating panel share one positioned container, so moving the cursor from the trigger onto the panel never crosses un-hovered space (the old Auto card used an `mr-3` margin gap and vanished the instant you reached for it); (2) **a short close delay** (`CLOSE_DELAY_MS`, 140 ms) that a re-enter cancels, so you can cross a sub-pixel seam or a scrollbar and *scroll inside* the panel; (3) **touch works** — because touch devices can't hover, a tap on the trigger toggles the panel and an outside tap closes it (`tapToggles`, on by default; set **false** when the trigger has its own primary tap action, e.g. the Auto FAB, which must generate on tap, not toggle a card). Panels are rendered into a **portal on `document.body`** and positioned `position: fixed`. **The portal is load-bearing, not cosmetic:** a `position: fixed` element is positioned relative to the nearest ancestor that has a `transform` *or* a `backdrop-filter` (both establish a containing block), and our glass surfaces (`glassPanel`/`glassCard`) all use `backdrop-blur` — so a panel rendered inline inside an event card was anchored to that blurred card instead of the viewport and appeared far from its trigger (the diff dot's tooltip "didn't appear next to it"). Portaling to `<body>` escapes every such containing block so the measured viewport coordinates are honoured; the outside-click handler therefore also treats a click inside the portaled panel as "inside". The panel is also **dynamically clamped to the viewport**: after the panel mounts, `HoverCard` measures the trigger and panel with `getBoundingClientRect`, **flips** to the opposite side if the preferred `placement` won't fit, clamps `left`/`top` inside the viewport (8px margin), and sets `maxHeight` to the available space so tall content (e.g. the algorithm explainer) **scrolls within the panel** instead of growing off-screen — recomputed on open, resize, and scroll. This replaced static `left-1/2 -translate-x-1/2` classes, which centred the panel on the trigger and let it spill (a dot near the left edge ran off-screen; the tall explainer overflowed the top). Panels also carry a `max-w-[calc(100vw-1rem)]` floor so they never exceed a narrow screen, sit on the `zPopover` rung, and are styled with a glass token (`glassPanel` for the explainer, `glassPopup` for the small dot tooltip) — the dot tooltip was previously a raw `bg-gray-900` `whitespace-nowrap` box that both broke the monochrome-glass look and could run off-screen. **Reliability note:** because the panel is portaled, on the first layout pass after opening its ref can be unattached or its `offsetWidth` still `0` (not yet painted). The panel starts at `visibility: hidden` until a valid position resolves, so if that first measurement is skipped the panel silently *never appears* ("the orange dot popup still doesn't show next to my hover"). `reposition` therefore **re-schedules itself via `requestAnimationFrame` while the panel has no size**, and the pending frame is cancelled on close/unmount — guaranteeing `pos` resolves and the panel becomes visible next to its trigger.

**Events lead over Members (binding).** In both the mobile tab switcher and the desktop split view, **Events is the first/left panel** and Members second; `activeTab` defaults to `'events'`. Rationale: the roster (Events) is the primary artifact the user is building and editing — generation, swaps, and bulk-clear all act on it — so it should be what opens by default and what reads first, with the Members roster as the supporting reference. On desktop the Events column keeps its wider `lg:w-7/12` and now carries the `lg:border-r`. The **draft ("N unsaved changes") bar is deliberately app-level chrome even though its content is 100% event/roster changes** (`computeRosterDiff` only diffs event slots; Members has nothing draftable) — it is the global Save/Discard affordance and pins above both columns; the per-slot dots on Events pills are the in-place, scoped view of the same diff.

### The UI look is a shared token module (light glassmorphism, monochrome), not per-component classes

The app's cosmetic classes live in one place — `src/utils/statsTheme.js` — and are consumed across the UI (`App`, `EventsView`, `RosterSlotPill`, the modals, the stats panel, etc.). It exports Tailwind class-string tokens in three families: a **3-tier typography hierarchy** for *chrome* (`tierTitle`, `tierSection`, `tierLabel`, `tierUnit`, plus `headingPage`/`headingModal` for larger titles and `helperText` for prose); **glass surfaces** (`glassPanel`, `glassCard`, `glassPopup`, `glassArrow`, `glassMenu`, `glassModal`, `modalBackdrop`, `glassFab`); and **controls** (`btnPrimary`, `btnNeutral`, `btnDanger`, `monoChip`, `hoverRow`, `tabActive`, `tabInactive`). Rationale: the same strings had been copy-pasted across many files, so a tweak in one place drifted from the others; centralizing them keeps the look consistent and tunable in one edit.

**Tokens over hand-rolled classes (binding).** Surfaces, buttons and chips must consume the tokens, not re-write the recipe inline. A glass panel is `glassPanel`/`glassCard` (never a hand-written `bg-white/40 backdrop-blur-md … border border-white/30 shadow-lg`); a primary/neutral/destructive button is `btnPrimary`/`btnNeutral`/`btnDanger` (never a bare `bg-gray-800 …`/`bg-white hover:bg-gray-50 …`/`bg-red-600 …`); a small neutral chip is `monoChip` (never opaque `bg-gray-100`/`bg-gray-200`). The pinned **draft ("N unsaved changes") bar** is the one deliberate exception to "warnings are near-glass tints": it is the highest-urgency chrome (act now — Save or Discard), so it uses a **saturated** amber fill — and that recipe is itself a token (`draftBar`). Its **Save button keeps the saturated amber CTA** (`bg-amber-600`) and Discard the amber-outline ghost — deliberately *not* the monochrome `btnPrimary`/`btnNeutral`, because the whole bar is the app's single "shout" surface and a grey Save button read as demoted against the amber. This is the one place a coloured CTA is allowed. Opaque `bg-gray-50`/`bg-white` fills are disallowed — even the loading screen and in-modal wells are translucent — so nested panels never turn the glass muddy grey. **Modals share one padding scale** (`p-4 sm:p-6` body, `px-4 sm:px-6 py-3 sm:py-4` header) so they don't drift between `p-5`/`p-6`/`p-4`. **Repeated markup is extracted into shared primitives in `SharedComponents.jsx`** — `IssueSummary`, `StatTile`, `ModalHeader`, `ModalCloseButton`, `GlassFab`, and a `useClickOutside` hook — so the FABs, stat tiles, modal chrome and click-to-open dropdowns are defined once. Rationale: the audit found the same glass/button/chip strings re-typed with small drifts (radii, opacities, hover colours); routing everything through tokens/primitives removes the drift and makes a restyle a one-file change.

**Design system is guarded by a lint test and documented by a living page (binding).** The repo has no ESLint, so the token discipline is enforced by a dependency-free Vitest guardrail (`src/utils/designSystem.lint.test.js`) that scans `src/` and fails if any file (a) inlines an exact glass-token string (`glassPanel`/`glassCard`/`glassMenu`/`glassModal`/`glassFab`/`draftBar`) instead of importing it, or (b) uses a banned decorative hue (`yellow-*`, which warnings were unified off of). It is intentionally **high-signal, not exhaustive** — it flags unambiguous copy-paste/hue mistakes rather than every raw utility, so it never fights the legitimate one-off surfaces (hover states, the dark log console, the day-pill scroller). Two files are allowlisted: `statsTheme.js` (defines the tokens) and `DesignSystem.jsx` (renders them verbatim). Rationale: a broad "ban all raw `bg-white/`/`backdrop-blur`" rule flagged dozens of intentional surfaces and would have been silenced; catching the exact recipe-duplication is what actually preserves the "one edit restyles everything" property. The companion **living reference page** (`src/components/DesignSystem.jsx`, reached via the `#design` URL hash — no router, no auth, gated at mount in `main.jsx` so `Root`'s hooks are never conditionally skipped) renders every token and shared primitive so new work has a visual source of truth.

**Colour policy (binding).** Three categories, treated differently:
- **Decorative** accents were monochromatized to slate/gray. Blue is *no longer a brand hue* — the active tab, date/day/reminder chips, dropdown hovers, drag-over rings, modal CTAs, the generation-result stat tiles, and the `generation`/`swap` log chips were all recolored to gray. Do not reintroduce decorative blue/green/purple.
- **Semantic** colour is KEPT (it carries meaning) but rendered **accent-only** on glass so it never shouts against the translucent UI: instead of saturated fills (`bg-red-100`, `bg-yellow-100`, `ring-2 ring-red-500`), semantic surfaces use a near-glass tint + a thin `border-l-2` accent + muted `-700` text (tokens `semanticError`/`semanticWarning`, chips `errorChip`/`warningChip`, soft `ring-1` card rings `ringError`/`ringWarning`). red = error / destructive, amber = warning / unsaved draft, and the diff triad emerald = added / amber = changed / rose = removed. **Warnings are unified on `amber`, not `yellow`** — amber is warmer, softer against the glass, and matches the draft bar + the diff "changed" hue; do not reintroduce yellow. The action-log chips for delete/insert/update were aligned to the same triad (rose/emerald/amber).
- **Functional** role/day colour (`colorUtils.js`) is KEPT but *muted*, and expressed as **coloured text with a neutral (never coloured) surface**. `COLOR_PALETTE` is a list of **text-colour-only** classes (`text-purple-600`, …). Role *tags* (roster slot pills, member-card role/understudy tags) render the label in its role hue inside a **subtle neutral outline** — `border border-gray-200/70 bg-white/30 rounded` — so the tag still reads as a pill but the *colour* is only in the font, not a filled background; understudy tags additionally use a **dashed** border as a non-colour cue. Inline role labels (availability breakdown, the add-role menu item) are bare coloured text. The event **day-of-week label** is text-colour only (`DAY_CARD_COLORS`). **Availability is shown by the ✓/✗ glyph, not colour** — the "available" name is neutral `text-gray-700` (only the unavailable name keeps red + strikethrough), since green fell outside the red/amber-only semantic palette and the glyph already carries the meaning. Hue distinguishes roles/days at a glance while every surface stays monochrome, matching the roster-stats look. Monochromizing hues entirely was rejected (loses at-a-glance identification); a coloured *fill* was rejected (saturated pills fight the glass). **Members view and Events view share one look** (`p-4 sm:p-6`, the same `bg-white/40 backdrop-blur-md` card, `headingPage` title, outlined coloured-font tags, no emojis); the members role-filter buttons are neutral glass chips whose only colour is the role label text. **All in-modal surfaces are glass, not opaque grey** — the generation-result quality metrics use `glassCard` (translucent), never `bg-gray-50`/`bg-white`, so nested panels don't turn the glass modal muddy grey.

**Card status vs. day cue (binding).** Event cards are a neutral monochrome glass surface. The **day of week is conveyed only by a faint accent hue on the day-label text** (`DAY_CARD_COLORS`, e.g. `text-purple-500`) — *not* by a card border. The **coloured left border is reserved for status**: a slightly thicker one-sided `border-l-4` (red = error, amber = warning) appears only when an event has issues, and no left accent otherwise. Rationale: a full coloured ring/stripe per weekday competed visually with the error/warning signal; separating "which day" (text hue) from "is there a problem" (left border) keeps each cue legible.

**No decorative emojis (binding).** Decorative emoji glyphs (❌ ⚠️ ℹ️ ✨ 📄 🧹 📋 💾 ⭐ etc.) were removed app-wide — they read as cheap against the clean glass look. Status is carried by the accent-only semantic tokens and short text labels ("Error:", "Warning:", the "Auto"/`{ }` FAB labels) instead. *Functional* monochrome typographic marks are kept: availability ✓/✗, the assigned ★, undo/redo ↶/↷, and the ▼/▶ disclosure arrows are structural UI, not decoration.

**Validation summary is dots + numbers, not a pill (binding).** Both the Events and Members headings present errors/warnings the same way via a single shared `IssueSummary` component (`SharedComponents.jsx`): coloured dot(s) + count(s) (red = errors, amber = warnings) followed by a ▾ caret. **Clicking** the caret toggles a glass dropdown listing each issue (no hover — hover was replaced so touch works and the two surfaces behave identically); clicking outside closes it. There is no chip/pill background. Rationale: a filled pill reintroduced a saturated surface the colour policy avoids, and the old full-width amber `WarningBanner` on the members view was inconsistent with the events summary — both now use the one component.

**Swap confirmation is a two-row before→after card (binding).** The staged-swap dialog (`pendingSwap` in `App.jsx`) renders the two affected slots as two glass rows, each captioned `date · role` (uppercase chrome) with the occupant shown as `before → after` (old name struck through, new name bold). The earlier prose form ("Swap X ↔ Y?" plus a redundant past-tense "Swapped …" sentence) was replaced because it duplicated information and read as an announcement of something already done rather than a confirmation.

**Calibrated decisions that must not be tuned away blindly:** (1) **Tier 1 uses `tracking-wide` (0.025em), not `tracking-[0.2em]`** — at the title's small size very wide letter-spacing left distracting gaps between letters, so hierarchy is carried by weight + size, not extreme tracking; (2) **`helperText` is a muted `text-gray-400`** (an earlier `text-gray-300` pass was too faint to read) — descriptive, sentence-form prose (which is *not* uppercase/thin, unlike chrome labels) should recede behind the data and the labelled chrome. **Data supplied by the YAML (member names, role names, numeric values) is NOT chrome** and stays normal-case; it must not adopt the uppercase tier tokens.

### Manual swap validation must ignore the slot each member is *leaving*

Manual drag-and-drop / swap validation lives in the pure `canSwapRosterSlots` helper (`constraintsUtils.js`), used by `handleSwapRosterSlots` in `App.jsx` and unit-tested directly. It checks, for each member landing in its new slot: role compatibility (full performer, or a promoted trainee for a real role), availability on the destination date, and once-per-event (no duplicate member in one event). The once-per-event check **must ignore the index each member is vacating within the event being checked**: for a same-event swap the two slots share one `roster` array, so testing memberA→slotB ignores `sourceIndex` and testing memberB→slotA ignores `targetIndex`; for a cross-event swap the incoming member vacates nothing in the destination event, so ignore nothing (`-1`). **Bug fixed:** a same-event, different-role swap (e.g. moving a member from `vm` to an empty `cam-1` in the same event) was rejected because the check ignored the *source* index for both members, so memberB (or the member's own still-present entry) tripped the duplicate clash. Extracting the logic into a tested pure helper locks this in.

### Bulk-clear of assignments: clear members, keep slots, one undo step

The Events view has a multi-select mode. Its bulk action **clears the assigned member from each selected slot but keeps the role slot** — it reuses the same non-destructive semantics as clearing a single slot (`handleEditRosterSlot(date, idx, null)`), *not* the destructive "remove whole role slot" path. Rationale: the common need is to wipe a batch of (often auto-generated) picks and re-fill them, so the role requirements must survive; deleting role slots wholesale is a different, rarer operation kept separate. The mutation is a pure helper, `buildBulkClear(events, keys)` (`bulkClear.js`, unit-tested), which drops the `isGenerated` tag on cleared slots and ignores empty/unknown keys so the count never lies. The whole selection is applied in **one** `updateEvents` call → a single draft entry and a single undo step, plus one log line (`Cleared N assignments`).

**Entry is a gesture on a filled pill, not a menu (binding).** You enter select mode by **long-pressing (touch, ~500ms)** or **right-clicking (desktop `contextmenu`)** a filled assignment pill, which enters select mode with that pill pre-selected (`enterSelectAt`). The earlier ⋮-menu item was removed: bulk-clear is a frequent action and a two-tap menu path was too buried. Left-click (opens the picker) and left-drag (swap) are deliberately untouched, so the enter-select gestures don't collide with them; the long-press timer cancels on `touchmove`/`touchend` so a scroll or drag never triggers it.

**Selection works at three scales, all scoped to the visible/filtered events.** (1) *Slot* — click/tap a pill toggles it; **Shift-click** extends a contiguous range over the visible order (desktop). (2) *Event* — a tri-state checkbox in each event-card header selects/deselects all filled slots in that event. (3) *Month* — the same tri-state checkbox in each month header does so for the month. Plus the toolbar's **All** / **Generated** / **Unselect all**. Everything is computed from `filteredMonths` (the ordered `visibleFilledKeys` flat list powers "All" and the range; `eventFilledKeys`/`monthFilledKeys` power the group checkboxes), so "select all/visible" is consistent with how export treats "everything". Group toggles are a predictable tri-state: if every key in the group is already selected they deselect, otherwise they select (`toggleSlotBatch`). Only **filled** slots are ever selectable (an empty slot has nothing to clear); the group checkboxes and per-pill toggle render **only in select mode**, so the normal view stays uncluttered.

**Why buttons/checkboxes, not a drag-marquee:** a rectangle lasso is unreliable against a responsive wrapping card grid across month sections and unusable on touch (the primary target), whereas long-press entry + group checkboxes + shift-click ranges deliver both "select everything quickly" and precise picking without any always-on chrome.

### Export column order (real roles first, understudies last)

The CSV / "Copy to Excel" exports use the shared column layout (`exportColumnLayout` in `EventsView.jsx`). Columns are ordered **metadata → all real roles → all understudy columns**: date, day, reporting time, event name, then every real role (in catalog order, duplicates numbered e.g. `roving-cam 2`), then every `X-understudy` column at the end. Rationale: an understudy column right after each real role interleaved trainees with performers and made the "who is actually rostered vs. who is shadowing" split hard to scan; grouping the understudy columns at the end matches how the roster is read (performers first, understudies as a trailing block). **Missing slots render `-`** (not blank) in the exports so an empty cell is unambiguous. (An on-screen Table view previously shared this layout but was removed as unused — the card view is the only on-screen presentation.)

### Consecutive-weekend avoidance is a Phase-2 objective term, not just a Phase-1 bias

`AVOID_CONSECUTIVE_WEEKS` is enforced in **two** places that must stay in sync: the per-candidate `consecutiveWeekends` scorer (weight `200`) that biases Phase-1 greedy construction, **and** the whole-roster objective `evaluateState` (`index.js`), which counts consecutive-weekend pairs across the roster (`countConsecutiveWeekendViolations`, weighted by `SCORING_WEIGHTS.consecutiveWeekends`, gated by the same preference). Rationale: Phase-2 local search only optimises what `evaluateState` measures. If a soft goal exists only as a Phase-1 scorer, a later swap can freely re-introduce the thing it was meant to avoid — exactly the trap that made the availability scorer useless (below). **Invariant: every soft goal that biases greedy scoring must also appear as a term in `evaluateState`, or local search can undo it.**

### Availability is a constraint, not an objective (removed scorer)

The `availability` scorer (which prioritized members with fewer available dates) was **removed**. It was a Phase-1 greedy heuristic that never appeared in the Phase-2 objective, so it couldn't survive local search and caused confusing workload imbalance. Availability is properly a **hard eligibility constraint** (`ENFORCE_MEMBER_AVAILABILITY`), not a fairness objective. Do not re-introduce it as a scorer.

### Determinism

Generation is deterministic: a fixed seed drives all tie-breaks (`rng.js`). Every decision is captured by a verbose logger surfaced as the "Algorithm log" in the result dialog.

## Developer Notes

### Schema-first design

**`src/schema/rosterSchema.js` is the single source of truth** for YAML field names and configuration keys.

#### YAML_FIELDS

Maps YAML top-level keys to object access — always use it for top-level data:

```javascript
import { YAML_FIELDS } from './schema/rosterSchema'

const members = data[YAML_FIELDS.MEMBERS]
const period  = data[YAML_FIELDS.ROSTER_PERIOD]  // maps to data.roster (not 'roster_period')
```

Standard property access (`member.name`, `event.date`) is fine for nested fields.

#### Constraint & preference keys

```javascript
import { CONSTRAINT_KEYS, isConstraintEnabled } from './schema/rosterSchema'

if (isConstraintEnabled(rosterConstraints, CONSTRAINT_KEYS.ENFORCE_MEMBER_ROLES)) {
  // filter members by role
}
```

Value coercion is a small plain-JS map (`constraintCoercers`) in the same file — no schema library dependency.

### Validation

`src/validators.js` provides a `ValidationBuilder` and a set of validator functions (structure, members, roles, dates, roster period, member constraints) returning `{ errors, warnings }`. Run them all with `runAllValidators(data)`.

### YAML structure reference

[`public/sample.yaml`](public/sample.yaml) is the **canonical, always-valid example** of the input schema: it must parse and pass `runAllValidators` with no errors, and it demonstrates every supported field (including the object-form `roles` and the understudy flag). Keep it in sync when the schema changes — see the [Design Decision on the sample document](#sampleyaml-is-the-canonical-valid-schema-example).

Member `roles` entries are objects (`- name: <role>`); a plain string (`- lead`) is still accepted for backward compatibility, but new documents and the sample should use the object form. Add `understudy: true` to flag a role the member is training for.

The expected format (see [`public/sample.yaml`](public/sample.yaml)):

```yaml
roster:                      # Date range — NOT 'roster_period'
  start_date: "2026-02-01"
  end_date: "2026-03-31"

roles:                       # Roles defined per roster (data, not defaults)
  - name: "lead"

members:                     # Team members
  - id: "member-1"
    name: "Alice"
    roles:                   # each entry is an object with a `name`
      - name: "lead"         # a role the member can fully perform
      - name: "support"
        understudy: true     # optional: training for `support` (see Understudy feature)
    include: true            # include in automatic generation
    telegram: "@alice"

events:                      # Events with roster slots
  - date: "2026-02-07"
    day_of_week: "Saturday"
    roster:
      - role: "lead"
        member_id:           # empty = unassigned, will be filled
      - role: "support"
        member_id: "member-1"  # pre-assigned, won't change

member_constraints:          # Member unavailability
  - member_id: "member-1"
    unavailable_dates: ["2026-02-15"]

member_preferences:          # Member day/role preferences
  - member_id: "member-1"
    days: ["Sunday"]
```

`roster_constraints` and `roster_preferences` are **optional** — sensible defaults come from `src/config/rosterDefaults.js`. Include them only to override a default, e.g.:

```yaml
roster_constraints:
  MAX_ASSIGNMENTS_PER_MONTH: 3
roster_preferences:
  AVOID_CONSECUTIVE_WEEKS: false
```

## Developer Workflow

### Adding a constraint/preference

1. **Schema**: add to `CONSTRAINT_KEYS` / `PREFERENCE_KEYS` with metadata in `rosterSchema.js`.
2. **Default**: set its default in `src/config/rosterDefaults.js`.
3. **Logic**: implement in `eligibilityChecker.js` (hard) or `scoringEngine.js` (soft).
4. **Validation**: add a check in `assignmentValidator.js` if needed.
5. **Tests**: write tests using the schema constants.
6. **Docs**: update this README and `public/sample.yaml`. If the change makes or reverses a design decision, record it under [Design Decisions](#design-decisions-binding-spec) — this is required, not optional (see [`AGENTS.md`](AGENTS.md)).

### Testing

- Test files cover validators, generation, constraints, derived state, and stats.
- Always use schema constants in test data.
- Run a specific file: `npm test <filename>`.
- Coverage: `npm run test:coverage`.
