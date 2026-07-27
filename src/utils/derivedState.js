/**
 * Utility functions for extracting derived state from roster data
 */

import { YAML_FIELDS } from '../schema/rosterSchema'
import { createRoleColorMap } from './colorUtils'
import { DEFAULT_ROSTER_CONSTRAINTS, DEFAULT_ROSTER_PREFERENCES } from '../config/rosterDefaults'

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
      rosterConstraints: { ...DEFAULT_ROSTER_CONSTRAINTS },
      rosterPreferences: { ...DEFAULT_ROSTER_PREFERENCES },
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
  
  // Generate role color map (shared palette from colorUtils)
  const roleColorMap = createRoleColorMap(roles)

  // Filter active members
  const activeMembers = members.filter(m => m && m.active !== false)

  // Extract member constraints from member_constraints (top-level array in YAML)
  const memberConstraints = data[YAML_FIELDS.MEMBER_CONSTRAINTS] || []

  // Extract member preferences from member_preferences (top-level array in YAML)
  const memberPreferences = data[YAML_FIELDS.MEMBER_PREFERENCES] || []

  // Extract roster-level constraints and preferences. Source-code defaults are
  // the base; any keys present in the document override them (so an explicit
  // `false` or a different MAX_ASSIGNMENTS_PER_MONTH still wins).
  const rosterConstraints = { ...DEFAULT_ROSTER_CONSTRAINTS, ...(data[YAML_FIELDS.ROSTER_CONSTRAINTS] || {}) }
  const rosterPreferences = { ...DEFAULT_ROSTER_PREFERENCES, ...(data[YAML_FIELDS.ROSTER_PREFERENCES] || {}) }
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
