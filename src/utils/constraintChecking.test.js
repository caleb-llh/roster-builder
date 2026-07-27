import { describe, it, expect } from 'vitest'
import {
  getMondayOfWeek,
  getWeekKey,
  checkMemberAvailability,
  checkMemberRoleCompatibility,
  isAssignedToEvent,
  countMonthlyAssignments,
  getWeekAssignments,
  areConsecutiveWeekends,
  getMembersWithMultipleRoles
} from './constraintChecking'

describe('constraintChecking', () => {
  describe('getMondayOfWeek', () => {
    it('should return a Monday for any date', () => {
      expect(getMondayOfWeek('2026-02-03').getDay()).toBe(1) // Tuesday -> Monday
      expect(getMondayOfWeek('2026-02-07').getDay()).toBe(1) // Saturday -> Monday
      expect(getMondayOfWeek('2026-02-08').getDay()).toBe(1) // Sunday -> Monday
    })

    it('should return same Monday for dates in same week', () => {
      const mon1 = getMondayOfWeek('2026-02-03')
      const mon2 = getMondayOfWeek('2026-02-07')
      const mon3 = getMondayOfWeek('2026-02-08')
      
      expect(mon1.getTime()).toBe(mon2.getTime())
      expect(mon2.getTime()).toBe(mon3.getTime())
    })
  })

  describe('getWeekKey', () => {
    it('should return same week key for dates in the same week', () => {
      const key1 = getWeekKey('2026-02-03') // Tuesday
      const key2 = getWeekKey('2026-02-07') // Saturday
      const key3 = getWeekKey('2026-02-08') // Sunday
      
      expect(key1).toBe(key2)
      expect(key2).toBe(key3)
    })

    it('should return different week keys for different weeks', () => {
      const key1 = getWeekKey('2026-02-07')
      const key2 = getWeekKey('2026-02-14')
      
      expect(key1).not.toBe(key2)
    })
  })

  describe('checkMemberAvailability', () => {
    const constraints = [
      { member_id: 'alice', unavailable_dates: ['2026-02-07'] }
    ]

    it('should return false when member is unavailable', () => {
      expect(checkMemberAvailability('alice', '2026-02-07', constraints)).toBe(false)
    })

    it('should return true when member is available', () => {
      expect(checkMemberAvailability('alice', '2026-02-08', constraints)).toBe(true)
    })
  })

  describe('checkMemberRoleCompatibility', () => {
    const member = { id: 'alice', roles: ['vm', 'cam-1'] }

    it('should return true when member can perform role', () => {
      expect(checkMemberRoleCompatibility(member, 'vm')).toBe(true)
    })

    it('should return false when member cannot perform role', () => {
      expect(checkMemberRoleCompatibility(member, 'cam-2')).toBe(false)
    })

    it('should return false when member is null', () => {
      expect(checkMemberRoleCompatibility(null, 'vm')).toBe(false)
    })
  })

  describe('isAssignedToEvent', () => {
    const roster = [
      { role: 'vm', member_id: 'alice' },
      { role: 'cam-1', member_id: 'bob' }
    ]

    it('should return true when member is assigned', () => {
      expect(isAssignedToEvent('alice', roster)).toBe(true)
    })

    it('should return false when member is not assigned', () => {
      expect(isAssignedToEvent('charlie', roster)).toBe(false)
    })
  })

  describe('countMonthlyAssignments', () => {
    const events = [
      { date: '2026-02-01', roster: [{ member_id: 'alice' }] },
      { date: '2026-02-15', roster: [{ member_id: 'alice' }] },
      { date: '2026-03-01', roster: [{ member_id: 'alice' }] }
    ]

    it('should count assignments in the same month', () => {
      expect(countMonthlyAssignments('alice', '2026-02-01', events)).toBe(2)
    })

    it('should only count the target month', () => {
      expect(countMonthlyAssignments('alice', '2026-03-01', events)).toBe(1)
    })
  })

  describe('areConsecutiveWeekends', () => {
    it('should return true for consecutive Saturdays', () => {
      expect(areConsecutiveWeekends('2026-02-07', '2026-02-14')).toBe(true)
    })

    it('should return true for Saturday to next Sunday', () => {
      expect(areConsecutiveWeekends('2026-02-07', '2026-02-15')).toBe(true)
    })

    it('should return false for non-consecutive weekends', () => {
      expect(areConsecutiveWeekends('2026-02-07', '2026-02-21')).toBe(false)
    })

    it('should return false when dates are not weekends', () => {
      expect(areConsecutiveWeekends('2026-02-02', '2026-02-09')).toBe(false)
    })

    it('should return false for same weekend dates', () => {
      expect(areConsecutiveWeekends('2026-02-07', '2026-02-08')).toBe(false)
    })
  })

  describe('getMembersWithMultipleRoles', () => {
    it('should return members assigned to multiple roles', () => {
      const roster = [
        { role: 'vm', member_id: 'alice' },
        { role: 'cam-1', member_id: 'alice' },
        { role: 'cam-2', member_id: 'bob' }
      ]

      const result = getMembersWithMultipleRoles(roster)
      expect(result).toHaveLength(1)
      expect(result[0].memberId).toBe('alice')
      expect(result[0].roles).toEqual(['vm', 'cam-1'])
    })

    it('should return empty array when no members have multiple roles', () => {
      const roster = [
        { role: 'vm', member_id: 'alice' },
        { role: 'cam-1', member_id: 'bob' }
      ]

      const result = getMembersWithMultipleRoles(roster)
      expect(result).toHaveLength(0)
    })
  })
})
