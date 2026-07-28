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

/**
 * Single source of truth for "can this member occupy this slot role?" — the
 * role-compatibility rule shared by the generator's eligibility checker, the
 * assignment dropdown, and drag-and-drop. Availability and count-based limits
 * are enforced separately; this only answers role capability.
 *
 * - Real role X: the member fully performs X (X in `roles`).
 * - Understudy slot "X-understudy": the member is TRAINING for X
 *   (X in `understudyFor`). Full performers are not understudies.
 *
 * @param {{ roles?: string[], understudyFor?: string[] }} member  normalized member
 * @param {string} slotRole  the slot's role (may be an understudy slot)
 */
export function canFillSlotRole(member, slotRole) {
  if (!member) return false
  if (isUnderstudyRole(slotRole)) {
    return (member.understudyFor || []).includes(baseRoleOf(slotRole))
  }
  return (member.roles || []).includes(slotRole)
}

/**
 * Generator-side role capability (for ENFORCE_MEMBER_ROLES). Broader than
 * {@link canFillSlotRole}: for a real role X a TRAINEE (understudyFor X) is
 * considered capable so this hard constraint passes — the separate
 * ENFORCE_UNDERSTUDY_BEFORE_ROLE gate then decides whether they have
 * understudied enough to actually take it. Understudy slots use the same strict
 * rule as the UI (trainees only).
 *
 * @param {{ roles?: string[], understudyFor?: string[] }} member  normalized member
 * @param {string} slotRole  the slot's role (may be an understudy slot)
 */
export function isRoleCapable(member, slotRole) {
  if (!member) return false
  if (isUnderstudyRole(slotRole)) {
    return (member.understudyFor || []).includes(baseRoleOf(slotRole))
  }
  return (member.roles || []).includes(slotRole) || (member.understudyFor || []).includes(slotRole)
}

/**
 * Count how many understudy sessions a member has completed for base role `X`
 * on dates STRICTLY EARLIER than `beforeDate`, by scanning the roster of every
 * event. Used by the UI to decide whether a trainee has been "promoted" (become
 * eligible to fill the real role X) — the same understudy-before-role rule the
 * generator enforces, but computed from the events themselves rather than a
 * live tracker.
 *
 * @param {string} memberId
 * @param {string} baseRole            the real role (e.g. "multi-vm")
 * @param {Array}  events              all events (each with `date` + `roster[]`)
 * @param {string} beforeDate          YYYY-MM-DD; only earlier sessions count
 * @returns {number} completed understudy sessions before `beforeDate`
 */
export function countUnderstudySessionsBefore(memberId, baseRole, events, beforeDate) {
  if (!Array.isArray(events)) return 0
  const slotRole = understudySlotRole(baseRole)
  let count = 0
  for (const event of events) {
    if (!event?.date || event.date >= beforeDate) continue
    for (const slot of event.roster || []) {
      if (slot.role === slotRole && slot.member_id === memberId) count++
    }
  }
  return count
}

/**
 * True if a trainee for base role `X` has completed enough understudy sessions
 * (>= UNDERSTUDY_MIN_SESSIONS, on strictly earlier dates) to be promoted into
 * the real role `X` on `beforeDate`.
 */
export function isPromotedForRole(member, baseRole, events, beforeDate) {
  if (!member || !(member.understudyFor || []).includes(baseRole)) return false
  return countUnderstudySessionsBefore(member.id, baseRole, events, beforeDate) >= UNDERSTUDY_MIN_SESSIONS
}
