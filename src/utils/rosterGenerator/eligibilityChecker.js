/**
 * Check if a member is eligible for a role assignment based on hard constraints
 */

import { 
  checkMemberAvailability,
  checkMemberRoleCompatibility,
  isAssignedToEvent
} from '../constraintChecking'
import { CONSTRAINT_KEYS, isConstraintEnabled, getConstraintValue } from '../../schema/rosterSchema'

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
      if (!checkMemberRoleCompatibility(member, role)) {
        return { eligible: false, reason: `Member cannot perform role: ${role}` }
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
