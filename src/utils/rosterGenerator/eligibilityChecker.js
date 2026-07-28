/**
 * Check if a member is eligible for a role assignment based on hard constraints
 */

import { 
  checkMemberAvailability,
  isAssignedToEvent
} from '../constraintChecking'
import { CONSTRAINT_KEYS, isConstraintEnabled, getConstraintValue } from '../../schema/rosterSchema'
import { isUnderstudyRole, understudySlotRole, baseRoleOf, UNDERSTUDY_MIN_SESSIONS, isRoleCapable } from '../understudy'

export class EligibilityChecker {
  constructor(members, constraints, rosterConstraints, tracker) {
    this.members = members
    this.memberConstraints = constraints
    this.rosterConstraints = rosterConstraints
    this.tracker = tracker
  }
  
  /**
   * Check if member is eligible for a role on a specific event
   * @returns {Object} { eligible: boolean, reason: string }
   */
  isEligible(memberId, role, event, currentRoster = []) {
    const member = this.members.find(m => m.id === memberId)
    
    if (!member) {
      return { eligible: false, reason: 'Member not found' }
    }
    
    if (member.include === false) {
      return { eligible: false, reason: 'Member not included in roster' }
    }
    
    // Check ENFORCE_MEMBER_ROLES
    if (isConstraintEnabled(this.rosterConstraints, CONSTRAINT_KEYS.ENFORCE_MEMBER_ROLES)) {
      if (!isRoleCapable(member, role)) {
        return { eligible: false, reason: `Member cannot perform role: ${role}` }
      }
    }

    // Check ENFORCE_UNDERSTUDY_BEFORE_ROLE: a trainee for base role X may only
    // be assigned to the real role X after understudying it (>= N sessions on
    // strictly earlier dates). Conversely, understudy sessions are capped: once
    // a trainee has completed their N sessions they are considered qualified,
    // so further "X-understudy" assignments are blocked (they should perform the
    // real role instead of understudying again).
    if (isConstraintEnabled(this.rosterConstraints, CONSTRAINT_KEYS.ENFORCE_UNDERSTUDY_BEFORE_ROLE)) {
      if (isUnderstudyRole(role)) {
        const baseRole = baseRoleOf(role)
        if ((member.understudyFor || []).includes(baseRole)) {
          const priorSessions = this.tracker.getRoleCountBefore(memberId, role, event.date)
          if (priorSessions >= UNDERSTUDY_MIN_SESSIONS) {
            return {
              eligible: false,
              reason: `Member has already completed ${UNDERSTUDY_MIN_SESSIONS} understudy session(s) for ${baseRole} and no longer needs to understudy`,
            }
          }
        }
      } else if ((member.understudyFor || []).includes(role)) {
        const priorSessions = this.tracker.getRoleCountBefore(memberId, understudySlotRole(role), event.date)
        if (priorSessions < UNDERSTUDY_MIN_SESSIONS) {
          return {
            eligible: false,
            reason: `Member must understudy ${role} at least ${UNDERSTUDY_MIN_SESSIONS} time(s) before performing it`,
          }
        }
      }
    }
    
    // Check ENFORCE_MEMBER_AVAILABILITY
    if (isConstraintEnabled(this.rosterConstraints, CONSTRAINT_KEYS.ENFORCE_MEMBER_AVAILABILITY)) {
      if (!checkMemberAvailability(memberId, event.date, this.memberConstraints)) {
        return { eligible: false, reason: 'Member unavailable on this date' }
      }
    }
    
    // Check ONLY_ONCE_PER_EVENT
    if (isConstraintEnabled(this.rosterConstraints, CONSTRAINT_KEYS.ONLY_ONCE_PER_EVENT)) {
      if (isAssignedToEvent(memberId, currentRoster)) {
        return { eligible: false, reason: 'Member already assigned to another role on this event' }
      }
    }
    
    // Check ONLY_ONCE_PER_WEEK
    if (isConstraintEnabled(this.rosterConstraints, CONSTRAINT_KEYS.ONLY_ONCE_PER_WEEK)) {
      const weeklyCount = this.tracker.getWeeklyAssignmentCount(memberId, event.date)
      if (weeklyCount > 0) {
        return { eligible: false, reason: 'Member already assigned this week' }
      }
    }
    
    // Check MAX_ASSIGNMENTS_PER_MONTH
    if (isConstraintEnabled(this.rosterConstraints, CONSTRAINT_KEYS.MAX_ASSIGNMENTS_PER_MONTH)) {
      const maxLimit = getConstraintValue(this.rosterConstraints, CONSTRAINT_KEYS.MAX_ASSIGNMENTS_PER_MONTH)
      const monthlyCount = this.tracker.getMonthlyAssignmentCount(memberId, event.date)
      if (monthlyCount >= maxLimit) {
        return { eligible: false, reason: `Member has reached max assignments this month (${maxLimit})` }
      }
    }
    
    return { eligible: true, reason: null }
  }

  /**
   * Lightweight look-ahead used by understudy seeding: could this trainee
   * plausibly PERFORM the real `role` on `event`, assuming they will have
   * completed their understudy session by then? Checks availability, role
   * capability and once-per-event — but deliberately ignores the
   * understudy-before-role gate (seeding is what will satisfy it) so we can
   * tell whether seeding this trainee here would actually pay off later.
   */
  canBePromotedTo(memberId, role, event) {
    const member = this.members.find(m => m.id === memberId)
    if (!member || member.include === false) return false
    if (!isRoleCapable(member, role)) return false
    if (!checkMemberAvailability(memberId, event.date, this.memberConstraints)) return false
    if (isAssignedToEvent(memberId, (event.roster || []).filter(s => s.member_id))) return false
    return true
  }
  
  /**
   * Get all eligible members for a role on an event
   */
  getEligibleMembers(role, event, currentRoster = []) {
    const eligibleMembers = []
    
    this.members.forEach(member => {
      if (member.include === false) return
      
      const result = this.isEligible(member.id, role, event, currentRoster)
      if (result.eligible) {
        eligibleMembers.push(member.id)
      }
    })
    
    return eligibleMembers
  }
}
