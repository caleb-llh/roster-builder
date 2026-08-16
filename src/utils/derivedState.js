/**
 * Utility functions for extracting derived state from roster data
 */

import { YAML_FIELDS } from '../schema/rosterSchema'
import { createRoleColorMap } from './colorUtils'
import { DEFAULT_ROSTER_CONSTRAINTS, DEFAULT_ROSTER_PREFERENCES } from '../config/rosterDefaults'
import { normalizeMemberRoles } from './understudy'

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

  const rawMembers = data[YAML_FIELDS.MEMBERS] || []
  const events = data[YAML_FIELDS.EVENTS] || []

  // Normalize each member's roles: understudy-flagged roles are pulled out of
  // `roles` (they can't fully perform them yet) into `understudyFor`. Keeps
  // `member.roles` a plain string array for all downstream `.includes` checks.
  const members = rawMembers.map(m => {
    if (!m) return m
    const { roles, understudyFor } = normalizeMemberRoles(m.roles)
    return { ...m, roles, understudyFor }
  })

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

/**
 * Resolve the single derived-state contract the engine/validators consume
 * (multi-tenant Phase 0 seam).
 *
 * Today a roster is one document and `getDerivedState` already yields the
 * normalized shape (`{ members: [{ id, name, roles, understudyFor, include }],
 * events, memberConstraints, ... }`). This seam names that contract explicitly
 * so the target tenant/team model can later resolve the SAME shape by joining
 * `members` + `team_members` (see specs/multi-tenant.md "Compatibility seam")
 * without the engine changing.
 *
 * For a single team it is an identity pass over `getDerivedState(data)` plus the
 * optional read-only cross-team **assignments**, which default to empty/no-op so
 * single-team behaviour is byte-for-byte identical.
 *
 * `externalAssignments` is the single cross-team primitive: any "load" figure
 * (monthly/weekly/total counts) is *derived* from it by the same rollup the
 * `AssignmentTracker` already applies to local assignments, so it is never
 * passed or stored as a separate, drift-prone input. See
 * specs/multi-tenant.md "Compatibility seam".
 *
 * @param {object|null} data - the roster document (current single-team source)
 * @param {object} [external] - { externalAssignments } read-only snapshot of the
 *   member's assignments in OTHER teams (`{ memberId: [dateOrDatetime, ...] }`);
 *   empty by default.
 * @returns derived state + `externalAssignments`.
 */
export function resolveDerivedState(data, external = {}) {
  return {
    ...getDerivedState(data),
    externalAssignments: external.externalAssignments || {},
  }
}
