import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'
import {
  ValidationBuilder,
  validateYamlStructure,
  validateMembers,
  validateTelegramHandles,
  validateRoles,
  validateEventMemberMapping,
  validateRosterPeriod,
  validateMemberConstraints,
  runAllValidators
} from './validators'

describe('validators', () => {
  describe('ValidationBuilder', () => {
    it('should build validation results correctly', () => {
      const data = { members: [] }
      const builder = new ValidationBuilder(data)
      
      const results = builder
        .validate(() => ({ errors: ['error1'], warnings: ['warning1'] }))
        .validate(() => ({ errors: [], warnings: ['warning2'] }))
        .getResults()
      
      expect(results.errors).toEqual(['error1'])
      expect(results.warnings).toEqual(['warning1', 'warning2'])
      expect(results.isValid).toBe(false)
      expect(results.hasWarnings).toBe(true)
    })
  })

  describe('validateYamlStructure', () => {
    it('should pass for valid structure', () => {
      const data = { members: [], events: [] }
      const result = validateYamlStructure(data)
      
      expect(result.errors).toHaveLength(0)
    })

    it('should error on null data', () => {
      const result = validateYamlStructure(null)
      
      expect(result.errors).toContain('YAML data is empty or invalid')
    })

    it('should error on missing members array', () => {
      const data = { events: [] }
      const result = validateYamlStructure(data)
      
      expect(result.errors.some(e => e.includes('members'))).toBe(true)
    })

    it('should error if events is not an array', () => {
      const data = { members: [], events: 'not-array' }
      const result = validateYamlStructure(data)
      
      expect(result.errors.some(e => e.includes('events'))).toBe(true)
    })
  })

  describe('validateMembers', () => {
    it('should pass for valid members', () => {
      const data = {
        members: [
          { name: 'John', telegram: '@john', roles: ['vm'], include: true }
        ]
      }
      const result = validateMembers(data)
      
      expect(result.errors).toHaveLength(0)
    })

    it('should error on missing name', () => {
      const data = {
        members: [
          { telegram: '@john', roles: ['vm'] }
        ]
      }
      const result = validateMembers(data)
      
      expect(result.errors.some(e => e.includes('name'))).toBe(true)
    })

    it('should error on missing roles', () => {
      const data = {
        members: [
          { name: 'John', telegram: '@john' }
        ]
      }
      const result = validateMembers(data)
      
      expect(result.errors.some(e => e.includes('roles'))).toBe(true)
    })

    it('should warn on missing telegram', () => {
      const data = {
        members: [
          { name: 'John', roles: ['vm'], include: true }
        ]
      }
      const result = validateMembers(data)
      
      expect(result.warnings.some(w => w.includes('telegram'))).toBe(true)
    })

    it('should warn on duplicate names', () => {
      const data = {
        members: [
          { name: 'John', roles: ['vm'], telegram: '@john1' },
          { name: 'John', roles: ['cam-1'], telegram: '@john2' }
        ]
      }
      const result = validateMembers(data)
      
      expect(result.warnings.some(w => w.includes('Duplicate'))).toBe(true)
    })
  })

  describe('validateTelegramHandles', () => {
    it('should pass for valid handles', () => {
      const data = {
        members: [
          { name: 'John', telegram: '@john_doe', roles: ['vm'] }
        ]
      }
      const result = validateTelegramHandles(data)
      
      expect(result.warnings).toHaveLength(0)
    })

    it('should warn if handle missing @', () => {
      const data = {
        members: [
          { name: 'John', telegram: 'john', roles: ['vm'] }
        ]
      }
      const result = validateTelegramHandles(data)
      
      expect(result.warnings.some(w => w.includes('@'))).toBe(true)
    })

    it('should warn if handle too short', () => {
      const data = {
        members: [
          { name: 'John', telegram: '@ab', roles: ['vm'] }
        ]
      }
      const result = validateTelegramHandles(data)
      
      expect(result.warnings.some(w => w.includes('short'))).toBe(true)
    })

    it('should warn on invalid characters', () => {
      const data = {
        members: [
          { name: 'John', telegram: '@john-doe!', roles: ['vm'] }
        ]
      }
      const result = validateTelegramHandles(data)
      
      expect(result.warnings.some(w => w.includes('invalid'))).toBe(true)
    })
  })

  describe('validateRoles', () => {
    it('should pass with valid roles section', () => {
      const data = {
        roles: [{ name: 'vm' }, { name: 'cam-1' }],
        members: [
          { name: 'John', roles: ['vm'], telegram: '@john' }
        ]
      }
      const result = validateRoles(data)
      
      expect(result.errors).toHaveLength(0)
    })

    it('should error if roles section missing', () => {
      const data = {
        members: [
          { name: 'John', roles: ['vm'], telegram: '@john' }
        ]
      }
      const result = validateRoles(data)
      
      expect(result.errors.some(e => e.includes('No roles section'))).toBe(true)
    })

    it('should error on invalid role', () => {
      const data = {
        roles: [{ name: 'vm' }],
        members: [
          { name: 'John', roles: ['vm', 'invalid-role'], telegram: '@john' }
        ]
      }
      const result = validateRoles(data)
      
      expect(result.errors.some(e => e.includes('invalid-role'))).toBe(true)
    })

    it('should warn on duplicate roles', () => {
      const data = {
        roles: [{ name: 'vm' }],
        members: [
          { name: 'John', roles: ['vm', 'vm'], telegram: '@john' }
        ]
      }
      const result = validateRoles(data)
      
      expect(result.warnings.some(w => w.includes('duplicate'))).toBe(true)
    })
  })

  describe('validateRosterPeriod', () => {
    it('should pass when dates within period', () => {
      const data = {
        roster: { start_date: '2026-02-01', end_date: '2026-04-30' },
        events: [
          { name: 'Event 1', date: '2026-02-15' }
        ],
        members: [
          { id: 'john', name: 'John' }
        ],
        member_constraints: [
          { member_id: 'john', unavailable_dates: ['2026-02-20'] }
        ]
      }
      const result = validateRosterPeriod(data)
      
      expect(result.warnings).toHaveLength(0)
    })

    it('should warn on event date outside period', () => {
      const data = {
        roster: { start_date: '2026-02-01', end_date: '2026-04-30' },
        events: [
          { name: 'Event 1', date: '2026-05-01' }
        ]
      }
      const result = validateRosterPeriod(data)
      
      expect(result.warnings.some(w => w.includes('outside roster period'))).toBe(true)
    })

    it('should warn on constraint date outside period', () => {
      const data = {
        roster: { start_date: '2026-02-01', end_date: '2026-04-30' },
        events: [],
        members: [
          { id: 'john', name: 'John' }
        ],
        member_constraints: [
          { member_id: 'john', unavailable_dates: ['2026-01-15'] }
        ]
      }
      const result = validateRosterPeriod(data)
      
      expect(result.warnings.some(w => w.includes('John'))).toBe(true)
    })

    it('should warn on date range outside period', () => {
      const data = {
        roster: { start_date: '2026-02-01', end_date: '2026-04-30' },
        events: [],
        members: [
          { id: 'john', name: 'John' }
        ],
        member_constraints: [
          { 
            member_id: 'john', 
            unavailable_dates: [
              { start: '2026-01-01', end: '2026-01-31' }
            ] 
          }
        ]
      }
      const result = validateRosterPeriod(data)
      
      expect(result.warnings.some(w => w.includes('completely outside'))).toBe(true)
    })
  })

  describe('validateMemberConstraints', () => {
    it('should not warn when all members have constraints', () => {
      const data = {
        members: [
          { id: 'john', name: 'John', include: true, roles: ['vm'] },
          { id: 'jane', name: 'Jane', include: true, roles: ['vm'] }
        ],
        member_constraints: [
          { member_id: 'john', unavailable_dates: ['2026-02-14'] },
          { member_id: 'jane', unavailable_dates: ['2026-02-15'] }
        ]
      }
      const result = validateMemberConstraints(data)
      
      expect(result.warnings).toHaveLength(0)
    })

    it('should warn when member missing constraints', () => {
      const data = {
        members: [
          { id: 'john', name: 'John', include: true, roles: ['vm'] }
        ],
        member_constraints: []
      }
      const result = validateMemberConstraints(data)
      
      expect(result.warnings.some(w => w.includes('John'))).toBe(true)
      expect(result.warnings.some(w => w.includes('No unavailable dates'))).toBe(true)
    })

    it('should skip members with include:false', () => {
      const data = {
        members: [
          { id: 'john', name: 'John', include: false, roles: ['vm'] }
        ],
        member_constraints: []
      }
      const result = validateMemberConstraints(data)
      
      expect(result.warnings).toHaveLength(0)
    })

    it('should skip members with empty unavailable_dates', () => {
      const data = {
        members: [
          { id: 'john', name: 'John', include: true, roles: ['vm'] }
        ],
        member_constraints: [
          { member_id: 'john', unavailable_dates: [] }
        ]
      }
      const result = validateMemberConstraints(data)
      
      expect(result.warnings.some(w => w.includes('John'))).toBe(true)
    })
  })

  // Binding-spec invariant: public/sample.yaml is the canonical, always-valid
  // example of the input schema (see README Design Decisions). It must parse
  // and pass every validator with zero errors.
  describe('public/sample.yaml (canonical schema example)', () => {
    const samplePath = join(process.cwd(), 'public', 'sample.yaml')
    const data = yaml.load(readFileSync(samplePath, 'utf8'))

    it('parses to an object', () => {
      expect(data).toBeTypeOf('object')
      expect(Array.isArray(data.members)).toBe(true)
    })

    it('passes runAllValidators with no errors', () => {
      const result = runAllValidators(data)
      expect(result.errors).toEqual([])
      expect(result.isValid).toBe(true)
    })

    it('uses the object form for member roles and demonstrates the understudy flag', () => {
      const allRoleEntries = data.members.flatMap(m => m.roles || [])
      expect(allRoleEntries.length).toBeGreaterThan(0)
      allRoleEntries.forEach(entry => {
        expect(entry).toBeTypeOf('object')
        expect(typeof entry.name).toBe('string')
      })
      expect(allRoleEntries.some(e => e.understudy === true)).toBe(true)
    })
  })
})
