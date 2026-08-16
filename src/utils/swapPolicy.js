import { canFillSlotRole, isUnderstudyRole, isPromotedForRole } from './understudy'
import { getConstraint, CONSTRAINT_MODES, formatViolation } from './constraints'

/**
 * Validate a proposed swap/move between two roster slots, returning both
 * whether it is allowed and — when rejected — *why*. A "swap" exchanges the
 * occupants of slotA (source) and slotB (target); either occupant may be null
 * (a move into/out of an empty slot).
 *
 * Rules enforced for each member landing in its new slot:
 *  - role compatibility (full performer, or a promoted trainee for a real role),
 *  - availability on the destination event's date,
 *  - once-per-event (no duplicate member within a single event).
 *
 * This is the manual-swap CONSUMER of the hard-constraint registry: it enforces
 * only `feasibility` rules (a human may deliberately override load/cadence caps),
 * so it never checks week/month caps or the understudy gate. See the
 * "one authority, three consumers" decision in specs/generation.md.
 *
 * The once-per-event check must ignore the slot each member is LEAVING within
 * the event being checked. In a same-event swap both slots live in one roster
 * array, so memberA leaves `sourceIndex` and memberB leaves `targetIndex`;
 * ignoring the wrong index falsely reports a duplicate and blocks a legal
 * same-event, different-role swap.
 *
 * @returns {{ ok: boolean, reason: string|null }} `ok` is the validity; `reason`
 *   is a human-readable, member-and-cause-specific sentence when `ok` is false
 *   (null when valid). Use `canSwapRosterSlots` for the boolean-only check.
 */
export const explainSwap = ({
  memberA, memberB, eventA, eventB, sourceIndex, targetIndex,
  slotA, slotB, members, memberConstraints, allEvents,
}) => {
  const memberById = (id) => members.find(m => m.id === id)
  const nameOf = (id) => memberById(id)?.name || id || 'someone'
  const sameEvent = eventA === eventB
  const events = allEvents || [eventA, eventB]

  // Returns null when the member may occupy the slot, otherwise a reason string
  // naming the specific member, role, and cause so the toast can be actionable.
  const rejection = (memberId, event, slot, ignoreRoleIndex) => {
    if (!memberId) return null // clearing a slot is always valid
    const member = memberById(memberId)
    if (!member || member.include === false) {
      return `${nameOf(memberId)} is inactive and can't be assigned.`
    }

    const roleOk = canFillSlotRole(member, slot.role) ||
      (!isUnderstudyRole(slot.role) && isPromotedForRole(member, slot.role, events, event.date))
    if (!roleOk) return `${nameOf(memberId)} can't fill the ${slot.role} role.`

    const availability = getConstraint('availability')
    const unavailable = availability.check(
      { memberId, role: slot.role, event },
      { memberConstraints },
      CONSTRAINT_MODES.WOULD_PLACE
    )
    if (unavailable) return formatViolation(unavailable, nameOf)

    const clash = event.roster.some((r, i) => i !== ignoreRoleIndex && r.member_id === memberId)
    if (clash) return `${nameOf(memberId)} is already rostered on ${event.date}.`

    return null
  }

  const reason =
    rejection(memberA, eventB, slotB, sameEvent ? sourceIndex : -1) ||
    rejection(memberB, eventA, slotA, sameEvent ? targetIndex : -1)

  return { ok: !reason, reason: reason || null }
}

/**
 * Boolean-only convenience wrapper over {@link explainSwap}.
 * @returns {boolean} true if the swap is valid
 */
export const canSwapRosterSlots = (args) => explainSwap(args).ok
