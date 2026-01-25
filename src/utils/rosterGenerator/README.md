# Roster Generator

Automated roster generation algorithm that fills unassigned roles while maximizing fairness and honoring constraints and preferences.

## Architecture

The roster generator uses a **modular greedy algorithm** with weighted scoring:

```
src/utils/rosterGenerator/
├── index.js                 # Main algorithm entry point
├── assignmentTracker.js     # Tracks assignment state
├── eligibilityChecker.js    # Validates hard constraints
├── scoringEngine.js         # Scores members on preferences
└── rosterGenerator.test.js  # Comprehensive test suite
```

## Algorithm Flow

1. **Initialize Tracking** - Load existing assignments into tracker
2. **Process Chronologically** - Sort events by date
3. **For Each Unassigned Role**:
   - Find eligible members (hard constraints)
   - Score eligible members (soft preferences)
   - Assign best-scored member
   - Update tracking state

## Components

### AssignmentTracker
Maintains state during generation:
- Total assignments per member
- Assignments by month, week, day
- Assignment dates for temporal analysis
- Fairness metrics (standard deviation)
- Spread metrics (temporal distribution)

### EligibilityChecker
Validates hard constraints (must satisfy):
- `ENFORCE_MEMBER_ROLES` - Role compatibility
- `ENFORCE_MEMBER_AVAILABILITY` - Unavailable dates
- `ONLY_ONCE_PER_EVENT` - No duplicate assignments per event
- `ONLY_ONCE_PER_WEEK` - Max one assignment per week (Monday-Sunday)
- `MAX_ASSIGNMENTS_PER_MONTH` - Monthly assignment limit

### ScoringEngine
Scores based on soft preferences (optimize for):

| Factor | Weight | Description |
|--------|--------|-------------|
| **Fairness** | 100 | Prefer members with fewer total assignments |
| **Spread** | 50 | Prefer longer gaps since last assignment |
| **Day Preference** | 30 | Match member's preferred days |
| **Day Balance** | 20 | Balance assignments across different days for member |
| **Consecutive Weekends** | 40 | Avoid back-to-back weekends |

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

### Preview Generation

Preview without modifying data:

```javascript
import { previewRosterGeneration } from './utils/rosterGenerator'

const preview = previewRosterGeneration(/* same params */)

console.log(preview.stats)
console.log(preview.canGenerate)
console.log(preview.warnings)  // Unassignable roles
```

## Configuration

### Scoring Weights

Adjust in `scoringEngine.js`:

```javascript
this.weights = {
  fairness: 100,              // Workload balance
  spread: 50,                 // Temporal distribution
  dayPreference: 30,          // Member preferences
  dayBalance: 20,             // Day variety per member
  consecutiveWeekends: 40     // Weekend spacing
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
2. **New Preferences** - Add scoring factor to `scoringEngine.js`
3. **Advanced Algorithms** - Replace greedy with backtracking/annealing
4. **Custom Metrics** - Extend `assignmentTracker.js`

## Performance

- **Time Complexity**: O(E × R × M) where E=events, R=roles, M=members
- **Space Complexity**: O(M + E)
- Typical generation: <100ms for 20 events, 15 members

## Future Enhancements

- Backtracking for optimal solutions
- Simulated annealing for complex constraints
- Multi-objective optimization
- Machine learning for preference learning
- Configurable weight tuning UI
