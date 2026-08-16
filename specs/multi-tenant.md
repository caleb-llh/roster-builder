# Multi-tenant, teams & cross-team members — design plan (not yet built)

> **Status: PLANNING.** This file is the agreed target design and impact
> analysis for introducing a **tenant → team → roster** hierarchy with a
> **tenant-level member registry** and **cross-team-aware constraints**. Nothing
> here is implemented yet. It is binding *as a plan*: when a phase lands, move
> its decisions into the relevant spec ([architecture](architecture.md),
> [data-layer](data-layer.md), [generation](generation.md)) and update this file's
> status. Sequencing is deliberate — see [Phased delivery](#phased-delivery).

## Why this change

Today a **roster row = the whole document = the RBAC unit** (owner/editor/viewer
live on `roster_members`, keyed by `roster_id`). Members, roles, constraints and
events are all embedded in that one JSONB `document`
([architecture.md](architecture.md) "Data model"). That model cannot express:

- one organisation ("tenant") running **many teams**, each with its own
  schedule, under shared administration and billing;
- a **person who serves on multiple teams** as a single identity (so their
  availability and workload are one truth, not per-document copies);
- **constraints that span teams** ("Alice is away 3/5" must block *every* team;
  a monthly cap should count her shifts *across* teams; two teams must not
  double-book her on the same day).

## Target model

Three levels, plus a first-class member registry that is **not** owned by any
single roster:

```
tenant (org)
 ├── members        (registry: the PEOPLE — identity, global constraints)
 ├── teams
 │    ├── team_members   (which people are on this team + their roles ON this team)
 │    ├── bots           (future: team-tied bots, e.g. Telegram)        ── governance
 │    ├── reminders      (future: team-tied reminder config/cadence)    ── governance
 │    └── rosters        (schedules; each still a JSONB document of events)
 │         └── events[].roster[] → { role, member_id, isGenerated }  (member_id → tenant member)
 └── tenant_users   (RBAC: which auth.users can administer this tenant/teams)
```

**Bots and reminders are team-scoped and governed as configuration** (managed by
`owner`/`admin` — see [permissions.md](permissions.md#target-model-planned-tenant-scoped--not-yet-built)).
They are listed here as future nodes of the scope tree so the permission targets
(`team:manage-bots`, `team:manage-reminders`) have a home; their data shape is
specified when built.

### Design decisions

1. **Tenant is the isolation + billing boundary; team is the scheduling unit;
   roster is a schedule a team produces.** A team can have **many rosters**
   (e.g. one per quarter, or draft variants) — we keep `roster` as the
   document so the existing draft/commit, undo/redo, diff, stats and generation
   machinery keep working *unchanged per roster*. We deliberately did **not**
   collapse "team = roster": teams are long-lived and own membership/roles;
   rosters are disposable schedules. This also leaves room for the
   multi-version idea in `todo.md` (versions = sibling rosters of a team).

2. **Members are tenant-level entities with a stable id.** A member row
   `{ id, tenant_id, name, telegram, avatar?, claimed_user_id? }` exists once
   per person per tenant. Teams reference members via `team_members
   (team_id, member_id, roles[], understudy_for[], include)`. A roster document
   embeds **only assignments** (`member_id`), never the member's profile. This
   is what makes a person cross-team: they are one `members` row referenced by
   many `team_members` rows.
   - **Rationale (rejected alternative):** keeping members embedded per document
     and "emulating" cross-team by copying the member into each document (ids
     matching) was rejected — the copies drift (constraints edited on one team
     don't propagate), and cross-team caps/clash detection become impossible
     because there is no shared identity to aggregate over.
   - **Role capability is per-team.** "Alice can lead" may be true on Team A and
     not Team B (different role catalogs). Therefore `roles`/`understudyFor`
     live on `team_members`, **not** on the member. Only the understudy
     *declaration* is team config this way; understudy **progress and promotion
     are roster-specific and derived** — see
     [understudy.md](understudy.md#scope-what-is-team-level-vs-roster-level) for
     the three-way split. The tenant member carries
     only identity + *global* attributes (see constraints below). The generator
     and eligibility checks continue to receive a **per-team resolved member
     list** shaped exactly like today's normalized member
     (`{ id, name, roles[], understudyFor[], include }`) — see
     [Compatibility seam](#compatibility-seam).

3. **Roles are per-team.** Each team owns its `roles` catalog (the existing
   top-level `roles`). Two teams may share role *names* by coincidence; they are
   not the same role. Understudy-role derivation (`isUnderstudyRole`) is
   unchanged within a team.

4. **Constraints are cross-team aware in four concrete ways** (all four were
   requested):
   - **Global unavailability.** `member.unavailable_dates` moves to the
     **tenant member** (one calendar per person). Every team/roster that
     references the member sees the same unavailability. `isMemberUnavailable`
     keeps its signature but is fed the member's global constraint list.
   - **Cross-team load caps.** `MAX_ASSIGNMENTS_PER_MONTH` (and once-per-week)
     may be evaluated over the member's assignments **summed across all teams**
     in the tenant, not just the current roster. This requires the generator /
     validator to see the member's *other* current assignments (a read-only
     cross-team **assignments** snapshot); the count itself is **derived** from
     that snapshot, not passed separately — see
     [Compatibility seam](#compatibility-seam-how-we-avoid-rewriting-the-engine).
   - **Cross-team clash detection.** Two teams scheduling the same member on an
     overlapping **time range** (see the datetime-range model in
     [data-layer.md](data-layer.md)) is a clash. Detected at validation time
     (warn or block, configurable) using the tenant-wide assignment index. The
     clash rule is interval-overlap, which subsumes the date-equality behaviour
     used before datetime ranges landed.
   - **Per-team overrides.** Team-level `roster_constraints` /
     `roster_preferences` override tenant defaults, exactly as roster-level
     overrides tenant/source defaults today (`getDerivedState` already merges
     `DEFAULT → document`; we add a `tenant → team → roster` merge chain).

5. **The document keeps its atomic draft/commit contract.** Per
   [data-layer.md](data-layer.md), a roster is edited as one draft and published
   atomically. That stays true **per roster**. Cross-team reads (external load,
   clashes) are **read-only inputs** to that roster's generation/validation;
   they never make one roster's Save mutate another roster.

## Data-model changes (Supabase, Phase 3)

New/changed tables (all RLS-scoped to the tenant):

| Table | Purpose | Notes |
| --- | --- | --- |
| `tenants` | org boundary | `id, name, created_at` |
| `tenant_users` | **RBAC** (replaces the per-roster owner/editor/viewer grant) | `(tenant_id, user_id, role)` where role ∈ `owner/admin/viewer` (governance roles; `self` is an orthogonal automatic relation, not stored here — see [permissions.md](permissions.md#target-model-planned-tenant-scoped--not-yet-built)); a user can hold different roles in different tenants |
| `members` | tenant member registry (people) | `id, tenant_id, name, telegram, avatar, claimed_user_id → auth.users` (nullable — onboarding "claim" links identity) |
| `member_constraints` | **global** per-member unavailability | `(member_id)` → date list/ranges; tenant-scoped |
| `teams` | scheduling unit | `id, tenant_id, name, colour/gradient` |
| `team_members` | who's on a team + capability **on that team** | `(team_id, member_id, roles jsonb, understudy_for jsonb, include bool)` |
| `rosters` | schedule document (existing) | **gains `team_id`**; RBAC moves from `roster_members` to `tenant_users` (+ optional team scoping); keeps `document jsonb` |
| `roster_invites` | invite by email | re-scoped to **tenant** (invite a person to the org), team assignment separate |

**RBAC redesign.** The authorization model (permission-roles, the tenant-scoped
grant, the `self` relation, and the action matrix) is specified in its own file:
**[permissions.md](permissions.md#target-model-planned-tenant-scoped--not-yet-built)**.
In storage terms this file only records the *table* change: the current
`roster_members` + owner-guarded RPCs move **up to the tenant** — `tenant_users`
becomes the authority, and the `is_roster_member` / `roster_role_of`
`SECURITY DEFINER` helpers become `is_tenant_member(tenant)` /
`tenant_role_of(tenant)`, with roster/team RLS resolving the tenant from
`rosters.team_id → teams.tenant_id`. This preserves the load-bearing invariant
that **the database is the real authority and client flags are UI-only**. Also
note the **permission-role vs. team-role** split (see permissions.md): the
`team_members.roles` column is *schedulable capability*, never governance.

**Migration.** A new migration `0004_tenants_teams.sql` creates the tables and a
**backfill**: for each existing `rosters` row, create a tenant (owner = current
`owner_id`), a default team, hoist the document's embedded `members` into
`members` + `team_members`, hoist `member_constraints` to global, and rewrite
`document` to drop the member registry (keeping `events`, `roles`,
`roster_*`). `sample.yaml` and the JSONB shape both change → update in the same
change (feedback loop). Because ids inside `events[].roster[].member_id` are
preserved, assignments survive the hoist.

## Compatibility seam (how we avoid rewriting the engine)

The generator, eligibility checker, validators, stats, diff and the whole
`utils/` layer currently consume a **derived state** from one document
(`getDerivedState` → `{ members, events, roles, memberConstraints, … }`). We
keep that contract. The change is *where the pieces come from*:

- `getDerivedState` (local/YAML) learns to read the new nested shape and
  **resolve a single team's members** by joining `members` + `team_members`
  into today's normalized member objects (`{ id, name, roles, understudyFor,
  include }`), with `memberConstraints` pulled from the global member calendar.
- The Supabase provider does the same join server-side / in the loader and hands
  the engine the identical resolved shape.
- **One new optional input** threads through as an *addition*, defaulting to
  empty/no-op so all existing tests pass unchanged:
  - `externalAssignments`: a read-only snapshot of each member's assignments in
    *other* teams' rosters (`{ memberId: [dateOrDatetime, …] }`). It is the
    **single cross-team primitive** and drives both cross-team rules:
    - **clash detection** — interval-overlap between an external range and a
      candidate slot's range (see the datetime-range model in
      [data-layer.md](data-layer.md));
    - **cross-team caps** — the monthly/weekly/total "load" is *derived* by the
      same rollup `AssignmentTracker` already applies to local assignments. We do
      **not** pass a separate precomputed `externalLoad`: a stored count would be
      a second source of truth that can drift from the assignments it summarises
      (`externalLoad = fold(externalAssignments)`, a function, not an input).

  It is read-only and only consulted when the corresponding constraint is
  enabled, so single-team behaviour is byte-for-byte identical.

  > **Load derives from assignments (Design Decision).** Both intra-team and
  > cross-team, the **assignment list is the only source of truth** and every
  > count (`total`/`byMonth`/`byWeek`) is a fold over it — exactly what
  > `AssignmentTracker` does today. So the seam exposes assignments, not counts.

**Which teams count where (Design Decision).** The two cross-team rules use
cross-team data *asymmetrically*, on purpose:

- **Hard caps and clash are person-global** — `MAX_ASSIGNMENTS_PER_MONTH`,
  once-per-week, and same-time clash count **local + external**. Burnout and
  physical availability are properties of the *person*, not the team, so a
  member on three teams must not quietly get 3× the load or be double-booked.
- **Soft fairness stays team-local** — the `fairness` scorer (and spread /
  diversity) rank within the *current* team only. A member who is busy elsewhere
  but light here should not be artificially de-prioritised on this team; keeping
  optimisation team-local preserves team autonomy. The rule of thumb:
  **feasibility and burnout are global; optimisation quality is team-local.**

**Testing the seam (the acceptance test).** The strongest correctness signal is
that **every existing generator / `derivedState` / stats / validator test passes
unchanged** after the entity model lands — that proves the resolved shape is
truly identical to today's. So the seam's tests are: (1) keep the current suite
green with `externalAssignments` defaulting to no-op; (2) add
`getDerivedState` cases asserting a `members` + `team_members` join resolves to
the same `{ id, name, roles, understudyFor, include }` shape, that one member on
two teams resolves to different per-team `roles`, and that global
`member_constraints` flow in regardless of team. (Authorization is tested
separately — see
[permissions.md](permissions.md#testing-two-levels-mirroring-the-two-layer-authority).)

## Feature-by-feature impact analysis

Ordered by how much each is affected.

1. **Data layer / providers** (`architecture.md`, `data-layer.md`) — **high.**
   Contract gains a `tenant`/`team`/`activeTeamId` selection layer above
   `activeRosterId` (rosters are now listed *within a team*). `rosters` list
   becomes team-scoped; add `teams` list and `members` (registry) CRUD.
   Draft/commit/undo/diff per roster are **unchanged**.

2. **RBAC / RLS / admin RPCs** (`architecture.md` "Permissions model") —
   **high.** Authority moves to `tenant_users`; all owner-guarded RPCs re-scope
   to tenant; `AdminModal` becomes tenant/team management (members registry,
   team assignment, roles). Invites become tenant invites.

3. **Members UI** (`MembersView`) — **high.** Splits into *tenant registry*
   (identity, global unavailability, avatar, claim status) vs. *team membership*
   (capabilities/roles on this team, include flag). A member card shows which
   **other teams** they serve (cross-team visibility) and surfaces global
   unavailability.

4. **Generation & eligibility** (`generation.md`, `understudy.md`) — **medium.**
   Engine still runs **per roster/team** on the resolved member list; only the
   *input* grows (`externalAssignments`) and only when cross-team caps/clash
   constraints are on. Determinism (seeded) is preserved
   because external inputs are read-only snapshots. Understudy *capability
   declaration* stays per-team (`team_members.roles`/`understudy_for`), while
   understudy progress/seeding/promotion stay roster-specific and derived
   ([understudy.md](understudy.md#scope-what-is-team-level-vs-roster-level)).
   **Invariant to keep:** locked/pre-existing slots never move, still true.

5. **Constraints & validation** (`constraintsUtils`, `assignmentValidator`,
   `rosterSchema`) — **medium.** `isMemberUnavailable` fed the global calendar;
   `canSwapRosterSlots` and the manual-assignment picker gain an optional
   cross-team clash check; add tenant→team→roster constraint merge; new
   constraint keys: `ENFORCE_CROSS_TEAM_CAPS`, `WARN_CROSS_TEAM_CLASH` (or
   `ENFORCE_`), with sensible defaults (clash = warn, caps = off) so existing
   single-team rosters are unaffected.

6. **Roster statistics & availability heatmap** (`data-layer.md`,
   `events-ui.md`) — **medium.** Everything stays real-time and per roster.
   *New optional* views: a member's **cross-team load** (shifts across all
   teams) and clashes highlighted. The availability heatmap's "available"
   already means role-capable-AND-free; global unavailability flows in for free
   via the shared calendar. Optional future: tenant-level "who's overloaded
   across teams".

7. **Events UI / export** (`events-ui.md`, `data-layer.md`) — **low.**
   `event.roster` positional-array structure and export column layout are
   unchanged (still per roster). Clash badges are additive.

8. **Onboarding / bots / calendar** (`todo.md` backlog) — **enabled, not
   required now.** Tenant/team/member identity + `claimed_user_id` is the
   foundation the member-claim flow, per-team Telegram bot, team colour, and
   Google Calendar sync were waiting on. Out of scope for the first phases but
   the model is designed to accommodate them.

9. **Local YAML mode** (`data-layer.md`, `sample.yaml`) — **medium.** YAML gains
   a nested shape: top-level `tenant`/`members` (registry with global
   `unavailable_dates`) and `teams: [{ name, roles, members: [{ member_id,
   roles, include }], rosters: [{ start/end, events, roster_constraints }] }]`.
   Per `todo.md` "yaml only for local", production won't ingest YAML — but the
   **resolved derived-state shape stays identical** across modes, which is the
   point of the seam.

## Ratified decisions (review)

- **Governance roles this phase: `owner` / `admin` / `viewer`** (the `editor`
  role was dropped; member-only rights come from the orthogonal automatic `self`
  relation, and members can self-assign). See
  [permissions.md](permissions.md#target-model-planned-tenant-scoped--not-yet-built)
  for the axes, the action matrix, and the future owner-configurable defaults.
- **Team-roles / member capabilities are admin-managed**, never self-granted —
  the concrete encoding of the permission-role vs. team-role split.
- **Reviewed-publish UX is preserved under normalization.** The member registry
  and `team_members` become normalized rows, but edits to them are **staged as a
  draft and committed in one transaction** (one reviewed publish), rather than
  writing each row immediately. This keeps the [data-layer.md](data-layer.md)
  draft/commit contract's *feel* (edit → review → publish atomically) even though
  the underlying storage is rows, not a single JSONB blob. Rosters keep their
  JSONB document + existing per-roster draft/commit unchanged (Design Decision 5).
- **JSONB → normalized backfill is approved.** The `0004_tenants_teams.sql`
  migration includes the one-off backfill (below) from existing JSONB rosters
  into the normalized tenant/team/member tables before production flips over.

## Open questions (defer, not blocking the model)

- **Team-scoped governance** (a user who is `admin` of Team A only) — the model
  allows it (`tenant_users.role` + optional per-team scoping), but the first
  phase can ship tenant-wide roles first.
- **Tenant-level read-only `viewer`** vs. per-team-only viewer — deferred (also
  tracked in permissions.md).
- **Clash granularity**: date-only now; date+`reporting_time` later (needs a
  normalized time on events).
- **Cross-tenant members** (same human in two orgs) — explicitly *out*: a
  member belongs to exactly one tenant; two orgs = two member rows.
- **Versioning**: modelling roster *versions* as sibling rosters of a team is
  compatible with this design but specified separately.

## Phased delivery

Design is complete now; delivery is sequenced so each phase is shippable and
keeps `npx vitest run` + `npm run build` green.

- **Phase 0 — types & seam (no behaviour change). ✅ Landed.** The resolved
  derived-state is now the single contract via `resolveDerivedState(data,
  { externalAssignments })` in
  [`derivedState.js`](../src/utils/derivedState.js) — a single-team identity pass
  over `getDerivedState` plus the empty/no-op cross-team assignments snapshot.
  `generateRoster` threads `externalAssignments` (defaulting `{}`) into the
  `EligibilityChecker`, which stores it unused until Phase 2. `externalLoad` is
  deliberately *not* an input — load derives from the assignments snapshot. Tests
  lock in the no-op: the full suite stays green, `resolveDerivedState` is proven
  identical to `getDerivedState`, and an empty `externalAssignments` produces
  byte-for-byte identical generator output.
- **Datetime-range model (prerequisite for Phase 2 clash).** Move events and
  blockouts from date-granular to datetime ranges so same-day non-overlapping
  events don't clash and clash becomes interval-overlap — its own tracked change,
  owned by [data-layer.md](data-layer.md). Land it before Phase 2 so the
  cross-team clash rule is written once against intervals.
- **Phase 1 — local model.** New nested YAML shape + `getDerivedState`
  resolver + updated `sample.yaml`; MembersView split (registry vs. team
  membership); global unavailability; team selector above roster selector.
  Cross-team clash/caps computed locally across the in-memory tenant.
- **Phase 2 — cross-team constraints.** New constraint keys + merge chain +
  clash/cap enforcement wired into generation, swap validation and stats, with
  tests.
- **Phase 3 — production (Supabase).** `0004_tenants_teams.sql` (tables, RLS
  re-scoped to tenant, RPCs, backfill migration), provider join to the resolved
  shape, tenant/team admin UI. **RLS/RPC tests run against the local Supabase
  stack** (`supabase start` + `supabase db reset`), preferably in pgTAP — see
  [permissions.md](permissions.md#testing-two-levels-mirroring-the-two-layer-authority).
  Update `architecture.md` data-model + permissions sections in the same change.

Each phase updates the relevant binding spec files and this file's status per
[`../AGENTS.md`](../AGENTS.md).