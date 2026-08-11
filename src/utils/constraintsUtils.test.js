import { describe, it, expect } from 'vitest'
import { 
  isMemberUnavailable, 
  getAvailableMembersForEvent,
  canSwapRosterSlots
} from './constraintsUtils'

describe('constraintsUtils', () => {
  describe('isMemberUnavailable', () => {
    const constraints = [
      {
        member_id: 'john',
        unavailable_dates: [
          '2026-02-14',
          '2026-02-15',
          { start: '2026-03-01', end: '2026-03-15' }
        ]
      },
      {
        member_id: 'jane',
        unavailable_dates: ['2026-02-20']
      }
    ]

    it('should return true for single date match', () => {
      expect(isMemberUnavailable('john', '2026-02-14', constraints)).toBe(true)
      expect(isMemberUnavailable('john', '2026-02-15', constraints)).toBe(true)
    })

    it('should return false for dates not in constraint list', () => {
      expect(isMemberUnavailable('john', '2026-02-16', constraints)).toBe(false)
    })

    it('should return true for dates within range', () => {
      expect(isMemberUnavailable('john', '2026-03-01', constraints)).toBe(true)
      expect(isMemberUnavailable('john', '2026-03-08', constraints)).toBe(true)
      expect(isMemberUnavailable('john', '2026-03-15', constraints)).toBe(true)
    })

    it('should return false for dates outside range', () => {
      expect(isMemberUnavailable('john', '2026-02-28', constraints)).toBe(false)
      expect(isMemberUnavailable('john', '2026-03-16', constraints)).toBe(false)
    })

    it('should return false for member with no constraints', () => {
      expect(isMemberUnavailable('alice', '2026-02-14', constraints)).toBe(false)
    })

    it('should handle empty constraints array', () => {
      expect(isMemberUnavailable('john', '2026-02-14', [])).toBe(false)
    })

    it('should handle null/undefined constraints', () => {
      expect(isMemberUnavailable('john', '2026-02-14', null)).toBe(false)
      expect(isMemberUnavailable('john', '2026-02-14', undefined)).toBe(false)
    })
  })

  describe('getAvailableMembersForEvent', () => {
    const members = [
      { id: 'john', name: 'John', include: true, roles: ['vm', 'cam-1'] },
      { id: 'jane', name: 'Jane', include: true, roles: ['vm'] },
      { id: 'bob', name: 'Bob', include: false, roles: ['vm'] },
      { id: 'alice', name: 'Alice', include: true, roles: ['cam-1'] }
    ]

    const constraints = [
      {
        member_id: 'john',
        unavailable_dates: ['2026-02-14']
      }
    ]

    const event = {
      date: '2026-02-14',
      roster: [
        { role: 'vm', member_id: 'john' },
        { role: 'cam-1', member_id: null }
      ]
    }

    it('should return availability for all roster roles', () => {
      const result = getAvailableMembersForEvent(event, members, constraints)
      
      expect(result).toHaveProperty('vm')
      expect(result).toHaveProperty('cam-1')
    })

    it('should mark assigned member', () => {
      const result = getAvailableMembersForEvent(event, members, constraints)
      
      const johnEntry = result.vm.find(m => m.id === 'john')
      expect(johnEntry.assigned).toBe(true)
    })

    it('should mark unavailable members correctly', () => {
      const result = getAvailableMembersForEvent(event, members, constraints)
      
      const johnEntry = result.vm.find(m => m.id === 'john')
      expect(johnEntry.available).toBe(false) // John unavailable on 2026-02-14
      
      const janeEntry = result.vm.find(m => m.id === 'jane')
      expect(janeEntry.available).toBe(true) // Jane has no constraints
    })

    it('should exclude members with include:false', () => {
      const result = getAvailableMembersForEvent(event, members, constraints)
      
      const bobEntry = result.vm.find(m => m.id === 'bob')
      expect(bobEntry).toBeUndefined() // Bob should be excluded
    })

    it('should only include qualified members', () => {
      const result = getAvailableMembersForEvent(event, members, constraints)
      
      // Alice doesn't have 'vm' role
      const aliceInVM = result.vm.find(m => m.id === 'alice')
      expect(aliceInVM).toBeUndefined()
      
      // But Alice has 'cam-1' role
      const aliceInCam = result['cam-1'].find(m => m.id === 'alice')
      expect(aliceInCam).toBeDefined()
    })

    it('should handle event with no roster', () => {
      const emptyEvent = { date: '2026-02-14', roster: [] }
      const result = getAvailableMembersForEvent(emptyEvent, members, constraints)
      
      expect(Object.keys(result)).toHaveLength(0)
    })

    it('should handle event with undefined roster', () => {
      const noRosterEvent = { date: '2026-02-14' }
      const result = getAvailableMembersForEvent(noRosterEvent, members, constraints)
      
      expect(result).toEqual({})
    })

    describe('promoted understudies in real-role slots', () => {
      const uMembers = [
        { id: 'perf', name: 'Perf', roles: ['multi-vm'], understudyFor: [] },
        { id: 'trainee', name: 'Trainee', roles: ['vm'], understudyFor: ['multi-vm'] },
      ]
      const allEvents = [
        { date: '2026-02-01', roster: [{ role: 'multi-vm-understudy', member_id: 'trainee' }] },
        { date: '2026-02-08', roster: [{ role: 'multi-vm', member_id: null }] },
      ]

      it('lists a promoted trainee for a real role once they have understudied earlier', () => {
        const result = getAvailableMembersForEvent(allEvents[1], uMembers, [], allEvents)
        const ids = result['multi-vm'].map(m => m.id)
        expect(ids).toContain('trainee')
        const trainee = result['multi-vm'].find(m => m.id === 'trainee')
        expect(trainee.isUnderstudy).toBe(true)
        // Full performers are not marked as understudies.
        expect(result['multi-vm'].find(m => m.id === 'perf').isUnderstudy).toBe(false)
      })

      it('excludes a trainee who has not yet understudied (understudy-before-role)', () => {
        // First event only — the trainee has no earlier understudy session.
        const result = getAvailableMembersForEvent(allEvents[0], uMembers, [], allEvents)
        // The multi-vm-understudy slot lists the trainee (they may fill it)...
        expect(result['multi-vm-understudy'].map(m => m.id)).toContain('trainee')
        // ...but there is no real multi-vm slot in this event to be promoted into.
        const noPriorSessions = getAvailableMembersForEvent(
          { date: '2026-02-08', roster: [{ role: 'multi-vm', member_id: null }] },
          uMembers, [], [allEvents[1]] // only the later event: no earlier understudy
        )
        expect(noPriorSessions['multi-vm'].map(m => m.id)).not.toContain('trainee')
      })

      it('falls back to performers-only when allEvents is omitted', () => {
        const result = getAvailableMembersForEvent(allEvents[1], uMembers, [])
        expect(result['multi-vm'].map(m => m.id)).toEqual(['perf'])
      })
    })
  })

  describe('canSwapRosterSlots', () => {
    const members = [
      { id: 'john', name: 'John', include: true, roles: ['vm', 'cam-1'] },
      { id: 'jane', name: 'Jane', include: true, roles: ['vm', 'cam-1'] },
      { id: 'alice', name: 'Alice', include: true, roles: ['cam-1'] },
      { id: 'bob', name: 'Bob', include: false, roles: ['vm', 'cam-1'] },
    ]

    const makeEvent = (date, roster) => ({ date, roster })

    it('allows a same-event, different-role swap of the SAME member with an empty slot', () => {
      // John is in vm (index 0); cam-1 (index 1) is empty. Moving John from vm
      // to cam-1 within the same event must be allowed — this was the reported
      // bug (once-per-event falsely tripped on John still sitting in vm).
      const event = makeEvent('2026-02-08', [
        { role: 'vm', member_id: 'john' },
        { role: 'cam-1', member_id: null },
      ])
      const ok = canSwapRosterSlots({
        memberA: 'john', memberB: null,
        eventA: event, eventB: event,
        sourceIndex: 0, targetIndex: 1,
        slotA: event.roster[0], slotB: event.roster[1],
        members, memberConstraints: [], allEvents: [event],
      })
      expect(ok).toBe(true)
    })

    it('allows a same-event swap of two different members across roles', () => {
      const event = makeEvent('2026-02-08', [
        { role: 'vm', member_id: 'john' },
        { role: 'cam-1', member_id: 'jane' },
      ])
      const ok = canSwapRosterSlots({
        memberA: 'john', memberB: 'jane',
        eventA: event, eventB: event,
        sourceIndex: 0, targetIndex: 1,
        slotA: event.roster[0], slotB: event.roster[1],
        members, memberConstraints: [], allEvents: [event],
      })
      expect(ok).toBe(true)
    })

    it('rejects a swap that would place a member in a role they cannot fill', () => {
      // Alice only does cam-1; swapping her into the vm slot is invalid.
      const event = makeEvent('2026-02-08', [
        { role: 'vm', member_id: 'john' },
        { role: 'cam-1', member_id: 'alice' },
      ])
      const ok = canSwapRosterSlots({
        memberA: 'john', memberB: 'alice',
        eventA: event, eventB: event,
        sourceIndex: 0, targetIndex: 1,
        slotA: event.roster[0], slotB: event.roster[1],
        members, memberConstraints: [], allEvents: [event],
      })
      expect(ok).toBe(false)
    })

    it('rejects a cross-event move onto a date the member is unavailable', () => {
      const eventA = makeEvent('2026-02-08', [{ role: 'vm', member_id: 'john' }])
      const eventB = makeEvent('2026-02-15', [{ role: 'vm', member_id: null }])
      const constraints = [{ member_id: 'john', unavailable_dates: ['2026-02-15'] }]
      const ok = canSwapRosterSlots({
        memberA: 'john', memberB: null,
        eventA, eventB,
        sourceIndex: 0, targetIndex: 0,
        slotA: eventA.roster[0], slotB: eventB.roster[0],
        members, memberConstraints: constraints, allEvents: [eventA, eventB],
      })
      expect(ok).toBe(false)
    })

    it('rejects a cross-event swap that would duplicate a member within one event', () => {
      // eventA: john(vm) + jane(cam-1). eventB: jane(vm). Swapping john(A/vm)
      // with jane(B/vm) would put jane in eventA twice (cam-1 + vm).
      const eventA = makeEvent('2026-02-08', [
        { role: 'vm', member_id: 'john' },
        { role: 'cam-1', member_id: 'jane' },
      ])
      const eventB = makeEvent('2026-02-15', [{ role: 'vm', member_id: 'jane' }])
      const ok = canSwapRosterSlots({
        memberA: 'john', memberB: 'jane',
        eventA, eventB,
        sourceIndex: 0, targetIndex: 0,
        slotA: eventA.roster[0], slotB: eventB.roster[0],
        members, memberConstraints: [], allEvents: [eventA, eventB],
      })
      expect(ok).toBe(false)
    })

    it('rejects moving in an inactive (include:false) member', () => {
      const event = makeEvent('2026-02-08', [
        { role: 'vm', member_id: 'bob' },
        { role: 'cam-1', member_id: null },
      ])
      const ok = canSwapRosterSlots({
        memberA: 'bob', memberB: null,
        eventA: event, eventB: event,
        sourceIndex: 0, targetIndex: 1,
        slotA: event.roster[0], slotB: event.roster[1],
        members, memberConstraints: [], allEvents: [event],
      })
      expect(ok).toBe(false)
    })
  })
})
