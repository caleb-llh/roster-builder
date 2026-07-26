# Roster Generator

Automated roster generation algorithm that fills unassigned roles while maximizing fairness and honoring constraints and preferences.

## Architecture

The roster generator uses **greedy construction followed by local search**, with
a pluggable weighted-scoring registry and reversible move primitives:

```
src/utils/rosterGenerator/
├── index.js                 # Main entry point (greedy init + local search + multi-start)
├── assignmentTracker.js     # Tracks assignment state (reversible: record/removeAssignment)
├── rosterState.js           # Reversible slot/move layer (applyMove/revertMove, applySwap)
├── eligibilityChecker.js    # Validates hard constraints
├── scorers.js               # Pluggable scorer registry + SCORING_WEIGHTS
├── scoringEngine.js         # Thin adapter that ranks candidates via scorers.js
├── localSearch.js           # Hill-climbing optimizer (swaps + fill-empty)
├── rng.js                   # Seeded PRNG (deterministic randomization)
├── actionLog.js             # Verbose action logger (result.log / logEntries)
└── rosterGenerator.test.js  # Comprehensive test suite
```

## Algorithm Flow

A single seeded pass (reproducible / deterministic):

1. **Initialize Tracking** - Load existing assignments into tracker
2. **Phase 1 — Greedy construction** (initial solution):
   - Sort events chronologically
   - For each unassigned role: find eligible members (hard constraints),
     score them (soft preferences, with a seeded tie-break shuffle), assign the
     best via the reversible move layer
3. **Phase 2 — Local search**: hill-climb by applying the single best *improving*
   move (member↔member swap, or filling an empty slot) until no improving move
   exists (or a safety iteration cap is hit). Every candidate is validated
   against hard constraints and applied reversibly.

Every decision is recorded by a verbose logger and returned as
`result.log` (text lines) and `result.logEntries` (structured) for debugging.

## Components

### AssignmentTracker
Maintains state during generation:
- Total assignments per member
- Assignments by month, week, day
- Assignment dates for temporal analysis
- Fairness metrics (standard deviation)
- Spread metrics (temporal distribution)
- `recordAssignment` / `removeAssignment` — exact inverses, enabling reversible moves

### RosterState
Reversible move layer pairing the events (source of truth) with the tracker
(derived counters), keeping them in lock-step:
- `applyMove` / `revertMove` — set/clear a slot's occupant; revert restores exactly
- `applySwap` / `revertSwap` — exchange two slots' occupants
- `allSlots`, `getOccupant` — enumeration/inspection for the search loop

### localSearch
Hill-climbing optimizer over `RosterState`. Enumerates candidate swaps and
fill-empty moves, validates each via the `EligibilityChecker`, and applies the
best positive-delta move each iteration. Objective supplied by the caller
(`evaluateState`, which reuses `SCORING_WEIGHTS`). Stops at a local optimum.

### EligibilityChecker
Validates hard constraints (must satisfy):
- `ENFORCE_MEMBER_ROLES` - Role compatibility
- `ENFORCE_MEMBER_AVAILABILITY` - Unavailable dates
- `ONLY_ONCE_PER_EVENT` - No duplicate assignments per event
- `ONLY_ONCE_PER_WEEK` - Max one assignment per week (Monday-Sunday)
- `MAX_ASSIGNMENTS_PER_MONTH` - Monthly assignment limit

### ScoringEngine
Scores based on soft preferences (optimize for). Weights live in a single
`SCORING_WEIGHTS` constant (defined in `scorers.js`, re-exported from
`scoringEngine.js`) and are reused by
the roster-quality evaluation so the two never drift apart:

