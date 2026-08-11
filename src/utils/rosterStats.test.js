import { describe, it, expect } from 'vitest'
import { calculateRosterStats } from './rosterStats'

describe('rosterStats', () => {
  describe('calculateRosterStats', () => {
    const members = [
      { id: 'john', name: 'John', include: true, roles: ['vm'] },
      { id: 'jane', name: 'Jane', include: true, roles: ['vm'] },
      { id: 'bob', name: 'Bob', include: false, roles: ['vm'] }
    ]

    const events = [
      {
        date: '2026-02-07',
        roster: [
          { role: 'vm', member_id: 'john' },
          { role: 'cam-1', member_id: 'jane' }
        ]
      },
      {
        date: '2026-02-14',
        roster: [
          { role: 'vm', member_id: 'john' },
          { role: 'cam-1', member_id: null }
        ]
      },
      {
        date: '2026-03-07',
        roster: [
          { role: 'vm', member_id: 'jane' }
        ]
      }
    ]

    const rosterPeriod = {
      start_date: '2026-02-01',
      end_date: '2026-04-30'
    }

    it('should calculate total slots correctly', () => {
      const stats = calculateRosterStats(events, members, rosterPeriod)
      
      expect(stats.totalSlots).toBe(5) // 2 + 2 + 1
    })

    it('should count total events', () => {
      const stats = calculateRosterStats(events, members, rosterPeriod)
      
      expect(stats.totalEvents).toBe(3)
    })

    it('should calculate month count correctly', () => {
      const stats = calculateRosterStats(events, members, rosterPeriod)
      
      expect(stats.monthCount).toBe(3) // Feb, Mar, Apr
    })

    it('should calculate average slots per event', () => {
      const stats = calculateRosterStats(events, members, rosterPeriod)
      
      expect(stats.avgSlotsPerEvent).toBe(1.7) // 5/3 rounded to 1 decimal
    })

    it('should calculate average slots per month', () => {
      const stats = calculateRosterStats(events, members, rosterPeriod)
      
      expect(stats.avgSlotsPerMonth).toBe(1.7) // 5/3 rounded to 1 decimal
    })

    it('should calculate average slots per member', () => {
      const stats = calculateRosterStats(events, members, rosterPeriod)
      
      expect(stats.avgSlotsPerMember).toBe(2.5) // 5 slots / 2 active members
    })

    it('should exclude members with include:false from average calculation', () => {
      const stats = calculateRosterStats(events, members, rosterPeriod)
      
      // Should calculate based on 2 active members (John and Jane), not 3
      expect(stats.memberStats).toHaveLength(2)
    })

    it('should calculate per-member statistics', () => {
      const stats = calculateRosterStats(events, members, rosterPeriod)
      
      const johnStats = stats.memberStats.find(m => m.id === 'john')
      expect(johnStats.totalAssignments).toBe(2)
      expect(johnStats.avgPerMonth).toBeCloseTo(0.67, 1) // 2/3 months
      
      const janeStats = stats.memberStats.find(m => m.id === 'jane')
      expect(janeStats.totalAssignments).toBe(2) // 1 cam-1 + 1 vm
      expect(janeStats.avgPerMonth).toBeCloseTo(0.67, 1)
    })

    it('should calculate percentage of total for each member', () => {
      const stats = calculateRosterStats(events, members, rosterPeriod)
      
      const johnStats = stats.memberStats.find(m => m.id === 'john')
      expect(johnStats.percentageOfTotal).toBe(40) // 2/5 = 40%
      
      const janeStats = stats.memberStats.find(m => m.id === 'jane')
      expect(janeStats.percentageOfTotal).toBe(40) // 2/5 = 40%
    })

    it('should sort members by total assignments descending', () => {
      const moreEvents = [
        {
          date: '2026-02-07',
          roster: [
            { role: 'vm', member_id: 'john' },
            { role: 'cam-1', member_id: 'john' },
            { role: 'cam-2', member_id: 'john' }
          ]
        },
        {
          date: '2026-02-14',
          roster: [
            { role: 'vm', member_id: 'jane' }
          ]
        }
      ]
      
      const stats = calculateRosterStats(moreEvents, members, rosterPeriod)
      
      expect(stats.memberStats[0].id).toBe('john') // John has 3
      expect(stats.memberStats[1].id).toBe('jane') // Jane has 1
    })

    it('should handle members with no assignments', () => {
      const stats = calculateRosterStats(events, members, rosterPeriod)
      
      // All active members should appear even with 0 assignments
      expect(stats.memberStats).toHaveLength(2)
      stats.memberStats.forEach(memberStat => {
        expect(memberStat).toHaveProperty('totalAssignments')
        expect(memberStat).toHaveProperty('avgPerMonth')
        expect(memberStat).toHaveProperty('percentageOfTotal')
      })
    })

    it('should handle empty events array', () => {
      const stats = calculateRosterStats([], members, rosterPeriod)
      
      expect(stats.totalSlots).toBe(0)
      expect(stats.totalEvents).toBe(0)
      expect(stats.avgSlotsPerMember).toBe(0)
    })

    it('should handle null/undefined inputs gracefully', () => {
      const stats = calculateRosterStats(null, null, null)
      
      expect(stats.totalSlots).toBe(0)
      expect(stats.totalEvents).toBe(0)
      expect(stats.memberStats).toEqual([])
    })

    it('should handle events without roster field', () => {
      const eventsNoRoster = [
        { date: '2026-02-07' },
        { date: '2026-02-14', roster: null }
      ]
      
      const stats = calculateRosterStats(eventsNoRoster, members, rosterPeriod)
      
      expect(stats.totalSlots).toBe(0)
    })

    it('should handle single month period', () => {
      const singleMonthPeriod = {
        start_date: '2026-02-01',
        end_date: '2026-02-28'
      }
      
      const stats = calculateRosterStats(events, members, singleMonthPeriod)
      
      expect(stats.monthCount).toBe(1)
    })

    it('should handle multi-year period', () => {
      const multiYearPeriod = {
        start_date: '2026-02-01',
        end_date: '2027-04-30'
      }
      
      const stats = calculateRosterStats(events, members, multiYearPeriod)
      
      expect(stats.monthCount).toBe(15) // Feb 2026 to Apr 2027
    })

    it('computes live fairness metrics from the current roster state', () => {
      const stats = calculateRosterStats(events, members, rosterPeriod)

      // john: 2 assignments, jane: 2 assignments, bob excluded (include:false).
      expect(stats.fairnessMetrics).toBeDefined()
      expect(stats.fairnessMetrics.assignmentsByMember.john.total).toBe(2)
      expect(stats.fairnessMetrics.assignmentsByMember.jane.total).toBe(2)
      expect(stats.fairnessMetrics.assignmentsByMember.bob).toBeUndefined()
      // Equal counts => perfectly fair => std dev 0.
      expect(stats.fairnessMetrics.assignmentStdDev).toBe(0)
      // assignedRoles counts only active members' filled slots (4, not the
      // empty cam-1 slot).
      expect(stats.assignedRoles).toBe(4)
    })

    it('fairness metrics update when the roster changes (real-time)', () => {
      const unbalanced = [
        { date: '2026-02-07', roster: [{ role: 'vm', member_id: 'john' }] },
        { date: '2026-02-14', roster: [{ role: 'vm', member_id: 'john' }] },
        { date: '2026-02-21', roster: [{ role: 'vm', member_id: 'john' }] }
      ]
      const stats = calculateRosterStats(unbalanced, members, rosterPeriod)

      // john has 3, jane has 0 => non-zero std dev, reflecting current state.
      expect(stats.fairnessMetrics.assignmentsByMember.john.total).toBe(3)
      expect(stats.fairnessMetrics.assignmentStdDev).toBeGreaterThan(0)
    })
  })
})
