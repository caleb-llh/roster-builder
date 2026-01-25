/**
 * Roster Generation Algorithm
 * 
 * Generates assignments for unassigned roles using a greedy algorithm with weighted scoring.
 * 
 * Process:
 * 1. Initialize tracking of existing assignments
 * 2. Process events chronologically
 * 3. For each unassigned role:
 *    - Find eligible members (satisfy hard constraints)
 *    - Score eligible members (optimize for preferences)
 *    - Assign best-scored member
 *    - Update tracking
 * 
 * Returns: New events array with filled assignments
 */

import { AssignmentTracker } from './assignmentTracker'
import { EligibilityChecker } from './eligibilityChecker'
import { ScoringEngine } from './scoringEngine'

export function generateRoster(
  events,
  members,
  memberConstraints,
  memberPreferences,
  rosterConstraints,
  rosterPreferences,
  rosterPeriod
) {
  // Initialize components
  const tracker = new AssignmentTracker(members, events, rosterPeriod)
  const eligibilityChecker = new EligibilityChecker(members, memberConstraints, rosterConstraints, tracker)
  const scoringEngine = new ScoringEngine(rosterPreferences, memberPreferences, tracker)
  
  // Clone events to avoid mutating original
  const newEvents = JSON.parse(JSON.stringify(events))
  
  // Sort events chronologically
  const sortedEvents = newEvents.sort((a, b) => new Date(a.date) - new Date(b.date))
  
  // Statistics tracking
  const stats = {
    totalRoles: 0,
    assignedRoles: 0,
    generatedAssignments: 0,
    unassignableRoles: []
  }
  
  // Process each event
  sortedEvents.forEach(event => {
    if (!event.roster) return
    
    // Get current roster (what's already assigned in this event)
    const currentRoster = event.roster.filter(r => r.member_id)
    
    // Process each role in the event
    event.roster.forEach(roleAssignment => {
      stats.totalRoles++
      
      // Skip if already assigned
      if (roleAssignment.member_id) {
        stats.assignedRoles++
        return
      }
      
      const role = roleAssignment.role
      
      // Find eligible members for this role
      const eligibleMembers = eligibilityChecker.getEligibleMembers(role, event, currentRoster)
      
      if (eligibleMembers.length === 0) {
        // No eligible members found
        stats.unassignableRoles.push({
          event: event.name,
          date: event.date,
          role: role,
          reason: 'No eligible members available'
        })
        return
      }
      
      // Score and rank eligible members
      const rankedMembers = scoringEngine.scoreAndRankMembers(eligibleMembers, role, event)
      
      // Assign the best-scored member
      const bestMember = rankedMembers[0]
      roleAssignment.member_id = bestMember.memberId
      roleAssignment.isGenerated = true // Mark as generated
      
      // Update tracking
      tracker.recordAssignment(bestMember.memberId, event.date, event.day_of_week, role)
      currentRoster.push(roleAssignment)
      
      stats.assignedRoles++
      stats.generatedAssignments++
    })
  })
  
  return {
    events: newEvents,
    stats,
    fairnessMetrics: {
      assignmentStdDev: tracker.getFairnessScore(),
      spreadStdDev: tracker.getSpreadScore(),
      assignmentsByMember: tracker.memberAssignments
    }
  }
}

/**
 * Validate and preview roster generation without modifying events
 */
export function previewRosterGeneration(
  events,
  members,
  memberConstraints,
  memberPreferences,
  rosterConstraints,
  rosterPreferences,
  rosterPeriod
) {
  const result = generateRoster(
    events,
    members,
    memberConstraints,
    memberPreferences,
    rosterConstraints,
    rosterPreferences,
    rosterPeriod
  )
  
  return {
    stats: result.stats,
    fairnessMetrics: result.fairnessMetrics,
    canGenerate: result.stats.unassignableRoles.length === 0,
    warnings: result.stats.unassignableRoles
  }
}
