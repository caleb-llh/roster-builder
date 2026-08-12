import { describe, it, expect } from 'vitest'
import { getDerivedState } from './derivedState'
import { CONSTRAINT_KEYS, PREFERENCE_KEYS } from '../schema/rosterSchema'
import { DEFAULT_ROSTER_CONSTRAINTS, DEFAULT_ROSTER_PREFERENCES } from '../config/rosterDefaults'

describe('derivedState', () => {
  describe('getDerivedState', () => {
    it('should return default state for null data', () => {
      const state = getDerivedState(null)
      
      expect(state.members).toEqual([])
      expect(state.events).toEqual([])
      expect(state.roles).toEqual([])
      expect(state.roleColorMap).toEqual({})
      expect(state.activeMembers).toEqual([])
      expect(state.memberConstraints).toEqual([])
      expect(state.memberPreferences).toEqual([])
      expect(state.rosterConstraints).toEqual(DEFAULT_ROSTER_CONSTRAINTS)
      expect(state.rosterPreferences).toEqual(DEFAULT_ROSTER_PREFERENCES)
      expect(state.rosterPeriod).toBeNull()
    })

    it('should return default state for undefined data', () => {
      const state = getDerivedState(undefined)
      
      expect(state.members).toEqual([])
      expect(state.events).toEqual([])
    })

    it('should extract members from data', () => {
      const data = {
        members: [
          { id: 'alice', name: 'Alice' },
          { id: 'bob', name: 'Bob' }
        ]
      }
      
      const state = getDerivedState(data)
      expect(state.members).toHaveLength(2)
      expect(state.members[0].id).toBe('alice')
    })

    it('should extract events from data', () => {
      const data = {
        events: [
          { date: '2026-02-01', name: 'Event 1' },
          { date: '2026-02-08', name: 'Event 2' }
        ]
      }
      
      const state = getDerivedState(data)
      expect(state.events).toHaveLength(2)
      expect(state.events[0].date).toBe('2026-02-01')
    })

    it('should extract roles from object format', () => {
      const data = {
        roles: [
          { name: 'vm' },
          { name: 'cam-1' },
          { name: 'cam-2' }
        ]
      }
      
      const state = getDerivedState(data)
      expect(state.roles).toEqual(['vm', 'cam-1', 'cam-2'])
    })

    it('should extract roles from declared_roles array', () => {
      const data = {
        declared_roles: ['vm', 'cam-1', 'cam-2']
      }
      
      const state = getDerivedState(data)
      expect(state.roles).toEqual(['vm', 'cam-1', 'cam-2'])
    })

    it('should handle string roles in roles array', () => {
      const data = {
        roles: ['vm', 'cam-1', 'cam-2']
      }
      
      const state = getDerivedState(data)
      expect(state.roles).toEqual(['vm', 'cam-1', 'cam-2'])
    })

    it('should filter out falsy role values', () => {
      const data = {
        roles: ['vm', null, 'cam-1', undefined, '', 'cam-2']
      }
      
      const state = getDerivedState(data)
      expect(state.roles).toEqual(['vm', 'cam-1', 'cam-2'])
    })

    it('should generate role color map for all roles', () => {
      const data = {
        roles: ['vm', 'cam-1', 'cam-2']
      }
      
      const state = getDerivedState(data)
      expect(state.roleColorMap).toHaveProperty('vm')
      expect(state.roleColorMap).toHaveProperty('cam-1')
      expect(state.roleColorMap).toHaveProperty('cam-2')
    })

    it('should assign different colors to different roles', () => {
      const data = {
        roles: ['vm', 'cam-1', 'cam-2']
      }
      
      const state = getDerivedState(data)
      expect(state.roleColorMap.vm).not.toBe(state.roleColorMap['cam-1'])
      expect(state.roleColorMap['cam-1']).not.toBe(state.roleColorMap['cam-2'])
    })

    it('should cycle through colors for many roles', () => {
      const data = {
        roles: Array.from({ length: 20 }, (_, i) => `role-${i}`)
      }
      
      const state = getDerivedState(data)
      expect(Object.keys(state.roleColorMap)).toHaveLength(20)
      
      // All roles should have color assigned (text-colour only — role tags
      // render as coloured font, not a coloured pill; see colorUtils).
      state.roles.forEach(role => {
        expect(state.roleColorMap[role]).toBeTruthy()
        expect(state.roleColorMap[role]).toContain('text-')
      })
    })

    it('should filter active members correctly', () => {
      const data = {
        members: [
          { id: 'alice', name: 'Alice', active: true },
          { id: 'bob', name: 'Bob', active: false },
          { id: 'charlie', name: 'Charlie' } // No active field = default true
        ]
      }
      
      const state = getDerivedState(data)
      expect(state.activeMembers).toHaveLength(2)
      expect(state.activeMembers.map(m => m.id)).toEqual(['alice', 'charlie'])
    })

    it('should treat members without active field as active', () => {
      const data = {
        members: [
          { id: 'alice', name: 'Alice' },
          { id: 'bob', name: 'Bob' }
        ]
      }
      
      const state = getDerivedState(data)
      expect(state.activeMembers).toHaveLength(2)
    })

    it('should extract constraints from data', () => {
      const data = {
        member_constraints: [
          { member_id: 'alice', unavailable_dates: ['2026-02-15'] }
        ]
      }
      
      const state = getDerivedState(data)
      expect(state.memberConstraints).toHaveLength(1)
      expect(state.memberConstraints[0].member_id).toBe('alice')
    })

    it('should extract member preferences from data', () => {
      const data = {
        member_preferences: [
          { member_id: 'alice', days: ['Sunday'] }
        ]
      }
      
      const state = getDerivedState(data)
      expect(state.memberPreferences).toHaveLength(1)
      expect(state.memberPreferences[0].days).toEqual(['Sunday'])
    })

    it('should extract roster constraints from data', () => {
      const data = {
        roster_constraints: {
          [CONSTRAINT_KEYS.ONLY_ONCE_PER_EVENT]: true,
          ONLY_ONCE_PER_WEEK: true
        }
      }
      
      const state = getDerivedState(data)
      expect(state.rosterConstraints.ONLY_ONCE_PER_EVENT).toBe(true)
      expect(state.rosterConstraints.ONLY_ONCE_PER_WEEK).toBe(true)
    })

    it('should extract roster preferences from data', () => {
      const data = {
        roster_preferences: {
          [PREFERENCE_KEYS.AVOID_CONSECUTIVE_WEEKS]: true,
          [PREFERENCE_KEYS.SPREAD_ASSIGNMENTS]: true,
          [PREFERENCE_KEYS.DIVERSIFY_ROLE_ASSIGNMENTS]: true
        }
      }
      
      const state = getDerivedState(data)
      expect(state.rosterPreferences[PREFERENCE_KEYS.AVOID_CONSECUTIVE_WEEKS]).toBe(true)
      expect(state.rosterPreferences[PREFERENCE_KEYS.SPREAD_ASSIGNMENTS]).toBe(true)
      expect(state.rosterPreferences[PREFERENCE_KEYS.DIVERSIFY_ROLE_ASSIGNMENTS]).toBe(true)
    })

    it('should extract roster period from data', () => {
      const data = {
        roster: {
          start_date: '2026-02-01',
          end_date: '2026-04-30'
        }
      }
      
      const state = getDerivedState(data)
      expect(state.rosterPeriod.start_date).toBe('2026-02-01')
      expect(state.rosterPeriod.end_date).toBe('2026-04-30')
    })

    it('should handle complete roster data structure', () => {
      const data = {
        roster: {
          start_date: '2026-02-01',
          end_date: '2026-04-30'
        },
        members: [
          { id: 'alice', name: 'Alice', active: true },
          { id: 'bob', name: 'Bob', active: false }
        ],
        declared_roles: ['vm', 'cam-1', 'cam-2'],
        events: [
          { date: '2026-02-07', name: 'Service 1' }
        ],
        member_constraints: [
          { member_id: 'alice', unavailable_dates: ['2026-02-15'] }
        ],
        member_preferences: [
          { member_id: 'alice', days: ['Sunday'] }
        ],
        roster_constraints: {
          [CONSTRAINT_KEYS.ONLY_ONCE_PER_EVENT]: true
        },
        roster_preferences: {
          [PREFERENCE_KEYS.AVOID_CONSECUTIVE_WEEKS]: true
        }
      }
      
      const state = getDerivedState(data)
      
      expect(state.members).toHaveLength(2)
      expect(state.activeMembers).toHaveLength(1)
      expect(state.roles).toHaveLength(3)
      expect(state.events).toHaveLength(1)
      expect(state.memberConstraints).toHaveLength(1)
      expect(state.memberPreferences).toHaveLength(1)
      expect(state.rosterConstraints[CONSTRAINT_KEYS.ONLY_ONCE_PER_EVENT]).toBe(true)
      expect(state.rosterPreferences[PREFERENCE_KEYS.AVOID_CONSECUTIVE_WEEKS]).toBe(true)
      expect(state.rosterPeriod).toBeTruthy()
    })

    it('should handle empty data object', () => {
      const state = getDerivedState({})
      
      expect(state.members).toEqual([])
      expect(state.events).toEqual([])
      expect(state.roles).toEqual([])
      expect(state.memberConstraints).toEqual([])
    })

    it('should handle missing optional fields gracefully', () => {
      const data = {
        members: [{ id: 'alice', name: 'Alice' }]
      }
      
      const state = getDerivedState(data)
      
      expect(state.members).toHaveLength(1)
      expect(state.events).toEqual([])
      expect(state.roles).toEqual([])
      expect(state.memberConstraints).toEqual([])
      expect(state.memberPreferences).toEqual([])
      expect(state.rosterConstraints).toEqual(DEFAULT_ROSTER_CONSTRAINTS)
      expect(state.rosterPreferences).toEqual(DEFAULT_ROSTER_PREFERENCES)
      expect(state.rosterPeriod).toBeNull()
    })

    it('should preserve original data structure', () => {
      const originalData = {
        members: [{ id: 'alice', name: 'Alice' }],
        events: [{ date: '2026-02-01' }]
      }
      
      const state = getDerivedState(originalData)
      
      // Should not mutate original
      expect(originalData.members).toHaveLength(1)
      expect(originalData.members[0]).toEqual({ id: 'alice', name: 'Alice' })
      // Members are normalized (roles/understudyFor derived) into a new array
      expect(state.members[0]).toMatchObject({ id: 'alice', name: 'Alice' })
    })

    it('should handle legacy include field vs active field', () => {
      const data = {
        members: [
          { id: 'alice', name: 'Alice', include: true, active: false },
          { id: 'bob', name: 'Bob', include: false, active: true },
          { id: 'charlie', name: 'Charlie', include: true },
          { id: 'dave', name: 'Dave', active: true }
        ]
      }
      
      const state = getDerivedState(data)
      
      // Should respect active field when present
      const activeIds = state.activeMembers.map(m => m.id)
      expect(activeIds).toContain('bob')
      expect(activeIds).toContain('charlie')
      expect(activeIds).toContain('dave')
      expect(activeIds).not.toContain('alice') // active: false
    })

    it('should handle Tailwind color classes correctly', () => {
      const data = {
        roles: ['vm', 'cam-1']
      }
      
      const state = getDerivedState(data)
      
      // Color classes should be a valid Tailwind text-colour (role tags are
      // coloured font on a neutral surface, not a coloured pill).
      expect(state.roleColorMap.vm).toMatch(/^text-\w+-\d+$/)
      expect(state.roleColorMap['cam-1']).toMatch(/^text-\w+-\d+$/)
    })
  })

  describe('Edge Cases', () => {
    it('should handle roles with special characters', () => {
      const data = {
        roles: ['multi-vm', 'cam-1', 'backup/alternate']
      }
      
      const state = getDerivedState(data)
      expect(state.roles).toEqual(['multi-vm', 'cam-1', 'backup/alternate'])
      expect(state.roleColorMap['multi-vm']).toBeTruthy()
      expect(state.roleColorMap['backup/alternate']).toBeTruthy()
    })

    it('should handle mixed role format (objects and strings)', () => {
      const data = {
        roles: [
          'vm',
          { name: 'cam-1' },
          'cam-2',
          { name: 'cam-3' }
        ]
      }
      
      const state = getDerivedState(data)
      expect(state.roles).toEqual(['vm', 'cam-1', 'cam-2', 'cam-3'])
    })

    it('should handle members with complex structures', () => {
      const data = {
        members: [
          {
            id: 'alice',
            name: 'Alice O\'Brien',
            telegram: '@alice123',
            roles: ['vm', 'cam-1'],
            active: true
          }
        ]
      }
      
      const state = getDerivedState(data)
      expect(state.members[0].name).toBe('Alice O\'Brien')
      expect(state.activeMembers).toHaveLength(1)
    })

    it('should handle very large datasets', () => {
      const data = {
        members: Array.from({ length: 1000 }, (_, i) => ({
          id: `member-${i}`,
          name: `Member ${i}`,
          active: i % 2 === 0
        })),
        roles: Array.from({ length: 50 }, (_, i) => `role-${i}`),
        events: Array.from({ length: 500 }, (_, i) => ({
          date: `2026-${String(Math.floor(i/30) + 1).padStart(2, '0')}-${String((i % 30) + 1).padStart(2, '0')}`
        }))
      }
      
      const state = getDerivedState(data)
      expect(state.members).toHaveLength(1000)
      expect(state.activeMembers).toHaveLength(500) // Half are active
      expect(state.roles).toHaveLength(50)
      expect(state.events).toHaveLength(500)
    })

    it('should handle null values in arrays', () => {
      const data = {
        members: [null, { id: 'alice', name: 'Alice' }, undefined],
        events: [{ date: '2026-02-01' }, null],
        roles: [null, 'vm', undefined, 'cam-1', '']
      }
      
      const state = getDerivedState(data)
      
      // Should filter out nulls and handle gracefully
      expect(state.roles).toEqual(['vm', 'cam-1'])
      // members and events arrays are passed through but activeMembers filters nulls
      expect(state.members).toBeTruthy()
      expect(state.events).toBeTruthy()
      expect(state.activeMembers).toHaveLength(1) // Only alice
    })
  })
})
