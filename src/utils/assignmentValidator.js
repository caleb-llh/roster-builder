/**
 * Validate event assignments against constraints and preferences
 * @param {Array} events - All events with roster assignments
 * @param {Array} members - All members
 * @param {Array} memberConstraints - Member-level hard constraints
 * @param {Array} memberPreferences - Member-level preferences
 * @param {Object} rosterConstraints - Roster-level hard constraints
 * @param {Object} rosterPreferences - Roster-level preferences
 * @param {Object} rosterPeriod - Roster period with start_date and end_date
 * @returns {Object} - Validation results by event with errors and warnings
 */

import { 
  checkMemberAvailability,
  getMembersWithMultipleRoles,
  getWeekAssignments,
  countMonthlyAssignments,
  areConsecutiveWeekends
} from './constraintChecking'
import { CONSTRAINT_KEYS, PREFERENCE_KEYS, isConstraintEnabled, isPreferenceEnabled, MEMBER_PREF_FIELDS, getConstraintValue } from '../schema/rosterSchema'
import { isUnderstudyRole, countUnderstudySessionsBefore, UNDERSTUDY_MIN_SESSIONS } from './understudy'

/**
 * Check if member is assigned on unavailable date
 */
const checkUnavailabilityViolation = (event, memberConstraints, members) => {
  const errors = []
  
  if (!event.roster || !Array.isArray(event.roster)) return errors
  
  event.roster.forEach(assignment => {
    if (assignment.member_id) {
      if (!checkMemberAvailability(assignment.member_id, event.date, memberConstraints)) {
        const member = members.find(m => m.id === assignment.member_id)
        errors.push(`${member?.name || assignment.member_id} is unavailable on this date`)
      }
    }
  })
  
  return errors
}

/**
 * Check that a member assigned to a REAL role X is allowed to take it: either
 * they fully perform X, or (if they are only a TRAINEE for X) they have
 * completed at least UNDERSTUDY_MIN_SESSIONS understudy sessions for X on
 * strictly-earlier dates (i.e. they have been "promoted"). Flags any trainee
 * placed in the real role before promotion. Gated by
 * ENFORCE_UNDERSTUDY_BEFORE_ROLE.
 */
const checkUnderstudyBeforeRole = (event, allEvents, rosterConstraints, members) => {
  const errors = []

  if (!event.roster || !Array.isArray(event.roster)) return errors
  if (!isConstraintEnabled(rosterConstraints, CONSTRAINT_KEYS.ENFORCE_UNDERSTUDY_BEFORE_ROLE)) return errors

  event.roster.forEach(assignment => {
    if (!assignment.member_id || isUnderstudyRole(assignment.role)) return
    const member = members.find(m => m.id === assignment.member_id)
    if (!member) return

    const fullyPerforms = (member.roles || []).includes(assignment.role)
    const isTrainee = (member.understudyFor || []).includes(assignment.role)
    if (fullyPerforms || !isTrainee) return

    const sessions = countUnderstudySessionsBefore(member.id, assignment.role, allEvents, event.date)
    if (sessions < UNDERSTUDY_MIN_SESSIONS) {
      errors.push(`${member.name || member.id} is an understudy for ${assignment.role} and must complete at least ${UNDERSTUDY_MIN_SESSIONS} understudy session before being rostered for the actual role`)
    }
  })

  return errors
}

/**
 * Check if event is outside roster period
 */
const checkRosterPeriodViolation = (event, rosterPeriod) => {
  const errors = []
  
  if (!rosterPeriod || !rosterPeriod.start_date || !rosterPeriod.end_date) return errors
  
  const eventDate = new Date(event.date)
  const startDate = new Date(rosterPeriod.start_date)
  const endDate = new Date(rosterPeriod.end_date)
  
  if (eventDate < startDate || eventDate > endDate) {
    errors.push(`Event date ${event.date} is outside roster period (${rosterPeriod.start_date} to ${rosterPeriod.end_date})`)
  }
  
  return errors
}

/**
 * Check roster constraints violations
 */
