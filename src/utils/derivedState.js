/**
 * Utility functions for extracting derived state from roster data
 */

import { YAML_FIELDS } from '../schema/rosterSchema'

export function getDerivedState(data) {
  if (!data) {
    return {
      members: [],
      events: [],
      roles: [],
      roleColorMap: {},
      activeMembers: [],
      memberConstraints: [],
      memberPreferences: [],
      rosterConstraints: {},
      rosterPreferences: {},
      rosterPeriod: null
    }
  }

  const members = data[YAML_FIELDS.MEMBERS] || []
  const events = data[YAML_FIELDS.EVENTS] || []
  
  // Handle both formats: roles: [{name: "x"}, ...] or declared_roles: ["x", ...]
  let roles = []
  if (data[YAML_FIELDS.ROLES] && Array.isArray(data[YAML_FIELDS.ROLES])) {
    roles = data[YAML_FIELDS.ROLES].map(r => typeof r === 'string' ? r : (r && r.name)).filter(Boolean)
  } else if (data.declared_roles && Array.isArray(data.declared_roles)) {
    roles = data.declared_roles.filter(Boolean)
  }
  
  // Generate role color map
  const roleColorMap = {}
  roles.forEach((role, index) => {
    const colors = [
      'bg-blue-100 text-blue-800',
      'bg-green-100 text-green-800',
      'bg-purple-100 text-purple-800',
      'bg-pink-100 text-pink-800',
      'bg-yellow-100 text-yellow-800',
      'bg-indigo-100 text-indigo-800',
      'bg-red-100 text-red-800',
      'bg-teal-100 text-teal-800'
    ]
    roleColorMap[role] = colors[index % colors.length]
  })

  // Filter active members
  const activeMembers = members.filter(m => m && m.active !== false)

  // Extract member constraints from member_constraints (top-level array in YAML)
  const memberConstraints = data[YAML_FIELDS.MEMBER_CONSTRAINTS] || []

  // Extract member preferences from member_preferences (top-level array in YAML)
  const memberPreferences = data[YAML_FIELDS.MEMBER_PREFERENCES] || []

  // Extract roster-level constraints and preferences
  const rosterConstraints = data[YAML_FIELDS.ROSTER_CONSTRAINTS] || {}
  const rosterPreferences = data[YAML_FIELDS.ROSTER_PREFERENCES] || {}
  const rosterPeriod = data[YAML_FIELDS.ROSTER_PERIOD] || null

  return {
    members,
    events,
    roles,
    roleColorMap,
    activeMembers,
    memberConstraints,
    memberPreferences,
    rosterConstraints,
    rosterPreferences,
    rosterPeriod
  }
}
