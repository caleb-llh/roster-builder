import { describe, it, expect } from 'vitest'
import { generateRoster, previewRosterGeneration } from './index'
import { CONSTRAINT_KEYS, PREFERENCE_KEYS } from '../../schema/rosterSchema'

describe('Roster Generator', () => {
  const createTestMembers = () => [
    { id: 'alice', name: 'Alice', telegram: '@alice', include: true, roles: ['vm', 'cam-1'] },
    { id: 'bob', name: 'Bob', telegram: '@bob', include: true, roles: ['vm', 'cam-1', 'cam-2'] },
    { id: 'charlie', name: 'Charlie', telegram: '@charlie', include: true, roles: ['cam-1', 'cam-2'] },
  ]

  const createTestEvents = () => [
    {
      name: 'Service 1',
      date: '2026-02-01',
      day_of_week: 'Sunday',
      reporting_time: '09:00',
      roster: [
        { role: 'vm', member_id: null },
        { role: 'cam-1', member_id: null }
      ]
    },
    {
      name: 'Service 2',
      date: '2026-02-08',
      day_of_week: 'Sunday',
      reporting_time: '09:00',
      roster: [
        { role: 'vm', member_id: null },
        { role: 'cam-1', member_id: null }
      ]
    }
  ]

  const rosterConstraints = {
    [CONSTRAINT_KEYS.ENFORCE_MEMBER_ROLES]: true,
    [CONSTRAINT_KEYS.ENFORCE_MEMBER_AVAILABILITY]: true,
    [CONSTRAINT_KEYS.ONLY_ONCE_PER_EVENT]: true,
    [CONSTRAINT_KEYS.ONLY_ONCE_PER_WEEK]: true,
    [CONSTRAINT_KEYS.MAX_ASSIGNMENTS_PER_MONTH]: 2
  }

  const rosterPreferences = {
    [PREFERENCE_KEYS.AVOID_CONSECUTIVE_WEEKS]: true,
    [PREFERENCE_KEYS.BALANCED_DAY_DISTRIBUTION]: true,
    [PREFERENCE_KEYS.SPREAD_ASSIGNMENTS]: true
  }

  const rosterPeriod = {
    start_date: '2026-02-01',
    end_date: '2026-02-28'
  }

  describe('Basic Generation', () => {
    it('should assign members to unassigned roles', () => {
      const members = createTestMembers()
      const events = createTestEvents()
      
      const result = generateRoster(
        events,
        members,
        [],
        [],
        rosterConstraints,
        rosterPreferences,
        rosterPeriod,
        { multiStart: false } // Single run for basic test
      )

      expect(result.events[0].roster[0].member_id).toBeTruthy()
      expect(result.events[0].roster[1].member_id).toBeTruthy()
      expect(result.stats.generatedAssignments).toBeGreaterThan(0)
    })

    it('should not overwrite existing assignments', () => {
      const members = createTestMembers()
      const events = createTestEvents()
      events[0].roster[0].member_id = 'alice'
      
      const result = generateRoster(
        events,
        members,
        [],
        [],
        rosterConstraints,
        rosterPreferences,
        rosterPeriod,
        { multiStart: false }
      )

      expect(result.events[0].roster[0].member_id).toBe('alice')
      expect(result.stats.assignedRoles).toBeGreaterThanOrEqual(1)
    })

    it('should provide generation statistics', () => {
      const members = createTestMembers()
      const events = createTestEvents()
      
      const result = generateRoster(
        events,
        members,
        [],
        [],
        rosterConstraints,
        rosterPreferences,
        rosterPeriod
      )

      expect(result.stats).toHaveProperty('totalRoles')
      expect(result.stats).toHaveProperty('assignedRoles')
      expect(result.stats).toHaveProperty('generatedAssignments')
      expect(result.stats.totalRoles).toBe(4)
    })
  })

  describe('Hard Constraints', () => {
    it('should respect member role compatibility', () => {
      const members = [
        { id: 'alice', name: 'Alice', include: true, roles: ['cam-1'] } // Cannot do VM
      ]
      const events = [{
        name: 'Service',
        date: '2026-02-01',
        day_of_week: 'Sunday',
        roster: [{ role: 'vm', member_id: null }]
      }]
      
      const result = generateRoster(
        events,
        members,
        [],
        [],
        rosterConstraints,
        rosterPreferences,
        rosterPeriod
      )

      expect(result.events[0].roster[0].member_id).toBeFalsy()
      expect(result.stats.unassignableRoles).toHaveLength(1)
    })

    it('should respect member unavailability', () => {
      const members = [{ id: 'alice', name: 'Alice', include: true, roles: ['vm'] }]
      const events = [{
        name: 'Service',
        date: '2026-02-01',
        day_of_week: 'Sunday',
        roster: [{ role: 'vm', member_id: null }]
      }]
      const constraints = [{
        member_id: 'alice',
        unavailable_dates: ['2026-02-01']
      }]
      
      const result = generateRoster(
        events,
        members,
        constraints,
        [],
        rosterConstraints,
        rosterPreferences,
        rosterPeriod
      )

      expect(result.events[0].roster[0].member_id).toBeFalsy()
    })

    it('should enforce ONLY_ONCE_PER_EVENT', () => {
      const members = [{ id: 'alice', name: 'Alice', include: true, roles: ['vm', 'cam-1'] }]
      const events = [{
        name: 'Service',
        date: '2026-02-01',
        day_of_week: 'Sunday',
        roster: [
          { role: 'vm', member_id: null },
          { role: 'cam-1', member_id: null }
        ]
      }]
      
      const result = generateRoster(
        events,
        members,
        [],
        [],
        rosterConstraints,
        rosterPreferences,
        rosterPeriod
      )

      const assignedMembers = result.events[0].roster
        .filter(r => r.member_id)
        .map(r => r.member_id)
      
      const uniqueMembers = new Set(assignedMembers)
      expect(uniqueMembers.size).toBe(assignedMembers.length)
    })

    it('should enforce ONLY_ONCE_PER_WEEK', () => {
      const members = createTestMembers()
      const events = [
        {
          name: 'Saturday Service',
          date: '2026-02-07',
          day_of_week: 'Saturday',
          roster: [{ role: 'vm', member_id: null }]
        },
        {
          name: 'Sunday Service',
          date: '2026-02-08',
          day_of_week: 'Sunday',
          roster: [{ role: 'vm', member_id: null }]
        }
      ]
      
      const result = generateRoster(
        events,
        members,
        [],
        [],
        rosterConstraints,
        rosterPreferences,
        rosterPeriod
      )

      const saturdayVm = result.events[0].roster[0].member_id
      const sundayVm = result.events[1].roster[0].member_id
      
      if (saturdayVm && sundayVm) {
        expect(saturdayVm).not.toBe(sundayVm)
      }
    })
  })

  describe('Fairness', () => {
    it('should distribute assignments fairly among members', () => {
      const members = createTestMembers()
      const events = Array.from({ length: 4 }, (_, i) => ({
        name: `Service ${i + 1}`,
        date: `2026-02-${String((i + 1) * 7).padStart(2, '0')}`,
        day_of_week: 'Sunday',
        roster: [{ role: 'cam-1', member_id: null }]
      }))
      
      const result = generateRoster(
        events,
        members,
        [],
        [],
        { ...rosterConstraints, ONLY_ONCE_PER_WEEK: false },
        rosterPreferences,
        rosterPeriod
      )

      const assignmentCounts = {}
      result.events.forEach(event => {
        event.roster.forEach(r => {
          if (r.member_id) {
            assignmentCounts[r.member_id] = (assignmentCounts[r.member_id] || 0) + 1
          }
        })
      })

      const counts = Object.values(assignmentCounts)
      const max = Math.max(...counts)
      const min = Math.min(...counts)
      
      // Distribution should be relatively balanced
      expect(max - min).toBeLessThanOrEqual(2)
    })
  })

  describe('Preview Mode', () => {
    it('should provide preview without modifying events', () => {
      const members = createTestMembers()
      const events = createTestEvents()
      const originalEvents = JSON.parse(JSON.stringify(events))
      
      const preview = previewRosterGeneration(
        events,
        members,
        [],
        [],
        rosterConstraints,
        rosterPreferences,
        rosterPeriod
      )

      expect(preview).toHaveProperty('stats')
      expect(preview).toHaveProperty('fairnessMetrics')
      expect(preview).toHaveProperty('canGenerate')
      expect(events).toEqual(originalEvents)
    })

    it('should indicate when generation is possible', () => {
      const members = createTestMembers()
      const events = createTestEvents()
      
      const preview = previewRosterGeneration(
        events,
        members,
        [],
        [],
        rosterConstraints,
        rosterPreferences,
        rosterPeriod
      )

      expect(preview.canGenerate).toBe(true)
      expect(preview.warnings).toHaveLength(0)
    })

    it('should warn about unassignable roles', () => {
      const members = [{ id: 'alice', name: 'Alice', include: true, roles: ['cam-1'] }]
      const events = [{
        name: 'Service',
        date: '2026-02-01',
        day_of_week: 'Sunday',
        roster: [{ role: 'vm', member_id: null }]
      }]
      
      const preview = previewRosterGeneration(
        events,
        members,
        [],
        [],
        rosterConstraints,
        rosterPreferences,
        rosterPeriod
      )

      expect(preview.canGenerate).toBe(false)
      expect(preview.warnings.length).toBeGreaterThan(0)
    })
  })

  describe('Member Preferences', () => {
    it('should consider member day preferences in scoring', () => {
      const members = [
        { id: 'alice', name: 'Alice', include: true, roles: ['vm'] },
        { id: 'bob', name: 'Bob', include: true, roles: ['vm'] }
      ]
      const events = [{
        name: 'Sunday Service',
        date: '2026-02-01',
        day_of_week: 'Sunday',
        roster: [{ role: 'vm', member_id: null }]
      }]
      const preferences = [
        { member_id: 'alice', days: ['Sunday'] }
      ]
      
      const result = generateRoster(
        events,
        members,
        [],
        preferences,
        rosterConstraints,
        rosterPreferences,
        rosterPeriod
      )

      // Alice prefers Sunday, should likely be assigned
      expect(result.events[0].roster[0].member_id).toBe('alice')
    })

    it('should consider member role preferences in scoring', () => {
      const members = [
        { id: 'alice', name: 'Alice', include: true, roles: ['vm', 'cam-1'] },
        { id: 'bob', name: 'Bob', include: true, roles: ['vm', 'cam-1'] }
      ]
      const events = [{
        name: 'Sunday Service',
        date: '2026-02-01',
        day_of_week: 'Sunday',
        roster: [
          { role: 'vm', member_id: null },
          { role: 'cam-1', member_id: null }
        ]
      }]
      const preferences = [
        { member_id: 'alice', roles: ['cam-1'] }
      ]
      
      const result = generateRoster(
        events,
        members,
        [],
        preferences,
        rosterConstraints,
        rosterPreferences,
        rosterPeriod
      )

      // Alice prefers cam-1, should be assigned to cam-1 role
      const aliceAssignment = result.events[0].roster.find(r => r.member_id === 'alice')
      expect(aliceAssignment).toBeTruthy()
      expect(aliceAssignment.role).toBe('cam-1')
    })

    it('should prioritize role preferences when multiple members are eligible', () => {
      const members = [
        { id: 'alice', name: 'Alice', include: true, roles: ['support'] },
        { id: 'bob', name: 'Bob', include: true, roles: ['support'] },
        { id: 'charlie', name: 'Charlie', include: true, roles: ['support'] }
      ]
      const events = [{
        name: 'Service',
        date: '2026-02-01',
        day_of_week: 'Sunday',
        roster: [{ role: 'support', member_id: null }]
      }]
      const preferences = [
        { member_id: 'bob', roles: ['support'] }
      ]
      
      const result = generateRoster(
        events,
        members,
        [],
        preferences,
        rosterConstraints,
        rosterPreferences,
        rosterPeriod
      )

      // Bob has role preference for support, should be preferred
      expect(result.events[0].roster[0].member_id).toBe('bob')
    })

    it('should handle combined day and role preferences', () => {
      const members = [
        { id: 'alice', name: 'Alice', include: true, roles: ['lead', 'support'] },
        { id: 'bob', name: 'Bob', include: true, roles: ['lead', 'support'] },
        { id: 'charlie', name: 'Charlie', include: true, roles: ['lead', 'support'] }
      ]
      const events = [
        {
          name: 'Saturday Service',
          date: '2026-02-01',
          day_of_week: 'Saturday',
          roster: [
            { role: 'support', member_id: null }
          ]
        }
      ]
      const preferences = [
        { member_id: 'alice', days: ['Saturday'], roles: ['support'] }
      ]
      
      const result = generateRoster(
        events,
        members,
        [],
        preferences,
        { ...rosterConstraints, MAX_ASSIGNMENTS_PER_MONTH: 5 },
        rosterPreferences,
        rosterPeriod,
        { multiStart: false }
      )

      // Alice has both day (Saturday) and role (support) preferences
      // She should be strongly preferred with combined preference bonus
      expect(result.events[0].roster[0].member_id).toBe('alice')
    })
  })

  describe('Multi-Start Optimization', () => {
    it('should run multiple generations and select best', () => {
      const members = createTestMembers()
      const events = createTestEvents()
      
      const result = generateRoster(
        events,
        members,
        [],
        [],
        rosterConstraints,
        rosterPreferences,
        rosterPeriod,
        { multiStart: true, runs: 5 }
      )

      expect(result.stats.multiStartInfo).toBeDefined()
      expect(result.stats.multiStartInfo.totalRuns).toBe(5)
      expect(result.stats.multiStartInfo.bestRun).toBeGreaterThanOrEqual(0)
      expect(result.stats.multiStartInfo.bestRun).toBeLessThan(5)
      expect(result.events[0].roster[0].member_id).toBeTruthy()
    })

    it('should produce deterministic results with same input', () => {
      const members = createTestMembers()
      const events = createTestEvents()
      
      const result1 = generateRoster(
        events,
        members,
        [],
        [],
        rosterConstraints,
        rosterPreferences,
        rosterPeriod,
        { multiStart: true, runs: 3 }
      )

      const result2 = generateRoster(
        events,
        members,
        [],
        [],
        rosterConstraints,
        rosterPreferences,
        rosterPeriod,
        { multiStart: true, runs: 3 }
      )

      // Same input should produce same output
      expect(result1.stats.multiStartInfo.bestRun).toBe(result2.stats.multiStartInfo.bestRun)
      expect(result1.events[0].roster[0].member_id).toBe(result2.events[0].roster[0].member_id)
    })

    it('should default to multi-start when no options provided', () => {
      const members = createTestMembers()
      const events = createTestEvents()
      
      const result = generateRoster(
        events,
        members,
        [],
        [],
        rosterConstraints,
        rosterPreferences,
        rosterPeriod
        // No options = default multiStart: true, runs: 10
      )

      expect(result.stats.multiStartInfo).toBeDefined()
      expect(result.stats.multiStartInfo.totalRuns).toBe(20)
    })

    it('should maintain chronological order in final result', () => {
      const members = createTestMembers()
      const events = [
        { ...createTestEvents()[0], date: '2026-02-15' },
        { ...createTestEvents()[1], date: '2026-02-01' },
        { ...createTestEvents()[0], date: '2026-02-22' }
      ]
      
      const result = generateRoster(
        events,
        members,
        [],
        [],
        rosterConstraints,
        rosterPreferences,
        rosterPeriod,
        { multiStart: true, runs: 3 }
      )

      // Events should be returned in chronological order
      expect(new Date(result.events[0].date) <= new Date(result.events[1].date)).toBe(true)
      expect(new Date(result.events[1].date) <= new Date(result.events[2].date)).toBe(true)
    })
  })
})