const checkRosterConstraints = (event, allEvents, rosterConstraints, members) => {
  const errors = []
  
  if (!event.roster || !rosterConstraints) return errors
  
  // Check ONLY_ONCE_PER_EVENT - member can only be assigned to one role per event
  if (isConstraintEnabled(rosterConstraints, CONSTRAINT_KEYS.ONLY_ONCE_PER_EVENT)) {
    const multipleRoles = getMembersWithMultipleRoles(event.roster)
    multipleRoles.forEach(({ memberId, roles }) => {
      const member = members.find(m => m.id === memberId)
      errors.push(`${member?.name || memberId} is assigned to multiple roles: ${roles.join(', ')}`)
    })
  }
  
  // Get assigned members for this event
  const assignedMemberIds = event.roster
    .filter(r => r.member_id)
    .map(r => r.member_id)
  
  // Check ONLY_ONCE_PER_WEEK - member can't be rostered more than once in same week (Monday to Sunday)
  if (isConstraintEnabled(rosterConstraints, CONSTRAINT_KEYS.ONLY_ONCE_PER_WEEK)) {
    assignedMemberIds.forEach(memberId => {
      const weekAssignments = getWeekAssignments(memberId, event.date, allEvents)
      const otherWeekEvents = weekAssignments.filter(e => e.date !== event.date)
      const member = members.find(m => m.id === memberId)
      
      otherWeekEvents.forEach(weekEvent => {
        errors.push(`${member?.name || memberId} is already rostered on ${weekEvent.date} (${weekEvent.day_of_week}) this week`)
      })
    })
  }
  
  // Check MAX_ASSIGNMENTS_PER_MONTH
  if (isConstraintEnabled(rosterConstraints, CONSTRAINT_KEYS.MAX_ASSIGNMENTS_PER_MONTH)) {
    const maxLimit = getConstraintValue(rosterConstraints, CONSTRAINT_KEYS.MAX_ASSIGNMENTS_PER_MONTH)
    
    assignedMemberIds.forEach(memberId => {
      const monthlyCount = countMonthlyAssignments(memberId, event.date, allEvents)
      
      if (monthlyCount > maxLimit) {
        const member = members.find(m => m.id === memberId)
        const eventDate = new Date(event.date)
        const monthName = eventDate.toLocaleString('default', { month: 'long' })
        errors.push(`${member?.name || memberId} has ${monthlyCount} assignments in ${monthName} (max: ${maxLimit})`)
      }
    })
  }
  
  return errors
}

/**
 * Check roster preferences violations
 */
const checkRosterPreferences = (event, allEvents, rosterPreferences, members) => {
  const warnings = []
  
  if (!event.roster || !rosterPreferences) return warnings
  
  const assignedMemberIds = event.roster
    .filter(r => r.member_id)
    .map(r => r.member_id)
  
  // Check AVOID_CONSECUTIVE_WEEKS
  if (isPreferenceEnabled(rosterPreferences, PREFERENCE_KEYS.AVOID_CONSECUTIVE_WEEKS)) {
    assignedMemberIds.forEach(memberId => {
      // Find other events where member is assigned
      const otherAssignments = allEvents.filter(e => 
        e.date !== event.date && e.roster?.some(r => r.member_id === memberId)
      )
      const member = members.find(m => m.id === memberId)
      
      otherAssignments.forEach(otherEvent => {
        // Check both directions since areConsecutiveWeekends checks if date2 follows date1
        if (areConsecutiveWeekends(event.date, otherEvent.date) || 
            areConsecutiveWeekends(otherEvent.date, event.date)) {
          warnings.push(`${member?.name || memberId} is rostered on consecutive weekend (${otherEvent.date})`)
        }
      })
    })
  }
  
  return warnings
}

/**
 * Check member preferences violations
 */
const checkMemberPreferences = (event, memberPreferences, members) => {
  const warnings = []
  
  if (!event.roster || !memberPreferences) return warnings
  
  event.roster.forEach(assignment => {
    if (assignment.member_id) {
      const memberPref = memberPreferences.find(p => p.member_id === assignment.member_id)
      if (memberPref && memberPref.days) {
        const eventDayOfWeek = event.day_of_week
        
        // Check if event day matches preferred days
        if (!memberPref.days.includes(eventDayOfWeek)) {
          const member = members.find(m => m.id === assignment.member_id)
          const preferredDays = memberPref.days.join(', ')
          warnings.push(`${member?.name || assignment.member_id} prefers ${preferredDays} (not ${eventDayOfWeek})`)
        }
      }
    }
  })
  
  return warnings
}

/**
 * Validate all events
 */
export const validateEventAssignments = (events, members, memberConstraints, memberPreferences, rosterConstraints, rosterPreferences, rosterPeriod) => {
  const validationResults = {}
  
  events.forEach((event, index) => {
    const eventKey = event.date // Use just date as key to match EventsView lookup
    
    const errors = [
      ...checkRosterPeriodViolation(event, rosterPeriod),
      ...checkUnavailabilityViolation(event, memberConstraints, members),
      ...checkRosterConstraints(event, events, rosterConstraints, members),
      ...checkUnderstudyBeforeRole(event, events, rosterConstraints, members)
    ]
    
    const warnings = [
      ...checkRosterPreferences(event, events, rosterPreferences, members),
      ...checkMemberPreferences(event, memberPreferences, members)
    ]
    
    // Remove duplicates
    const uniqueErrors = [...new Set(errors)]
    const uniqueWarnings = [...new Set(warnings)]
    
    // Store or append to existing results (in case multiple events on same date)
    if (uniqueErrors.length > 0 || uniqueWarnings.length > 0) {
      if (validationResults[eventKey]) {
        // Append to existing
        validationResults[eventKey].errors.push(...uniqueErrors)
        validationResults[eventKey].warnings.push(...uniqueWarnings)
        // Remove duplicates after appending
        validationResults[eventKey].errors = [...new Set(validationResults[eventKey].errors)]
        validationResults[eventKey].warnings = [...new Set(validationResults[eventKey].warnings)]
      } else {
        validationResults[eventKey] = {
          errors: uniqueErrors,
          warnings: uniqueWarnings
        }
      }
    }
  })
  
  return validationResults
}
