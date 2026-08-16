/**
 * Hard-constraint registry — one authority, three consumers.
 *
 * Each constraint is a single descriptor; the generator (EligibilityChecker),
 * the validator (assignmentValidator), and manual swap/self-assign (explainSwap)
 * are *consumers* of this one list rather than re-owners of the rules. See the
 * "Hard constraints: one authority, three consumers" decision in
 * specs/generation.md for the rationale and the ratified shape.
 *
 * Descriptor shape:
 *   {
 *     key,                        // stable id (also the violation code owner)
 *     kind,                       // 'feasibility' | 'load-cadence'
 *     enabled(ctx),               // reads the rosterConstraints flag
 *     check(placement, ctx, mode) // => violation | null
 *   }
 *
 * - `kind: 'feasibility'` — physically impossible to violate (availability, role,
 *   active, same-event clash). Enforced by ALL consumers, including manual swaps.
 * - `kind: 'load-cadence'` — policy caps a human may deliberately override
 *   (week/month, understudy gate). Enforced by generator + validator, NOT swaps.
 *
 * `mode ∈ { 'would-place', 'is-placed' }` — the SAME rule answers two questions:
 *   - 'would-place' (generator/swap, predictive): may I place M here? For a
 *     counting rule this is `count >= cap` ("would reach the cap").
 *   - 'is-placed'  (validator, diagnostic): is this already-placed assignment
 *     violating the rule? For a counting rule this is `count > cap`.
 *   Feasibility rules ignore `mode` (unavailable is unavailable whenever asked).
 *
 * A violation is STRUCTURED — `{ code, params }` — never a formatted sentence.
 * Each consumer renders its own wording via `formatViolation` (or its own map),
 * so the toast, the validator line, and the log can differ and stay i18n-ready.
 *
 * NOTE: Incremental rollout — only `availability` is migrated so far; the other
 * rules still live in EligibilityChecker/assignmentValidator/explainSwap and are
 * ported one at a time. See specs/generation.md.
 */

import { checkMemberAvailability } from './constraintChecking'
import { CONSTRAINT_KEYS, isConstraintEnabled } from '../schema/rosterSchema'

export const CONSTRAINT_MODES = {
  WOULD_PLACE: 'would-place',
  IS_PLACED: 'is-placed',
}

/**
 * A `placement` is the subject of a check: a member landing (or already sitting)
 * in a slot of an event.
 *   { memberId, role, event }   // event carries `date` (and later start/end)
 */

export const CONSTRAINTS = [
  {
    key: 'availability',
    kind: 'feasibility',
    enabled: (ctx) => isConstraintEnabled(ctx.rosterConstraints, CONSTRAINT_KEYS.ENFORCE_MEMBER_AVAILABILITY),
    // Availability is intrinsic to (member, date): mode is irrelevant.
    check: (placement, ctx) => {
      if (checkMemberAvailability(placement.memberId, placement.event.date, ctx.memberConstraints)) {
        return null
      }
      return { code: 'unavailable', params: { memberId: placement.memberId, date: placement.event.date } }
    },
  },
]

const CONSTRAINTS_BY_KEY = Object.fromEntries(CONSTRAINTS.map(c => [c.key, c]))

/**
 * Run the enabled constraints against a placement.
 *
 * @param {object} placement - { memberId, role, event }
 * @param {object} ctx - { rosterConstraints, memberConstraints, ... }
 * @param {object} [opts]
 * @param {'would-place'|'is-placed'} [opts.mode] - the question being asked.
 * @param {'feasibility'|'load-cadence'} [opts.kind] - restrict to one kind
 *   (swaps pass 'feasibility').
 * @param {boolean} [opts.all] - collect every violation (validator) instead of
 *   short-circuiting at the first (generator/swap).
 * @returns {object[]} violations (empty = allowed). Short-circuit mode returns
 *   at most one.
 */
export function checkConstraints(placement, ctx, opts = {}) {
  const { mode = CONSTRAINT_MODES.WOULD_PLACE, kind, all = false } = opts
  const violations = []
  for (const constraint of CONSTRAINTS) {
    if (kind && constraint.kind !== kind) continue
    if (!constraint.enabled(ctx)) continue
    const violation = constraint.check(placement, ctx, mode)
    if (violation) {
      violations.push(violation)
      if (!all) break
    }
  }
  return violations
}

/** Look up a single descriptor by key (for consumers migrating rule-by-rule). */
export function getConstraint(key) {
  return CONSTRAINTS_BY_KEY[key]
}

/**
 * Default human-readable formatter for a structured violation. Consumers may use
 * this or supply their own wording; the code+params are the stable contract.
 *
 * @param {object} violation - { code, params }
 * @param {(memberId: string) => string} [nameOf] - resolve a member id to a name.
 */
export function formatViolation(violation, nameOf = (id) => id) {
  if (!violation) return null
  const { code, params = {} } = violation
  const name = params.memberId != null ? nameOf(params.memberId) : undefined
  switch (code) {
    case 'unavailable':
      return `${name} is unavailable on ${params.date}.`
    default:
      return 'Assignment violates a roster constraint.'
  }
}
