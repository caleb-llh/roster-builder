/**
 * Constraint primitives — the shared leaf helpers that higher layers compose.
 *
 * These are pure, low-level predicates and counters (availability, role
 * compatibility, week/month tallies, clash detection). They do NOT own the
 * hard-rule policy — that authority lives in the CONSTRAINTS registry
 * (constraints.js), which composes these primitives. Consumers (the generator's
 * EligibilityChecker, assignmentValidator, swapPolicy) read the registry, not
 * this file's rules directly, except for the raw counters they still need.
 */

import { canFillSlotRole, isUnderstudyRole, isPromotedForRole } from './understudy'
import { getConstraint, CONSTRAINT_MODES } from './constraints'

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

    // Availability decision comes from the shared `availability` constraint
    // descriptor (one authority — same rule the generator/validator/swap use),
    // NOT a private re-check. Called directly (bypassing `enabled`) because the
    // dropdown always SHOWS unavailability as a cue regardless of whether the
    // ENFORCE_MEMBER_AVAILABILITY flag gates generation — matching the validator.
    const availability = getConstraint('availability')
    const ctx = { memberConstraints: constraints }

    // Check availability for each qualified member
    const memberAvailability = qualifiedMembers.map(member => ({
      id: member.id,
      name: member.name,
      available: !availability.check(
        { memberId: member.id, role, event },
        ctx,
        CONSTRAINT_MODES.WOULD_PLACE
      ),
      assigned: assignedIds.has(member.id),
      // Mark trainees being promoted into a real role so the UI can label them.
      isUnderstudy: !isUnderstudyRole(role) && !(member.roles || []).includes(role),
    }))

    availabilityByRole[role] = memberAvailability
  })

  return availabilityByRole
}

/**
 * Get Monday of the week for a given date
 * Week starts on Monday and ends on Sunday
 */
export const getMondayOfWeek = (date) => {
  const d = new Date(date)
  // Return null if invalid date
  if (isNaN(d.getTime())) {
    return null
  }
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day // Sunday is 0, adjust to Monday
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Get week key (Monday's date as ISO string) for grouping events by week
 */
export const getWeekKey = (date) => {
  const monday = getMondayOfWeek(date)
  // Return null if invalid date
  if (!monday) {
    return null
  }
  return monday.toISOString().split('T')[0]
}

/**
 * Is the member available on a specific date? (Inverse of isMemberUnavailable.)
 */
export const isMemberAvailable = (memberId, date, memberConstraints) => {
  return !isMemberUnavailable(memberId, date, memberConstraints)
}

/**
 * Is the member listed as able to perform a role?
 */
export const isMemberRoleCompatible = (member, role) => {
  if (!member) return false
  return member.roles && member.roles.includes(role)
}

/**
 * Check ONLY_ONCE_PER_EVENT constraint
 * Returns true if member is already assigned to the event roster
 */
export const isAssignedToEvent = (memberId, eventRoster) => {
  if (!eventRoster || !Array.isArray(eventRoster)) return false
  return eventRoster.some(r => r.member_id === memberId)
}

/**
 * Count assignments for a member in a specific month
 */
export const countMonthlyAssignments = (memberId, targetDate, allEvents) => {
  const targetDate_ = new Date(targetDate)
  const targetMonth = targetDate_.getMonth()
  const targetYear = targetDate_.getFullYear()
  
  return allEvents.filter(event => {
    const eventDate = new Date(event.date)
    return eventDate.getMonth() === targetMonth &&
           eventDate.getFullYear() === targetYear &&
           event.roster?.some(r => r.member_id === memberId)
  }).length
}

/**
 * Get all events where a member is assigned in the same week as target date
 */
export const getWeekAssignments = (memberId, targetDate, allEvents) => {
  const targetWeekKey = getWeekKey(targetDate)
  if (!targetWeekKey) return []  // Invalid date
  
  return allEvents.filter(event => {
    const eventWeekKey = getWeekKey(event.date)
    return eventWeekKey && eventWeekKey === targetWeekKey && 
           event.roster?.some(r => r.member_id === memberId)
  })
}

/**
 * Check if two dates are consecutive weekends
 * Returns true if date2 is the weekend immediately following date1
 */
export const areConsecutiveWeekends = (date1, date2) => {
  const d1 = new Date(date1)
  const d2 = new Date(date2)
  
  const day1 = d1.getDay()
  const day2 = d2.getDay()
  
  // Both must be weekend days
  if ((day1 !== 0 && day1 !== 6) || (day2 !== 0 && day2 !== 6)) {
    return false
  }
  
  // Calculate days difference
  const daysDiff = Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24))
  
  // Consecutive weekends are 6-8 days apart
  return daysDiff >= 6 && daysDiff <= 8
}

/**
 * Get all members assigned to multiple roles in the same event
 */
export const getMembersWithMultipleRoles = (eventRoster) => {
  if (!eventRoster || !Array.isArray(eventRoster)) return []
  
  const memberRoles = {}
  eventRoster.forEach(assignment => {
    if (assignment.member_id) {
      if (!memberRoles[assignment.member_id]) {
        memberRoles[assignment.member_id] = []
      }
      memberRoles[assignment.member_id].push(assignment.role)
    }
  })
  
  return Object.entries(memberRoles)
    .filter(([_, roles]) => roles.length > 1)
    .map(([memberId, roles]) => ({ memberId, roles }))
}
