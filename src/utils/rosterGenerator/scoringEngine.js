/**
 * Score eligible members based on soft preferences
 */

import { PREFERENCE_KEYS, isPreferenceEnabled } from '../../schema/rosterSchema'

export class ScoringEngine {
  constructor(rosterPreferences, memberPreferences, tracker) {
    this.rosterPreferences = rosterPreferences
    this.memberPreferences = memberPreferences
    this.tracker = tracker
    this.memberAvailability = {} // Will be set by setMemberAvailability()
    
    // Scoring weights (can be tuned)
    this.weights = {
      fairness: 300,              // Highest priority: balance workload
      availability: 300,          // Prioritize rostering members with lower availability first
      consecutiveWeekends: 200,    // Avoid consecutive weekends
      dayPreference: 120,         // Member day preferences (high priority - member-level overrides roster-level)
      rolePreference: 120,        // Member role preferences (high priority - member-level preference)
      roleDiversity: 60,           // Encourage role diversity
      spread: 60,                 // Spread assignments over time
      dayBalance: 60,             // Balance number of assignments across different days of week (e.g. Sundays and Saturdays)
    }
  }
  
  /**
   * Set member availability data (called during initialization)
   */
  setMemberAvailability(availability) {
    this.memberAvailability = availability
  }
  
  /**
   * Score a member for assignment to a role on an event
   * Higher score = better choice
   */
  scoreMember(memberId, role, event) {
    let totalScore = 0
    const scores = {}
    
    // Availability: prefer members with fewer available dates (more constrained)
    const availabilityScore = this._calculateAvailabilityScore(memberId)
    scores.availability = availabilityScore
    totalScore += availabilityScore * this.weights.availability
    
    // Fairness: prefer members with fewer assignments
    if (isPreferenceEnabled(this.rosterPreferences, PREFERENCE_KEYS.SPREAD_ASSIGNMENTS) || true) {
      const fairnessScore = this._calculateFairnessScore(memberId)
      scores.fairness = fairnessScore
      totalScore += fairnessScore * this.weights.fairness * 10 // Extra weight for fairness
    }
    
    // Spread: prefer assignments that improve temporal distribution
    if (isPreferenceEnabled(this.rosterPreferences, PREFERENCE_KEYS.SPREAD_ASSIGNMENTS)) {
      const spreadScore = this._calculateSpreadScore(memberId, event.date)
      scores.spread = spreadScore
      totalScore += spreadScore * this.weights.spread
    }
    
    // Member day preference
    const dayPrefScore = this._calculateDayPreferenceScore(memberId, event.day_of_week)
    scores.dayPreference = dayPrefScore
    totalScore += dayPrefScore * this.weights.dayPreference
    
    // Member role preference
    const rolePrefScore = this._calculateRolePreferenceScore(memberId, role)
    scores.rolePreference = rolePrefScore
    totalScore += rolePrefScore * this.weights.rolePreference
    
    // Balanced day distribution
    if (isPreferenceEnabled(this.rosterPreferences, PREFERENCE_KEYS.BALANCED_DAY_DISTRIBUTION)) {
      const dayBalanceScore = this._calculateDayBalanceScore(memberId, event.day_of_week)
      scores.dayBalance = dayBalanceScore
      totalScore += dayBalanceScore * this.weights.dayBalance
    }
    
    // Avoid consecutive weekends
    if (isPreferenceEnabled(this.rosterPreferences, PREFERENCE_KEYS.AVOID_CONSECUTIVE_WEEKS)) {
      const weekendScore = this._calculateConsecutiveWeekendScore(memberId, event.date, event.day_of_week)
      scores.consecutiveWeekends = weekendScore
      totalScore += weekendScore * this.weights.consecutiveWeekends
    }
    
    // Role diversity: prefer members who haven't done this role recently
    if (isPreferenceEnabled(this.rosterPreferences, PREFERENCE_KEYS.DIVERSIFY_ROLE_ASSIGNMENTS)) {
      const diversityScore = this._calculateRoleDiversityScore(memberId, role)
      scores.roleDiversity = diversityScore
      totalScore += diversityScore * this.weights.roleDiversity
    }
    
    return {
      memberId,
      totalScore,
      breakdown: scores
    }
  }
  
  _calculateFairnessScore(memberId) {
    const assignmentCount = this.tracker.getAssignmentCount(memberId)
    
    // Get all assignment counts
    const allCounts = Object.keys(this.tracker.memberAssignments)
      .map(id => this.tracker.getAssignmentCount(id))
    
    const minCount = Math.min(...allCounts)
    const maxCount = Math.max(...allCounts)
    
    // Normalize: members with fewer assignments get higher scores
    if (maxCount === minCount) return 1.0
    return 1.0 - ((assignmentCount - minCount) / (maxCount - minCount))
  }
  
