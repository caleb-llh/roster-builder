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
2. **Local search** — hill-climb by applying the best *improving* move (member↔member swap or empty-slot fill), each validated against hard constraints and applied reversibly, until no improving move remains. **Locked (pre-assigned) slots are never moved.**

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
- A slot with `isGenerated: true` was placed by the generator and may be freely moved/replaced.
- A slot that is **filled and *not* `isGenerated`** is a **manually pre-assigned ("locked") slot**. `RosterState.isLocked(slot)` identifies these.
- A generated slot may also be **pinned** (`slot._pinnedPromotion`) by the promotion-planning phase; pinned slots are treated as locked for the duration of the run (transient — stripped before results are returned).
- **Local search must never move a locked slot.** Phase 2 swap enumeration excludes locked slots (`slots.filter(s => getOccupant(s) && !isLocked(s))`). Pre-assigned members are respected as hard commitments.

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

Roster statistics — including the quality metrics (Shift Balance / `assignmentStdDev`, Time Spacing / `spreadStdDev`, the shift-distribution bell curve, and per-member workload) — are computed from the **current** roster state on every render by `calculateRosterStats(events, members, rosterPeriod)` (`rosterStats.js`). It builds a live `AssignmentTracker` from the present `events` so the fairness/spread formulas are identical to the generator's, and returns `fairnessMetrics` + `assignedRoles`. Rationale: previously the detailed quality metrics read from the frozen `generationResult` snapshot, so hand-edits/swaps left them **stale** while the summary numbers above them updated — an inconsistency. `generationResult` is now used **only** for genuinely generation-time artifacts: the unassignable-roles warning and the algorithm log. **Invariant: anything a user can change by editing the roster must be recomputed from `events`, not read from a generation snapshot.**

### Manual swap validation must ignore the slot each member is *leaving*

Manual drag-and-drop / swap validation lives in the pure `canSwapRosterSlots` helper (`constraintsUtils.js`), used by `handleSwapRosterSlots` in `App.jsx` and unit-tested directly. It checks, for each member landing in its new slot: role compatibility (full performer, or a promoted trainee for a real role), availability on the destination date, and once-per-event (no duplicate member in one event). The once-per-event check **must ignore the index each member is vacating within the event being checked**: for a same-event swap the two slots share one `roster` array, so testing memberA→slotB ignores `sourceIndex` and testing memberB→slotA ignores `targetIndex`; for a cross-event swap the incoming member vacates nothing in the destination event, so ignore nothing (`-1`). **Bug fixed:** a same-event, different-role swap (e.g. moving a member from `vm` to an empty `cam-1` in the same event) was rejected because the check ignored the *source* index for both members, so memberB (or the member's own still-present entry) tripped the duplicate clash. Extracting the logic into a tested pure helper locks this in.

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
