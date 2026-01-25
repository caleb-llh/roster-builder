/**
 * Calculate roster statistics for members
 * @param {Array} events - All events with roster assignments
 * @param {Array} members - All members
 * @param {Object} rosterPeriod - Roster period with start_date and end_date
 * @returns {Object} - Statistics including total slots, per-member stats, etc.
 */
export const calculateRosterStats = (events, members, rosterPeriod) => {
  if (!events || !members || !rosterPeriod) {
    return {
      totalSlots: 0,
      totalEvents: 0,
      monthCount: 0,
      avgSlotsPerEvent: 0,
      avgSlotsPerMonth: 0,
      avgSlotsPerMember: 0,
      memberStats: []
    }
  }

  const activeMembers = members.filter(m => m.include !== false)
  
  // Count total slots needed across all events
  let totalSlots = 0
  const memberAssignments = {}
  const memberRoleAssignments = {} // Track role diversity per member

  events.forEach(event => {
    if (event.roster && Array.isArray(event.roster)) {
      event.roster.forEach(assignment => {
        totalSlots++ // Count all slots, not just assigned ones
        
        // Count assignments per member (using both member_id and id fields)
        const memberId = assignment.member_id || assignment.id
        if (memberId) {
          memberAssignments[memberId] = (memberAssignments[memberId] || 0) + 1
          
          // Track role diversity
          if (!memberRoleAssignments[memberId]) {
            memberRoleAssignments[memberId] = {}
          }
          if (assignment.role) {
            memberRoleAssignments[memberId][assignment.role] = 
              (memberRoleAssignments[memberId][assignment.role] || 0) + 1
          }
        }
      })
    }
  })

  // Calculate months in roster period
  const startDate = new Date(rosterPeriod.start_date)
  const endDate = new Date(rosterPeriod.end_date)
  const monthsDiff = (endDate.getFullYear() - startDate.getFullYear()) * 12 + 
                     (endDate.getMonth() - startDate.getMonth()) + 1

  // Calculate statistics
  const totalEvents = events.length
  const avgSlotsPerEvent = totalEvents > 0 ? totalSlots / totalEvents : 0
  const avgSlotsPerMonth = monthsDiff > 0 ? totalSlots / monthsDiff : 0
  const avgSlotsPerMember = activeMembers.length > 0 ? totalSlots / activeMembers.length : 0

  // Calculate per-member statistics
  const memberStats = activeMembers.map(member => {
    const assignments = memberAssignments[member.id] || 0
    const avgPerMonth = monthsDiff > 0 ? assignments / monthsDiff : 0
    const percentageOfTotal = totalSlots > 0 ? (assignments / totalSlots) * 100 : 0
    
    // Calculate role diversity per member
    const roles = memberRoleAssignments[member.id] || {}
    const uniqueRoles = Object.keys(roles).length
    const roleDistribution = roles
    
    return {
      id: member.id,
      name: member.name,
      totalAssignments: assignments,
      avgPerMonth: avgPerMonth,
      percentageOfTotal: percentageOfTotal,
      uniqueRoles: uniqueRoles,
      roleDistribution: roleDistribution
    }
  }).sort((a, b) => b.totalAssignments - a.totalAssignments)
  
  // Calculate role diversity: measure variety of members per role
  const roleVariety = {}
  events.forEach(event => {
    if (event.roster && Array.isArray(event.roster)) {
      event.roster.forEach(assignment => {
        const memberId = assignment.member_id || assignment.id
        if (memberId && assignment.role) {
          if (!roleVariety[assignment.role]) {
            roleVariety[assignment.role] = new Set()
          }
          roleVariety[assignment.role].add(memberId)
        }
      })
    }
  })
  
  const roleStats = Object.entries(roleVariety).map(([role, memberSet]) => ({
    role,
    uniqueMembers: memberSet.size,
    totalAssignments: Object.values(memberRoleAssignments).reduce(
      (sum, roles) => sum + (roles[role] || 0), 0
    )
  }))
  
  const avgMembersPerRole = roleStats.length > 0 
    ? roleStats.reduce((sum, r) => sum + r.uniqueMembers, 0) / roleStats.length 
    : 0

  return {
    totalSlots,
    totalEvents,
    monthCount: monthsDiff,
    avgSlotsPerEvent: Math.round(avgSlotsPerEvent * 10) / 10,
    avgSlotsPerMonth: Math.round(avgSlotsPerMonth * 10) / 10,
    avgSlotsPerMember: Math.round(avgSlotsPerMember * 10) / 10,
    memberStats,
    roleDiversity: {
      roleStats: roleStats,
      avgMembersPerRole: Math.round(avgMembersPerRole * 10) / 10,
      totalRoles: roleStats.length
    }
  }
}

/**
 * Format roster stats for display
 * @param {Object} stats - Stats from calculateRosterStats
 * @returns {Object} - Formatted text for display
 */
export const formatRosterStats = (stats) => {
  return {
    summary: `${stats.totalSlots} total slots across ${stats.totalEvents} events (${stats.monthCount} months)`,
    averages: `Avg: ${stats.avgSlotsPerMember} shifts/person · ${stats.avgSlotsPerMonth} shifts/month`,
    detail: `${stats.avgSlotsPerEvent} slots per event`
  }
}
