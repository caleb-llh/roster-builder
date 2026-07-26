/**
 * Roster Generation Algorithm
 *
 * Generates assignments for unassigned roles in two phases:
 *
 * Phase 1 — Greedy construction (initial solution):
 *   - Initialize tracking of existing assignments
 *   - Process events chronologically
 *   - For each unassigned role: find eligible members (hard constraints),
 *     score them (soft preferences, seeded tie-break), assign the best via the
 *     reversible move layer
 *
 * Phase 2 — Local search (optimization):
 *   - Hill-climb by applying the best improving move (member↔member swap or
 *     filling an empty slot) until no improving move exists
 *
 * A fixed seed keeps output deterministic. Every meaningful decision is captured
 * by a verbose ActionLogger and returned as result.log / result.logEntries.
 *
 * Returns: { events, stats, fairnessMetrics, quality, log, logEntries }
 */

import { AssignmentTracker } from './assignmentTracker'
import { EligibilityChecker } from './eligibilityChecker'
import { ScoringEngine, SCORING_WEIGHTS } from './scoringEngine'
import { RosterState } from './rosterState'
import { optimizeRoster } from './localSearch'
import { createRng } from './rng'
import { ActionLogger, NULL_LOGGER } from './actionLog'

/**
 * Main entry point.
 *
 * Single seeded greedy construction (Phase 1) followed by local-search
 * optimization (Phase 2). The seed keeps output deterministic; local search
 * does the quality optimization, so no multi-restart loop is needed.
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
  const { logging = true } = options
  const logger = new ActionLogger(logging)

  logger.info('Roster generation started', {
    events: events.length,
    members: members.filter(m => m.include !== false).length,
  })

  const result = generateRosterSingleRun(
    events,
    members,
    memberConstraints,
    memberPreferences,
    rosterConstraints,
    rosterPreferences,
    rosterPeriod,
    { logger }
  )

  // Restore chronological event order
  result.events.sort((a, b) => new Date(a.date) - new Date(b.date))

  const quality = calculateRosterQuality(result, memberPreferences)
  logger.success(`Generation complete (quality ${quality.toFixed(2)})`)

  result.quality = quality
  result.log = logger.toLines()
  result.logEntries = logger.entries
  return result
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
  rosterPeriod,
  options = {}
) {
  const { seed = 1, localSearch = true, logger = NULL_LOGGER } = options
  const rng = createRng(seed)

  // Initialize components
  const tracker = new AssignmentTracker(members, events, rosterPeriod)
  const eligibilityChecker = new EligibilityChecker(members, memberConstraints, rosterConstraints, tracker)
  const scoringEngine = new ScoringEngine(rosterPreferences, memberPreferences, tracker)
  
  // Calculate member availability (count how many events each member is available for)
  const memberAvailability = calculateMemberAvailability(members, memberConstraints, events)
  scoringEngine.setMemberAvailability(memberAvailability)
  logger.debug('Member availability (events available for)', memberAvailability)
  
  // Clone events to avoid mutating original
  const newEvents = JSON.parse(JSON.stringify(events))
  
  // Sort events chronologically
  const sortedEvents = newEvents.sort((a, b) => new Date(a.date) - new Date(b.date))
  
  // Reversible state layer: all assignments go through applyMove so the tracker
  // and events stay in lock-step (and so the same primitives power local search).
  const state = new RosterState(sortedEvents, tracker)
  
  // Statistics tracking
  const stats = {
    totalRoles: 0,
    assignedRoles: 0,
    generatedAssignments: 0,
    unassignableRoles: []
  }
  
  // --- Phase 1: greedy construction (initial solution) ---
  logger.debug('Phase 1: greedy construction')
  sortedEvents.forEach((event, eventIndex) => {
    if (!event.roster) return
    
    // Get current roster (what's already assigned in this event)
    const currentRoster = event.roster.filter(r => r.member_id)
    
    // Process each role in the event
    event.roster.forEach((roleAssignment, roleIndex) => {
      stats.totalRoles++
      
      // Skip if already assigned
      if (roleAssignment.member_id) {
        stats.assignedRoles++
        logger.debug(`${event.date} ${event.name} / ${roleAssignment.role}: pre-assigned`, { member: roleAssignment.member_id })
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
        logger.warn(`${event.date} ${event.name} / ${role}: no eligible members`)
        return
      }
      
      // Score and rank eligible members (seeded shuffle breaks ties randomly
      // but reproducibly, giving each restart a different initial solution).
      const rankedMembers = scoringEngine.scoreAndRankMembers(rng.shuffle(eligibleMembers), role, event)
      
      // Assign the best-scored member via the reversible move layer
      const bestMember = rankedMembers[0]
      state.applyMove({ slot: { eventIndex, roleIndex }, memberId: bestMember.memberId })
      currentRoster.push(roleAssignment)
      
      logger.debug(
        `${event.date} ${event.name} / ${role}: assign ${bestMember.memberId}`,
        {
          score: Number(bestMember.totalScore.toFixed(1)),
          eligible: eligibleMembers.length,
          runnerUp: rankedMembers[1]
            ? { member: rankedMembers[1].memberId, score: Number(rankedMembers[1].totalScore.toFixed(1)) }
            : null,
        }
      )
      
      stats.assignedRoles++
      stats.generatedAssignments++
    })
  })
  logger.info(`Phase 1 done: ${stats.generatedAssignments} assigned, ${stats.unassignableRoles.length} unfilled`)
  
  // --- Phase 2: local search (swaps + fill-empty) over reversible moves ---
  // Hill-climb until no improving move exists (with a safety iteration cap).
  if (localSearch) {
    logger.debug('Phase 2: local search')
    const before = evaluateState(state, memberPreferences)
    const { iterations } = optimizeRoster(
      state,
      eligibilityChecker,
      (s) => evaluateState(s, memberPreferences),
      { logger }
    )
    const after = evaluateState(state, memberPreferences)
    recomputeStats(sortedEvents, stats)
    logger.info(
      `Phase 2 done: ${iterations} iteration(s), ` +
      `quality ${before.toFixed(1)} -> ${after.toFixed(1)} (Δ ${(after - before).toFixed(1)})`
    )
  }
  
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
 * Recompute assignment statistics after local search may have filled or moved
 * assignments. unassignableRoles keeps only slots that are still empty.
 */
