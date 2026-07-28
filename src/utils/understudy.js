/**
 * Understudy role conventions and helpers.
 *
 * An "understudy" is a member who is TRAINING for a role but not yet a full
 * performer of it. A member declares this in YAML by flagging a role entry with
 * `understudy: true`, e.g.
 *
 *   roles:
 *     - name: multi-vm
 *       understudy: true    # training for multi-vm
 *     - vm                  # plain string = full role, still supported
 *
 * Slots that a trainee can fill use a suffix convention: the understudy slot for
 * role `X` is `"${X}-understudy"`. These slot roles do NOT need to be predeclared
 * in the top-level `roles` catalog (the catalog auto-expands to include them).
 *
 * Rule enforced by the generator: a trainee for `X` may only be assigned to the
 * real role `X` after they have been assigned to `X-understudy` at least
 * UNDERSTUDY_MIN_SESSIONS times on strictly earlier dates.
 */

/** Suffix that marks an understudy slot role. */
export const UNDERSTUDY_SUFFIX = '-understudy'

/**
 * How many prior understudy sessions (on strictly earlier dates) a trainee needs
 * before becoming eligible for the real role. Configured in code; defaults to 1.
 */
export const UNDERSTUDY_MIN_SESSIONS = 1

/** The understudy slot role for a base role, e.g. "multi-vm" -> "multi-vm-understudy". */
export function understudySlotRole(baseRole) {
  return `${baseRole}${UNDERSTUDY_SUFFIX}`
}

/** True if a role string names an understudy slot. */
export function isUnderstudyRole(role) {
  return typeof role === 'string' && role.endsWith(UNDERSTUDY_SUFFIX)
}

/**
 * The base role for an understudy slot role, e.g. "multi-vm-understudy" ->
 * "multi-vm". Returns null if the given role is not an understudy role.
 */
export function baseRoleOf(role) {
  if (!isUnderstudyRole(role)) return null
  return role.slice(0, -UNDERSTUDY_SUFFIX.length)
}

/**
 * Normalize a member's raw `roles` array (mix of strings and
 * `{ name, understudy? }` objects) into a canonical shape:
 *
 *   {
 *     roles: string[],          // roles the member can FULLY perform now
 *     understudyFor: string[],  // roles the member is TRAINING for
 *   }
 *
 * An understudy-flagged role is excluded from `roles` (they can't perform it
 * yet) but recorded in `understudyFor`. A role appearing both as a plain string
 * and an understudy entry is treated as a full role (full capability wins).
 */
export function normalizeMemberRoles(rawRoles) {
  const roles = []
  const understudyFor = []

  if (Array.isArray(rawRoles)) {
    for (const entry of rawRoles) {
      if (typeof entry === 'string') {
        roles.push(entry)
      } else if (entry && typeof entry === 'object' && entry.name) {
        if (entry.understudy === true) understudyFor.push(entry.name)
        else roles.push(entry.name)
      }
    }
  }

  // Full capability wins over understudy for the same role.
  const fullSet = new Set(roles)
  const understudyOnly = understudyFor.filter(r => !fullSet.has(r))

  return {
    roles: [...new Set(roles)],
    understudyFor: [...new Set(understudyOnly)],
  }
}
