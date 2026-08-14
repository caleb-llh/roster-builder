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

## Determinism

Generation is deterministic: a fixed seed drives all tie-breaks (`rng.js`). Every decision is captured by a verbose logger surfaced as the "Algorithm log" in the result dialog.
