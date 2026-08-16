# Generation algorithm (binding spec)

Binding rules for the roster generator. The **scoring weights and internal
mechanics** (seeding lookahead, the local-search move set, `evaluateState`
terms) live in [`../src/utils/rosterGenerator/README.md`](../src/utils/rosterGenerator/README.md);
the understudy/promotion phases have their own spec in
[understudy.md](understudy.md). A high-level pipeline overview is in
[architecture.md](architecture.md#generation-pipeline-overview).

## Generated vs. locked (pre-assigned) slots

- A slot with `isGenerated: true` was placed by the generator. Within the run that places it, it may be freely moved/replaced by local search — **but a slot that was *already* filled when the run started is locked by default** (see "Generation only fills empty slots" below), so re-running generate does not reshuffle prior work.
- A slot that is **filled and *not* `isGenerated`** is a **manually pre-assigned ("locked") slot**. `RosterState.isLocked(slot)` identifies these.
- A generated slot may also be **pinned** (`slot._pinnedPromotion`) by the promotion-planning phase; pinned slots are treated as locked for the duration of the run (transient — stripped before results are returned).
- **Local search must never move a locked slot.** Phase 2 swap enumeration excludes locked slots (`slots.filter(s => getOccupant(s) && !isLocked(s))`). Pre-assigned members are respected as hard commitments.

## Generation only fills empty slots (binding, default)

By default `generateRoster` is **additive**: it fills the empty slots and never reshuffles assignments that already exist — including ones an *earlier, still-uncommitted* generation produced. Rationale: a user reported "I only have 1 unfilled slot, and generating makes 8 unsaved changes." That was Phase 2 local search doing its job — re-optimizing the *whole* roster (fairness/spread/preferences) by swapping already-generated slots — but it is surprising and undesirable as a default: each generate should add to the roster, not churn what the user already has and is reviewing in the draft. **Mechanism:** before Phase 1, every slot occupied at run start is tagged `_preExisting` and `RosterState.isLocked` treats it as locked, so Phase 2 can only rearrange the slots *this* run filled. Manually pre-assigned slots were already locked (`!isGenerated`); this extends the same protection to prior *generated* slots. The tag is transient — stripped before results are returned (like `_pinnedPromotion`), so it never leaks into roster data. The whole-roster re-optimization is preserved behind an **`optimizeExisting` option** (default `false`), intended to become a user toggle on a future algorithm-settings page. Note this means generate cannot *improve* an already-full roster in the default mode — that is the deliberate trade for predictability.

## Consecutive-weekend avoidance is a Phase-2 objective term, not just a Phase-1 bias

`AVOID_CONSECUTIVE_WEEKS` is enforced in **two** places that must stay in sync: the per-candidate `consecutiveWeekends` scorer (weight `200`) that biases Phase-1 greedy construction, **and** the whole-roster objective `evaluateState` (`index.js`), which counts consecutive-weekend pairs across the roster (`countConsecutiveWeekendViolations`, weighted by `SCORING_WEIGHTS.consecutiveWeekends`, gated by the same preference). Rationale: Phase-2 local search only optimises what `evaluateState` measures. If a soft goal exists only as a Phase-1 scorer, a later swap can freely re-introduce the thing it was meant to avoid — exactly the trap that made the availability scorer useless (below). **Invariant: every soft goal that biases greedy scoring must also appear as a term in `evaluateState`, or local search can undo it.**

## Availability is a constraint, not an objective (removed scorer)

The `availability` scorer (which prioritized members with fewer available dates) was **removed**. It was a Phase-1 greedy heuristic that never appeared in the Phase-2 objective, so it couldn't survive local search and caused confusing workload imbalance. Availability is properly a **hard eligibility constraint** (`ENFORCE_MEMBER_AVAILABILITY`), not a fairness objective. Do not re-introduce it as a scorer.

## Hard constraints: one authority, three consumers (target — partly duplicated today)

The soft rules already have a single authority: the [`SCORERS`](../src/utils/rosterGenerator/scorers.js)
registry, consumed by **both** per-candidate scoring and the whole-roster
`evaluateState` objective, so they can't drift (see the consecutive-weekend
invariant above). **Hard constraints should follow the same shape but currently
do not.** Today the *same* hard rules are re-implemented in **three** places:

