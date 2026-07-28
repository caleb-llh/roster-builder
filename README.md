# Roster Builder v2

Automated roster scheduling that assigns team members to events while respecting hard constraints and optimizing for fairness preferences.

The same bundle runs in **two modes**, chosen at build time:

- **Local playground** (default): a login-free, in-memory YAML editor. Nothing is persisted; great for experimenting and for the public GitHub Pages deployment.
- **Production**: backed by [Supabase](https://supabase.com) with Google auth, a Postgres database, per-roster roles (RBAC), and an in-app admin flow. Enabled only when Supabase env vars are present.

Components never branch on the mode — they read data and call mutations through a uniform **provider contract** and gate UI on **permission flags**. See [Architecture](#architecture).

## Tech Stack

- **Frontend**: React 18 + Vite 5
- **Styling**: Tailwind CSS 3
- **Testing**: Vitest + jsdom (167 tests)
- **YAML**: js-yaml, with CodeMirror for editing
- **Backend (production mode)**: Supabase (Postgres + Row-Level Security + Auth)

## Quick Start

```bash
npm install                # Install dependencies
npm run dev                # Dev server → localhost:5173
npm test                   # Run tests (167 passing)
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
   providerContract  ← uniform shape: { data, permissions, role, rosters,
            │            importData, updateEvents, replaceData, undo, admin RPCs… }
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

**Greedy construction followed by local search:**

1. **Greedy** — score eligible members per slot (availability, fairness, spread, day prefs), assign the best with a seeded tie-break, apply via a reversible move layer.
2. **Local search** — hill-climb by applying the best *improving* move (member↔member swap or empty-slot fill), each validated against hard constraints and applied reversibly, until no improving move remains.

A fixed seed keeps generation deterministic. Every decision is captured by a verbose logger and surfaced as an "Algorithm log" in the result dialog.

See [`src/utils/rosterGenerator/README.md`](src/utils/rosterGenerator/README.md) for scoring weights and details.

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
    roles: ["lead", "support"]
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
6. **Docs**: update this README and `public/sample.yaml`.

### Testing

- Test files cover validators, generation, constraints, derived state, and stats.
- Always use schema constants in test data.
- Run a specific file: `npm test <filename>`.
- Coverage: `npm run test:coverage`.