  _calculateAvailabilityScore(memberId) {
    if (!this.memberAvailability || Object.keys(this.memberAvailability).length === 0) {
      return 0.5 // Neutral if availability not calculated
    }
    
    const memberAvailable = this.memberAvailability[memberId]
    const allAvailabilities = Object.values(this.memberAvailability)
    const minAvailable = Math.min(...allAvailabilities)
    const maxAvailable = Math.max(...allAvailabilities)
    
    if (maxAvailable === minAvailable) return 0.5 // All equal
    
    // Invert: members with FEWER available dates get HIGHER scores
    // (memberAvailable - minAvailable) / (maxAvailable - minAvailable) gives 0 for min, 1 for max
    // We want 1 for min, 0 for max, so we invert:
    return 1.0 - ((memberAvailable - minAvailable) / (maxAvailable - minAvailable))
  }
  
  _calculateSpreadScore(memberId, eventDate) {
    const lastDate = this.tracker.getLastAssignmentDate(memberId)
    
    if (!lastDate) {
      return 1.0 // No previous assignment, perfect spread
    }
    
    const daysSinceLastAssignment = Math.ceil(
      (new Date(eventDate) - new Date(lastDate)) / (1000 * 60 * 60 * 24)
    )
    
    // Prefer longer gaps (normalized to 0-1, with 14+ days = 1.0)
    return Math.min(daysSinceLastAssignment / 14, 1.0)
  }
  
  _calculateDayPreferenceScore(memberId, dayOfWeek) {
    const memberPref = this.memberPreferences.find(p => p.member_id === memberId)
    
    if (!memberPref || !memberPref.days || memberPref.days.length === 0) {
      return 0.5 // Neutral if no preference
    }
    
    return memberPref.days.includes(dayOfWeek) ? 1.0 : 0.0
  }
  
  _calculateRolePreferenceScore(memberId, role) {
    const memberPref = this.memberPreferences.find(p => p.member_id === memberId)
    
    if (!memberPref || !memberPref.roles || memberPref.roles.length === 0) {
      return 0.5 // Neutral if no role preference
    }
    
    return memberPref.roles.includes(role) ? 1.0 : 0.0
  }
  
  _calculateDayBalanceScore(memberId, dayOfWeek) {
    const dayCounts = this.tracker.memberAssignments[memberId]?.byDay || {}
    const currentDayCount = dayCounts[dayOfWeek] || 0
    
    // Get counts for all days
    const allDayCounts = Object.values(dayCounts)
    if (allDayCounts.length === 0) return 1.0
    
    const minCount = Math.min(...allDayCounts, 0)
    const maxCount = Math.max(...allDayCounts)
    
    // Prefer days with fewer assignments for this member
    if (maxCount === minCount) return 1.0
    return 1.0 - ((currentDayCount - minCount) / (maxCount - minCount + 1))
  }
  
  _calculateConsecutiveWeekendScore(memberId, eventDate, dayOfWeek) {
    if (dayOfWeek !== 'Saturday' && dayOfWeek !== 'Sunday') {
      return 1.0 // Not a weekend, no penalty
    }
    
    const lastDate = this.tracker.getLastAssignmentDate(memberId)
    if (!lastDate) return 1.0
    
    const lastEventDate = new Date(lastDate)
    const currentEventDate = new Date(eventDate)
    const daysDiff = Math.ceil((currentEventDate - lastEventDate) / (1000 * 60 * 60 * 24))
    
    // Check if last assignment was on the previous weekend (6-8 days ago)
    if (daysDiff >= 6 && daysDiff <= 8) {
      return 0.0 // Penalty for consecutive weekends
    }
    
    return 1.0
  }
  
  _calculateRoleDiversityScore(memberId, role) {
    const roleCount = this.tracker.getRoleAssignmentCount(memberId, role)
    
    // Get all role counts for this member
    const allRoleCounts = Object.values(this.tracker.memberRoleAssignments[memberId] || {})
    if (allRoleCounts.length === 0) return 1.0
    
    const minCount = Math.min(...allRoleCounts, 0)
    const maxCount = Math.max(...allRoleCounts)
    
    // Prefer roles this member hasn't done as much
    if (maxCount === minCount) return 1.0
    return 1.0 - ((roleCount - minCount) / (maxCount - minCount + 1))
  }
  
  /**
   * Score all eligible members and return sorted by score (highest first)
   */
  scoreAndRankMembers(eligibleMemberIds, role, event) {
    const scoredMembers = eligibleMemberIds.map(memberId => 
      this.scoreMember(memberId, role, event)
    )
    
    return scoredMembers.sort((a, b) => b.totalScore - a.totalScore)
  }
}