- **`EligibilityChecker.isEligible`** ([`eligibilityChecker.js`](../src/utils/rosterGenerator/eligibilityChecker.js)) — the generator's **predictive** question: *"**may** I place M here?"*
- **`validateEventAssignments`** ([`assignmentValidator.js`](../src/utils/assignmentValidator.js)) — the **diagnostic** question: *"is this **already-placed** assignment violating a rule?"*
- **`explainSwap`** ([`constraintsUtils.js`](../src/utils/constraintsUtils.js)) — the manual **feasibility subset**, predictive, both directions.

They mostly agree because they share low-level helpers (`constraintChecking.js`,
`understudy.js`), but the rules themselves (which checks run, in what order, with
what wording) are copied, and one difference is already implicit: the generator
uses `>= maxLimit` (predictive — "would this *reach* the cap") while the validator
uses `> maxLimit` (diagnostic — "has this *exceeded* the cap"). That difference is
**intentional**, but undocumented and easy to mistake for a bug.

**Design Decision — a single hard-constraint registry, three consumers.** Model
each hard constraint once as a descriptor (mirroring `SCORERS`), tagged by *when*
it applies, and let the three call sites be *consumers* of that one list rather
than re-owners of the rules:

- **`kind: 'feasibility'`** — physically impossible to violate: active/included,
  role capability, availability, same-event (later same-*time*) clash. Enforced
  by **all** consumers, including manual swap/self-assign.
- **`kind: 'load-cadence'`** — policy caps that a human may deliberately override:
  once-per-week, max-per-month, the understudy-before-role gate. Enforced by the
  **generator** and flagged by the **validator**, but **not** by manual swaps.
  This is why a manual swap enforces a *subset* — the subset is exactly the
  feasibility rules, by design, not an oversight
  ([permissions.md](permissions.md) leans on this for `roster:assign-self`).

The predictive-vs-diagnostic distinction (the `>=`/`>` above) is a property of
the **question the consumer asks**, not a per-copy detail: the registry runs in a
"would placing" mode for the generator/swap and an "is placed" mode for the
validator. **Invariant: a hard rule is defined once; generator, validator, and
swap ask the same rule set different questions. Adding/changing a constraint must
touch one descriptor, not three files.** Until the registry lands, the three
implementations must be kept in lock-step by hand — changing a rule in one
without the others is a spec regression.

**Registry shape (ratified).** Each constraint is one descriptor in a
`CONSTRAINTS` list (named to pair with `SCORERS`; "constraint" is already the
domain word — `rosterConstraints`, `CONSTRAINT_KEYS`):

```
{
  key,                       // stable id (also owns the violation code)
  kind,                      // 'feasibility' | 'load-cadence'
  enabled(ctx),              // reads the rosterConstraints flag
  check(placement, ctx, mode) => violation | null
}
```

- **One `check` + a `mode` flag**, `mode ∈ { 'would-place', 'is-placed' }`. The
  single line that differs for counting rules lives *inside* one function
  (`mode === 'would-place' ? count >= cap : count > cap`), so the two comparisons
  sit side by side and cannot drift. Feasibility rules ignore `mode`. Rejected
  "diagnostic-only + simulate placement": it would turn every candidate check in
  the O(slots²) hot loop into mutate→recompute→revert to answer what a read-only
  `>=` answers for free, and would force a whole-roster scan where the generator
  only needs a single-placement short-circuit.
- **Violations are structured, not prose.** `check` returns `null` or
  `{ code, params }` (e.g. `{ code: 'unavailable', memberId, date }`), and each
  **consumer formats its own sentence** — the swap toast, the validator line, and
  the log may word the same code differently, and codes stay i18n-ready. Today's
  `explainSwap` sentences become one formatter over these codes.
- **Two registries, not one.** `CONSTRAINTS` is pass/fail-with-a-reason (the
  hard-rule half of "eligibility & assignment policy"); `SCORERS` is weighted
  score (the soft half). Do **not** merge them — conflating a hard reject with a
  soft penalty is the mistake the removed `availability` scorer made (above).
- **Rollout is incremental.** Migrate one rule end-to-end first (`availability`:
  descriptor + all three consumers routed through it + tests), proving the seam,
  then port the rest; the old helper and the descriptor may co-exist briefly.

## Determinism

Generation is deterministic: a fixed seed drives all tie-breaks (`rng.js`). Every decision is captured by a verbose logger surfaced as the "Algorithm log" in the result dialog.
