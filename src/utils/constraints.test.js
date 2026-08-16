import { describe, it, expect } from 'vitest'
import {
  CONSTRAINTS,
  CONSTRAINT_MODES,
  checkConstraints,
  getConstraint,
  formatViolation,
} from './constraints'
import { CONSTRAINT_KEYS } from '../schema/rosterSchema'

// memberConstraints is the array shape from YAML: one entry per member.
const memberConstraints = [
  { member_id: 'm1', unavailable_dates: ['2026-01-10'] },
]
const enabled = { [CONSTRAINT_KEYS.ENFORCE_MEMBER_AVAILABILITY]: true }
const event = { date: '2026-01-10', roster: [] }
const freeEvent = { date: '2026-01-11', roster: [] }

describe('availability constraint descriptor', () => {
  const availability = getConstraint('availability')

  it('is a feasibility constraint', () => {
    expect(availability.kind).toBe('feasibility')
  })

  it('flags an unavailable member the same way in both modes', () => {
    const ctx = { memberConstraints }
    const placement = { memberId: 'm1', role: 'lead', event }

    const would = availability.check(placement, ctx, CONSTRAINT_MODES.WOULD_PLACE)
    const isPlaced = availability.check(placement, ctx, CONSTRAINT_MODES.IS_PLACED)

    expect(would).toEqual({ code: 'unavailable', params: { memberId: 'm1', date: '2026-01-10' } })
    // Feasibility ignores mode: the answer is identical.
    expect(isPlaced).toEqual(would)
  })

  it('passes an available member', () => {
    const ctx = { memberConstraints }
    expect(
      availability.check({ memberId: 'm1', role: 'lead', event: freeEvent }, ctx, CONSTRAINT_MODES.WOULD_PLACE)
    ).toBeNull()
  })
})

describe('checkConstraints runner', () => {
  it('skips disabled constraints', () => {
    const ctx = { rosterConstraints: {}, memberConstraints }
    const violations = checkConstraints({ memberId: 'm1', role: 'lead', event }, ctx)
    expect(violations).toEqual([])
  })

  it('reports a violation when the constraint is enabled', () => {
    const ctx = { rosterConstraints: enabled, memberConstraints }
    const violations = checkConstraints({ memberId: 'm1', role: 'lead', event }, ctx)
    expect(violations).toHaveLength(1)
    expect(violations[0].code).toBe('unavailable')
  })

  it('restricts to a kind when asked', () => {
    const ctx = { rosterConstraints: enabled, memberConstraints }
    const feasibility = checkConstraints({ memberId: 'm1', role: 'lead', event }, ctx, { kind: 'feasibility' })
    const loadCadence = checkConstraints({ memberId: 'm1', role: 'lead', event }, ctx, { kind: 'load-cadence' })
    expect(feasibility).toHaveLength(1)
    expect(loadCadence).toEqual([])
  })
})

describe('formatViolation', () => {
  it('renders the unavailable code with a resolved name', () => {
    const nameOf = (id) => (id === 'm1' ? 'Alice' : id)
    const sentence = formatViolation(
      { code: 'unavailable', params: { memberId: 'm1', date: '2026-01-10' } },
      nameOf
    )
    expect(sentence).toBe('Alice is unavailable on 2026-01-10.')
  })

  it('returns null for a null violation', () => {
    expect(formatViolation(null)).toBeNull()
  })

  it('falls back to a generic sentence for unknown codes', () => {
    expect(formatViolation({ code: 'mystery', params: {} })).toBe(
      'Assignment violates a roster constraint.'
    )
  })
})

describe('registry integrity', () => {
  it('exposes exactly the migrated constraints', () => {
    expect(CONSTRAINTS.map(c => c.key)).toEqual(['availability'])
  })
})