| Factor | Weight | Description |
|--------|--------|-------------|
| **Fairness** | 300 | Prefer members with fewer total assignments |
| **Availability** | 300 | Prioritize members with fewer available dates |
| **Consecutive Weekends** | 200 | Avoid back-to-back weekends |
| **Day Preference** | 120 | Match member's preferred days |
| **Role Preference** | 120 | Match member's preferred roles |
| **Role Diversity** | 60 | Encourage variety of roles per member |
| **Spread** | 60 | Prefer longer gaps since last assignment |
| **Day Balance** | 60 | Balance assignments across different days for member |

## Usage

### Generate Roster

```javascript
import { generateRoster } from './utils/rosterGenerator'

const result = generateRoster(
  events,              // Events with roster assignments
  members,             // Available members
  memberConstraints,   // Member unavailability
  memberPreferences,   // Member day preferences
  rosterConstraints,   // Roster-level constraints
  rosterPreferences,   // Roster-level preferences
  rosterPeriod        // Start/end dates
)

// Result contains:
// - events: Updated events with new assignments
// - stats: Generation statistics
// - fairnessMetrics: Distribution analysis
```

## Configuration

### Scoring Weights

Adjust the exported `SCORING_WEIGHTS` in `scorers.js`:

```javascript
export const SCORING_WEIGHTS = {
  fairness: 300,
  availability: 300,
  consecutiveWeekends: 200,
  dayPreference: 120,
  rolePreference: 120,
  roleDiversity: 60,
  spread: 60,
  dayBalance: 60,
}
```

Higher weight = higher priority in scoring.

### Constraints

Configure in builder config YAML:

```yaml
roster_constraints:
  ENFORCE_MEMBER_ROLES: true
  ENFORCE_MEMBER_AVAILABILITY: true
  ONLY_ONCE_PER_EVENT: true
  ONLY_ONCE_PER_WEEK: true
  MAX_ASSIGNMENTS_PER_MONTH: 2

roster_preferences:
  AVOID_CONSECUTIVE_WEEKS: true
  BALANCED_DAY_DISTRIBUTION: true
  SPREAD_ASSIGNMENTS: true
```

## Statistics

Generation provides detailed metrics:

```javascript
result.stats = {
  totalRoles: 24,
  assignedRoles: 22,
  generatedAssignments: 15,
  unassignableRoles: [
    {
      event: "Sunday Service",
      date: "2026-02-15",
      role: "vm",
      reason: "No eligible members available"
    }
  ]
}

result.fairnessMetrics = {
  assignmentStdDev: 0.82,        // Lower = fairer
  spreadStdDev: 3.1,             // Lower = more even spread
  assignmentsByMember: { ... }   // Detailed breakdown
}
```

## Testing

Run comprehensive test suite:

```bash
npm test -- rosterGenerator
```

Tests cover:
- Basic generation and statistics
- All hard constraints
- Fairness distribution
- Preview mode
- Member preferences
- Edge cases

## Extension Points

The modular design allows easy extensions:

1. **New Constraints** - Add to `eligibilityChecker.js`
2. **New Preferences** - Append one entry to the `SCORERS` list in `scorers.js`
   (a `{ key, enabled, score }` descriptor); it is automatically used by both
   per-candidate scoring and roster-quality evaluation
3. **New Move Types** - Add to `localSearch.js` using the reversible primitives
   in `rosterState.js` (e.g. 3-way rotations, chain moves)
4. **Advanced Search** - Swap hill-climbing for simulated annealing by changing
   the acceptance rule in `optimizeRoster` (state is already reversible)
5. **Custom Metrics** - Extend `assignmentTracker.js`

## Performance

- **Greedy construction**: O(E × R × M) where E=events, R=roles, M=members
- **Local search**: each iteration scans O(slots²) swap candidates; runs until a
  local optimum (bounded by `maxIterations`)
- **Space Complexity**: O(M + E)

## Future Enhancements

- Simulated annealing / tabu search for escaping local optima
- User-facing swap suggestions (reuse `RosterState` + `EligibilityChecker`)
- Multi-objective optimization
- Configurable weight tuning UI
