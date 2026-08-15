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
 │    └── rosters        (schedules; each still a JSONB document of events)
 │         └── events[].roster[] → { role, member_id, isGenerated }  (member_id → tenant member)
 └── tenant_users   (RBAC: which auth.users can administer this tenant/teams)
```

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
     live on `team_members`, **not** on the member. The tenant member carries
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
     "external load" input), because a single roster document no longer holds
     the whole picture. See [Generation impact](#feature-by-feature-impact-analysis).
   - **Cross-team clash detection.** Two teams scheduling the same member on the
     same **date** (later: date+time) is a clash. Detected at validation time
     (warn or block, configurable) using the tenant-wide assignment index.
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
| `tenant_users` | **RBAC** (replaces per-roster owner/editor/viewer as the *admin* unit) | `(tenant_id, user_id, role)` where role ∈ `owner/admin/editor/viewer`; a user can hold different roles in different tenants |
| `members` | tenant member registry (people) | `id, tenant_id, name, telegram, avatar, claimed_user_id → auth.users` (nullable — onboarding "claim" links identity) |
| `member_constraints` | **global** per-member unavailability | `(member_id)` → date list/ranges; tenant-scoped |
| `teams` | scheduling unit | `id, tenant_id, name, colour/gradient` |
| `team_members` | who's on a team + capability **on that team** | `(team_id, member_id, roles jsonb, understudy_for jsonb, include bool)` |
| `rosters` | schedule document (existing) | **gains `team_id`**; RBAC moves from `roster_members` to `tenant_users` (+ optional team scoping); keeps `document jsonb` |
| `roster_invites` | invite by email | re-scoped to **tenant** (invite a person to the org), team assignment separate |

**RBAC redesign.** The current `roster_members` + owner-guarded RPCs
([architecture.md](architecture.md) "Permissions model") move **up to the
tenant**: `tenant_users` is the authority; the `is_roster_member` /
`roster_role_of` `SECURITY DEFINER` helpers become `is_tenant_member(tenant)` /
`tenant_role_of(tenant)`, and roster/team RLS policies resolve the tenant from
`rosters.team_id → teams.tenant_id`. This preserves the load-bearing invariant
that **the database is the real authority and client flags are UI-only**. An
optional finer grain (per-team editor) can be layered later without changing the
seam.

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
- **New optional inputs** thread through as *additions*, defaulting to
  empty/no-op so all existing tests pass unchanged:
  - `externalLoad`: per-member counts/dates of assignments in *other* teams'
    rosters (for cross-team caps).
  - `externalAssignments`: per-date member index across teams (for clash
    detection).

  These are read-only and only consulted when the corresponding constraint is
  enabled, so single-team behaviour is byte-for-byte identical.

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
   *inputs* grow (`externalLoad`, `externalAssignments`) and only when
   cross-team caps/clash constraints are on. Determinism (seeded) is preserved
   because external inputs are read-only snapshots. Understudy capability stays
   per-team (`team_members.roles`/`understudy_for`). **Invariant to keep:**
   locked/pre-existing slots never move, still true.

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

## Open questions (defer, not blocking the model)

- **Team-scoped editors** (a user who edits Team A only) — the model allows it
  (`tenant_users.role` + optional `team_editors`), but Phase 3 can ship
  tenant-wide roles first.
- **Clash granularity**: date-only now; date+`reporting_time` later (needs a
  normalized time on events).
- **Cross-tenant members** (same human in two orgs) — explicitly *out*: a
  member belongs to exactly one tenant; two orgs = two member rows.
- **Versioning**: modelling roster *versions* as sibling rosters of a team is
  compatible with this design but specified separately.

## Phased delivery

Design is complete now; delivery is sequenced so each phase is shippable and
keeps `npx vitest run` + `npm run build` green.

- **Phase 0 — types & seam (no behaviour change).** Introduce the resolved
  derived-state as the single contract; add the empty/no-op `externalLoad` /
  `externalAssignments` inputs to the engine/validator with defaults, and tests
  proving single-team behaviour is unchanged.
- **Phase 1 — local model.** New nested YAML shape + `getDerivedState`
  resolver + updated `sample.yaml`; MembersView split (registry vs. team
  membership); global unavailability; team selector above roster selector.
  Cross-team clash/caps computed locally across the in-memory tenant.
- **Phase 2 — cross-team constraints.** New constraint keys + merge chain +
  clash/cap enforcement wired into generation, swap validation and stats, with
  tests.
- **Phase 3 — production (Supabase).** `0004_tenants_teams.sql` (tables, RLS
  re-scoped to tenant, RPCs, backfill migration), provider join to the resolved
  shape, tenant/team admin UI. Update `architecture.md` data-model + permissions
  sections in the same change.

Each phase updates the relevant binding spec files and this file's status per
[`../AGENTS.md`](../AGENTS.md).