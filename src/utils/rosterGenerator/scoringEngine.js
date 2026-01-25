/**
 * Score eligible members based on soft preferences
 */

import { PREFERENCE_KEYS, isPreferenceEnabled } from '../../schema/rosterSchema'

export class ScoringEngine {
  constructor(rosterPreferences, memberPreferences, tracker) {
    this.rosterPreferences = rosterPreferences
    this.memberPreferences = memberPreferences
    this.tracker = tracker
    
    // Scoring weights (can be tuned)
    this.weights = {
      fairness: 100,              // Highest priority: balance workload
      dayPreference: 150,         // Member day preferences (high priority - member-level overrides roster-level)
      spread: 50,                 // Spread assignments over time
      consecutiveWeekends: 40,    // Avoid consecutive weekends
      dayBalance: 20,             // Balance days across member's assignments
      roleDiversity: 60           // Encourage role diversity
    }
  }
  
  /**
   * Score a member for assignment to a role on an event
   * Higher score = better choice
   */
  scoreMember(memberId, role, event) {
    let totalScore = 0
    const scores = {}
    
    // Fairness: prefer members with fewer assignments
    if (isPreferenceEnabled(this.rosterPreferences, PREFERENCE_KEYS.SPREAD_ASSIGNMENTS) || true) {
      const fairnessScore = this._calculateFairnessScore(memberId)
      scores.fairness = fairnessScore
      totalScore += fairnessScore * this.weights.fairness
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
