# Specs — the binding specification

This folder is the **binding specification** for Roster Builder. It records the
non-obvious behaviour of the system and, crucially, *why* it works the way it
does, so that future changes don't silently regress a decision that was made
deliberately.

> **Changing any behaviour described here requires updating the relevant spec
> file in the same change.** This is not optional — see [`../AGENTS.md`](../AGENTS.md)
> for the mandatory feedback loop (code → tests → spec → verify).

The spec is authoritative. When code and a spec disagree, that is a bug in one
of them — reconcile it, don't ignore it. Before changing generation,
eligibility, scoring, the data structure, the draft/commit model, or the
understudy feature, re-read the relevant file below.

## Map

| File | Covers |
| --- | --- |
| [architecture.md](architecture.md) | System architecture and **off-repo context** you can't learn from the code alone: the dual-mode data layer, the provider contract, the Supabase **data model**, the **permissions model** (roles → client flags → RLS policies), OAuth setup, GitHub Pages deployment, the env-var mode switch, and a high-level generation-pipeline overview. |
| [data-layer.md](data-layer.md) | The `event.roster` positional-array data structure, the draft/commit model (separate from undo/redo history), inline change review, and why roster statistics are recomputed live rather than read from a generation snapshot. |
| [generation.md](generation.md) | The generation algorithm's binding rules: generated-vs-locked slots, "generation only fills empty slots" (default) + `optimizeExisting`, consecutive-weekend avoidance as a Phase-2 objective term, the removed availability scorer, and determinism. Scoring weights and internals live in [`../src/utils/rosterGenerator/README.md`](../src/utils/rosterGenerator/README.md). |
| [understudy.md](understudy.md) | The understudy/promotion feature end-to-end: the model, the two role-capability rules that must not be conflated, hard constraints, the promotion-aware seeding and backtracking-planner phases, and the manual-assignment/validation mirrors. |
| [design-system.md](design-system.md) | The look-and-feel spec: the `statsTheme.js` token module, the named z-index scale, the `HoverCard` popup primitive, sticky-chrome stacking, the colour policy, the no-emoji rule, and the UI's calibrated typographic decisions. |
| [events-ui.md](events-ui.md) | Events-view interaction spec: bulk-clear semantics + how select mode is entered, the three selection scales, why there's no drag-marquee, export column order, manual swap validation, and why generation runs immediately with no confirm gate/result modal. |

## How to read a Design Decision

Each entry states **what** the decision is and **why** — including the
rationale a naive alternative was rejected, and any invariant a past bug
revealed (e.g. "locked slots must never move"). Keep entries concise and link
to the code by name. Add a new entry when behaviour is non-obvious/surprising, a
magic number has a reason that must not be tuned away, a bug fix revealed an
invariant, or two similar-looking concepts must not be conflated.
