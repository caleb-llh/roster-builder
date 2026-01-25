# Roster Builder v2

Automated roster scheduling system that assigns team members to events while respecting hard constraints and optimizing for fairness preferences.

## Tech Stack

- **Frontend**: React 18 + Vite 5
- **Styling**: Tailwind CSS 3
- **Testing**: Vitest + jsdom
- **Data**: YAML (js-yaml), URL state (lz-string), localStorage
- **Editor**: CodeMirror for YAML editing

## Quick Start

```bash
npm install                # Install dependencies
npm run dev                # Dev server → localhost:5173
npm test                   # Run tests (190 passing)
npm run test:coverage      # Coverage report
npm run build              # Production build
```

## Architecture


### Data Flow

```
YAML Input → Validation → State Management → Generation → UI/Export
     ↓           ↓              ↓                  ↓          ↓
  js-yaml    validators    useRosterData    rosterGenerator   URL/localStorage
                              ↓
                         getDerivedState (uses YAML_FIELDS)
```

**YAML_FIELDS Role**: The schema's `YAML_FIELDS` constants map YAML top-level keys to JavaScript object access. This is the **single source of truth** for YAML structure throughout the entire codebase:
- ✅ **Parsing**: Used in `getDerivedState()` to extract data from parsed YAML
- ✅ **Consistency**: Ensures all code references the same field names
- ✅ **Refactoring**: Change the YAML structure in one place

**Example**:
```javascript
// YAML file uses:           // Schema defines:
roster:                       YAML_FIELDS.ROSTER_PERIOD: 'roster'
  start_date: "2026-02-01"   
  end_date: "2026-02-28"

// Code uses schema:
const period = data[YAML_FIELDS.ROSTER_PERIOD]  // Gets data.roster
```

### Generation Algorithm

**Greedy algorithm with weighted scoring**:

1. Load existing assignments into `AssignmentTracker` (tracks state per member/week/month)
2. Process events chronologically
3. For each unassigned role:
   - `EligibilityChecker`: Filter by hard constraints (must pass)
   - `ScoringEngine`: Score by soft preferences (fairness, spread, day prefs)
   - Assign best-scored member
   - Update tracker

**Hard Constraints**: Role qualification, availability, frequency limits
**Soft Preferences**: Fairness, assignment spread, consecutive weekends, day balance, role diversity

See `src/utils/rosterGenerator/README.md` for scoring weights and details.

### State Management

**`useRosterData` hook** centralizes all data operations:
- YAML parsing and validation
- Automatic persistence (URL state + localStorage)
- History management (undo/redo)
- Event updates and generation triggers

**Persistence strategy**:
- URL state for shareability (compressed with lz-string)
- localStorage for recovery across sessions
- History stack for undo functionality

## Developer Notes

### Schema-First Design

**`src/schema/rosterSchema.js` is the single source of truth** for all YAML field names and configuration constants.

#### YAML_FIELDS

Maps YAML top-level keys to their actual field names in the YAML file:

```javascript
export const YAML_FIELDS = {
  MEMBERS: 'members',
  EVENTS: 'events',  
  ROLES: 'roles',
  ROSTER_PERIOD: 'roster',              // YAML uses 'roster:', not 'roster_period:'
  ROSTER_CONSTRAINTS: 'roster_constraints',
  ROSTER_PREFERENCES: 'roster_preferences',
  MEMBER_PREFERENCES: 'member_preferences',
  MEMBER_CONSTRAINTS: 'member_constraints',
}
```

**Usage**: Always use `YAML_FIELDS` when accessing top-level YAML data:

```javascript
import { YAML_FIELDS, CONSTRAINT_KEYS } from './schema/rosterSchema'

// ✅ DO:
const members = data[YAML_FIELDS.MEMBERS]
const period = data[YAML_FIELDS.ROSTER_PERIOD]  // Correctly maps to data.roster

// ❌ DON'T:
const members = data['members']           // Hardcoded string
const period = data.roster               // Direct property access
```

**Why**: This enables:
- Single source of truth - change YAML structure in one place
- Safe refactoring - find all usages with IDE search
- Consistency - no typos or string mismatches

#### Constraint & Preference Keys

Define available constraints and preferences with metadata:

```javascript
import { CONSTRAINT_KEYS, PREFERENCE_KEYS, isConstraintEnabled } from './schema/rosterSchema'

// Check if constraint is enabled
if (isConstraintEnabled(rosterConstraints, CONSTRAINT_KEYS.ENFORCE_MEMBER_ROLES)) {
  // Filter members by role
}
```

**Note**: Standard object property access (e.g., `member.name`, `event.date`) is fine for nested fields. YAML_FIELDS is only for top-level YAML structure.

### YAML Structure Reference

The actual YAML format expected (see `public/sample.yaml`):

```yaml
roster:                      # Date range (start_date, end_date) - NOT 'roster_period'
  start_date: "2026-02-01"
  end_date: "2026-02-28"

roles:                       # Array of role definitions
  - name: "lead"

members:                     # Array of team members
  - id: "member-1"
    name: "Alice"
    roles: ["lead", "support"]
    active: true
    telegram: "@alice"

events:                      # Array of events with roster slots
  - date: "2026-02-07"
    day_of_week: "Saturday"
    roster:
      - role: "lead"
        member_id:           # null = unassigned, will be filled
      - role: "support"
        member_id: "member-1"  # Pre-assigned, won't change

roster_constraints:          # Hard rules (must satisfy)
  ENFORCE_MEMBER_ROLES: true
  ONLY_ONCE_PER_WEEK: true

roster_preferences:          # Soft goals (optimize for)
  SPREAD_ASSIGNMENTS: true
  AVOID_CONSECUTIVE_WEEKENDS: true

member_constraints:          # Member unavailability
  - member_id: "member-1"
    unavailable_dates: ["2026-02-15"]

member_preferences:          # Member day preferences  
  - member_id: "member-1"
    days: ["Sunday"]
    max_assignments: 2
```

**Key Mapping**: `YAML_FIELDS.ROSTER_PERIOD` → YAML's `roster:` field (not `roster_period:`)


## Developer Workflow

### Adding a Constraint/Preference

1. **Schema**: Add to `CONSTRAINT_KEYS`/`PREFERENCE_KEYS` with metadata
2. **Logic**: Implement in `eligibilityChecker.js` or `scoringEngine.js`
3. **Validation**: Add check in `assignmentValidator.js`
4. **Tests**: Write tests using schema constants
5. **Documentation**: Update README and sample.yaml.

### Testing

- Test files covering validators, generation, constraints, stats
- Always use schema constants in test data
- Run specific: `npm test <filename>`
- Coverage: `npm run test:coverage`