function recomputeStats(events, stats) {
  let assigned = 0
  let generated = 0
  const unassignable = []
  events.forEach(event => {
    event.roster?.forEach(roleAssignment => {
      if (roleAssignment.member_id) {
        assigned++
        if (roleAssignment.isGenerated) generated++
      } else {
        unassignable.push({
          event: event.name,
          date: event.date,
          role: roleAssignment.role,
          reason: 'No eligible members available'
        })
      }
    })
  })
  stats.assignedRoles = assigned
  stats.generatedAssignments = generated
  stats.unassignableRoles = unassignable
}

/**
 * Calculate overall roster quality score (higher is better).
 * Wrapper kept for multi-start selection; delegates to evaluateState.
 */
function calculateRosterQuality(result, memberPreferences) {
  return evaluateState(
    { events: result.events, tracker: { getFairnessScore: () => result.fairnessMetrics.assignmentStdDev, getSpreadScore: () => result.fairnessMetrics.spreadStdDev } },
    memberPreferences
  )
}

/**
 * Roster quality objective (higher is better), computed directly from a
 * RosterState-like object ({ events, tracker }). Shared by the multi-start
 * selection and the local-search loop so both optimize the same objective.
 */
function evaluateState(state, memberPreferences) {
  const { events, tracker } = state

  // Count preference violations and unfilled slots.
  let dayPrefViolations = 0
  let rolePrefViolations = 0
  let emptySlots = 0

  events.forEach(event => {
    event.roster?.forEach(assignment => {
      if (!assignment.member_id) {
        emptySlots++
        return
      }
      const memberPref = memberPreferences?.find(p => p.member_id === assignment.member_id)

      if (memberPref?.days && !memberPref.days.includes(event.day_of_week)) {
        dayPrefViolations++
      }
      if (memberPref?.roles && !memberPref.roles.includes(assignment.role)) {
        rolePrefViolations++
      }
    })
  })

  // Weight-based penalty (lower cost = better quality). Reuses the shared
  // SCORING_WEIGHTS so quality selection stays aligned with the per-candidate
  // scoring engine.
  const cost =
    tracker.getFairnessScore() * SCORING_WEIGHTS.fairness +
    tracker.getSpreadScore() * SCORING_WEIGHTS.spread +
    dayPrefViolations * SCORING_WEIGHTS.dayPreference +
    rolePrefViolations * SCORING_WEIGHTS.rolePreference +
    emptySlots * 1000        // Heavily penalize unfilled roles

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

