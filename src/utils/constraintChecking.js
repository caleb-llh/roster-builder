/**
 * Shared constraint checking utilities
 * Used by both validator and roster generator for consistency
 */

import { isMemberUnavailable } from './constraintsUtils'

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
 * Check if member is unavailable on a specific date
 */
export const checkMemberAvailability = (memberId, date, memberConstraints) => {
  return !isMemberUnavailable(memberId, date, memberConstraints)
}

/**
 * Check if member can perform a role
 */
export const checkMemberRoleCompatibility = (member, role) => {
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
