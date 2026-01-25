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
 * @returns {Object} - Object with role -> available members mapping
 */
export const getAvailableMembersForEvent = (event, members, constraints) => {
  if (!event.roster || !Array.isArray(event.roster)) return {}

  const availabilityByRole = {}

  event.roster.forEach(assignment => {
    const role = assignment.role
    
    // Find all members who can fill this role
    const qualifiedMembers = members.filter(m => 
      m.include !== false && m.roles?.includes(role)
    )

    // Check availability for each qualified member
    const availability = qualifiedMembers.map(member => ({
      id: member.id,
      name: member.name,
      available: !isMemberUnavailable(member.id, event.date, constraints),
      assigned: assignment.member_id === member.id
    }))

    availabilityByRole[role] = availability
  })

  return availabilityByRole
}
