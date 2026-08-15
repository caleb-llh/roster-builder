import { canFillSlotRole, isUnderstudyRole, isPromotedForRole } from './understudy'

/**
 * Check if a member is unavailable on a specific date
 * @param {string} memberId - Member ID to check
 * @param {string} eventDate - Event date in YYYY-MM-DD format
 * @param {Array} constraints - Array of constraint objects from YAML
 * @returns {boolean} - True if member is unavailable
 */
export const isMemberUnavailable = (memberId, eventDate, constraints) => {
  if (!constraints || !Array.isArray(constraints)) return false

  const constraint = constraints.find(c => c.member_id === memberId)
  if (!constraint || !constraint.unavailable_dates) return false

  const checkDate = new Date(eventDate)

  for (const dateEntry of constraint.unavailable_dates) {
    // Handle single date string
    if (typeof dateEntry === 'string') {
      const unavailableDate = new Date(dateEntry)
      if (checkDate.getTime() === unavailableDate.getTime()) {
        return true
      }
    }
    // Handle date range object
    else if (dateEntry.start && dateEntry.end) {
      const rangeStart = new Date(dateEntry.start)
      const rangeEnd = new Date(dateEntry.end)
      if (checkDate >= rangeStart && checkDate <= rangeEnd) {
        return true
      }
    }
  }

  return false
}

/**
 * Get all available members for an event based on roles and constraints
 * @param {Object} event - Event object with date and roster
 * @param {Array} members - All members
 * @param {Array} constraints - Constraint objects
 * @param {Array} [allEvents] - All events; enables listing promoted trainees
 *   (understudies who completed their session earlier) for real-role slots
 * @returns {Object} - Object with role -> available members mapping
 */
export const getAvailableMembersForEvent = (event, members, constraints, allEvents = null) => {
  if (!event.roster || !Array.isArray(event.roster)) return {}

  const events = allEvents || [event]
  const availabilityByRole = {}

  // A role may appear in more than one slot of the same event (the roster is a
  // positional array, so duplicate roles are legal — e.g. two `roving-cam`).
  // Availability for a role is the SAME regardless of how many slots it has, so
  // we key by role name and compute it once. But "assigned" must reflect ANY
  // slot of that role: pre-index the member_ids assigned to each role so a
  // member covering the first of two duplicate slots is still marked assigned
  // (previously the last slot's assignment overwrote the earlier one).
  const assignedIdsByRole = {}
  event.roster.forEach(assignment => {
    if (!assignment.member_id) return
    ;(assignedIdsByRole[assignment.role] ||= new Set()).add(assignment.member_id)
  })

  event.roster.forEach(assignment => {
    const role = assignment.role
    if (availabilityByRole[role]) return // already computed for this role

    // Who can fill this slot?
    //  - Full performers / trainees for understudy slots: canFillSlotRole.
    //  - For a REAL role X, also include trainees who have been "promoted" —
    //    i.e. completed an understudy session for X on an earlier date — so the
    //    picker can reproduce the generator's promotions. Trainees who haven't
    //    understudied yet stay out, honouring the understudy-before-role rule.
    const qualifiedMembers = members.filter(m => {
      if (m.include === false) return false
      if (canFillSlotRole(m, role)) return true
      if (!isUnderstudyRole(role)) return isPromotedForRole(m, role, events, event.date)
      return false
    })

    const assignedIds = assignedIdsByRole[role] || new Set()

    // Check availability for each qualified member
    const availability = qualifiedMembers.map(member => ({
      id: member.id,
      name: member.name,
      available: !isMemberUnavailable(member.id, event.date, constraints),
      assigned: assignedIds.has(member.id),
      // Mark trainees being promoted into a real role so the UI can label them.
      isUnderstudy: !isUnderstudyRole(role) && !(member.roles || []).includes(role),
    }))

    availabilityByRole[role] = availability
  })

  return availabilityByRole
}

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

    if (isMemberUnavailable(memberId, event.date, memberConstraints)) {
      return `${nameOf(memberId)} is unavailable on ${event.date}.`
    }

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
