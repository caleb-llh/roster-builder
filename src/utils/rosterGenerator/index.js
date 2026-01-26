/**
 * Roster Generation Algorithm with Multi-Start Optimization
 * 
 * Generates assignments for unassigned roles using a greedy algorithm with weighted scoring.
 * Uses multi-start optimization to explore different solution paths and select the best result.
 * 
 * Process:
 * 1. Run multiple generations with varied event/member ordering (deterministic)
 * 2. Score each result using weighted quality metrics
 * 3. Select and return the best solution
 * 4. Each generation:
 *    - Initialize tracking of existing assignments
 *    - Process events chronologically
 *    - For each unassigned role:
 *      - Find eligible members (satisfy hard constraints)
 *      - Score eligible members (optimize for preferences)
 *      - Assign best-scored member
 *      - Update tracking
 * 
 * Returns: Best result from all runs with quality metrics
 */

import { AssignmentTracker } from './assignmentTracker'
import { EligibilityChecker } from './eligibilityChecker'
import { ScoringEngine } from './scoringEngine'

/**
 * Main entry point with multi-start optimization
 */
export function generateRoster(
  events,
  members,
  memberConstraints,
  memberPreferences,
  rosterConstraints,
  rosterPreferences,
  rosterPeriod,
  options = {}
) {
  const { multiStart = true, runs = 20 } = options
  
  if (!multiStart || runs <= 1) {
    // Single run mode
    return generateRosterSingleRun(
      events,
      members,
      memberConstraints,
      memberPreferences,
      rosterConstraints,
      rosterPreferences,
      rosterPeriod
    )
  }
  
  // Multi-start optimization
  const results = []
  
  for (let run = 0; run < runs; run++) {
    // Vary event and member ordering deterministically
    const eventOrder = getEventOrderForRun(events, run)
    const memberOrder = getMemberOrderForRun(members, run)
    
    // Generate with these variations
    const result = generateRosterSingleRun(
      eventOrder,
      memberOrder,
      memberConstraints,
      memberPreferences,
      rosterConstraints,
      rosterPreferences,
      rosterPeriod
    )
    
    // Restore chronological event order
    result.events.sort((a, b) => new Date(a.date) - new Date(b.date))
    
    // Calculate quality score for comparison
    const quality = calculateRosterQuality(result, memberPreferences)
    
    results.push({
      ...result,
      quality,
      runNumber: run
    })
  }
  
  // Select best result
  results.sort((a, b) => b.quality - a.quality)
  const best = results[0]
  
  // Add multi-start metadata
  best.stats.multiStartInfo = {
    totalRuns: runs,
    bestRun: best.runNumber,
    qualityRange: {
      best: results[0].quality.toFixed(2),
      worst: results[results.length - 1].quality.toFixed(2)
    }
  }
  
  return best
}

/**
 * Single generation run (core algorithm)
 */
function generateRosterSingleRun(
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
  
  // Calculate member availability (count how many events each member is available for)
  const memberAvailability = calculateMemberAvailability(members, memberConstraints, events)
  scoringEngine.setMemberAvailability(memberAvailability)
  
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
    rosterPeriod,
    { multiStart: false } // Single run for preview
  )
  
  return {
    stats: result.stats,
    fairnessMetrics: result.fairnessMetrics,
    canGenerate: result.stats.unassignableRoles.length === 0,
    warnings: result.stats.unassignableRoles
  }
}

/**
 * Deterministically vary event processing order for each run
 * Rotates the starting point through the chronologically sorted events
 */
function getEventOrderForRun(events, runNumber) {
  const sorted = [...events].sort((a, b) => new Date(a.date) - new Date(b.date))
  
  if (sorted.length === 0) return sorted
  
  // Rotate start point: each run starts at a different event position
  const startIndex = runNumber % sorted.length
  
  // Rotate array: [start..end, 0..start-1]
  return [...sorted.slice(startIndex), ...sorted.slice(0, startIndex)]
}

/**
 * Deterministically vary member priority for tie-breaking
 */
function getMemberOrderForRun(members, runNumber) {
  return members.map((m, i) => ({
    ...m,
    _priority: (i + runNumber * 7) % members.length
  })).sort((a, b) => a._priority - b._priority)
}

/**
 * Calculate overall roster quality score (higher is better)
 */
function calculateRosterQuality(result, memberPreferences) {
  const { fairnessMetrics, stats, events } = result
  
  // Count preference violations
  let dayPrefViolations = 0
  let rolePrefViolations = 0
  
  events.forEach(event => {
    event.roster?.forEach(assignment => {
      if (assignment.member_id) {
        const memberPref = memberPreferences?.find(p => p.member_id === assignment.member_id)
        
        if (memberPref?.days && !memberPref.days.includes(event.day_of_week)) {
          dayPrefViolations++
        }
        
        if (memberPref?.roles && !memberPref.roles.includes(assignment.role)) {
          rolePrefViolations++
        }
      }
    })
  })
  
  // Weight-based penalty (lower cost = better quality)
  // Using same weights as scoring engine to penalize violations
  const cost = 
    fairnessMetrics.assignmentStdDev * 100 +    // fairness weight
    fairnessMetrics.spreadStdDev * 50 +          // spread weight
    dayPrefViolations * 150 +                    // dayPreference weight
    rolePrefViolations * 120 +                   // rolePreference weight
    stats.unassignableRoles.length * 1000        // Heavily penalize unassignable roles
  
  // Return negative cost (so higher = better)
  return -cost
}

/**
 * Calculate how many events each member is available for
 * Lower availability = more unavailable dates = higher priority
 */
function calculateMemberAvailability(members, memberConstraints, events) {
  const availability = {}
  
  members.forEach(member => {
    const memberConstraint = memberConstraints.find(c => c.member_id === member.id)
    const unavailableDates = memberConstraint?.unavailable_dates || []
    
    // Count how many events this member is available for
    let availableCount = 0
    events.forEach(event => {
      if (!unavailableDates.includes(event.date)) {
        availableCount++
      }
    })
    
    availability[member.id] = availableCount
  })
  
  return availability
}

