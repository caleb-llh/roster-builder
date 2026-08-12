/**
 * Bulk-clear helper for the Events multi-select feature.
 *
 * "Clear" means: empty the assigned member from a roster slot but KEEP the role
 * requirement (mirrors the single-slot `handleEditRosterSlot(date, idx, null)`
 * path). It is deliberately the non-destructive action — removing whole role
 * slots is a separate, more destructive operation (`handleRemoveRosterSlot`).
 *
 * Slot keys are the same `"<date>#<roleIndex>"` format the Events view already
 * uses for the diff overlay, so the caller can pass the exact set the user
 * ticked. Applying the whole set in one pass means the change lands as a single
 * draft entry and a single undo step.
 */

/** The slot key format shared with EventsView's diff map: `date#roleIndex`. */
export const slotKey = (date, roleIndex) => `${date}#${roleIndex}`

/**
 * Return `{ nextEvents, count }` where every slot named in `keys` has its
 * `member_id` cleared (and the generated tag dropped, since a manual clear
 * un-generates the slot). Role slots are preserved. Unknown keys and
 * already-empty slots are ignored (they don't inflate `count`). `events` is not
 * mutated.
 *
 * @param {Array} events   The current events array.
 * @param {Iterable<string>} keys  Slot keys (`date#roleIndex`) to clear.
 */
export function buildBulkClear(events, keys) {
  const keySet = keys instanceof Set ? keys : new Set(keys)
  if (keySet.size === 0) return { nextEvents: events, count: 0 }

  let count = 0
  const nextEvents = (events || []).map(event => {
    if (!event.roster?.length) return event

    let changed = false
    const nextRoster = event.roster.map((slot, idx) => {
      if (!keySet.has(slotKey(event.date, idx))) return slot
      if (!slot.member_id) return slot // nothing to clear
      changed = true
      count++
      const { isGenerated, ...rest } = slot
      return { ...rest, member_id: null }
    })

    return changed ? { ...event, roster: nextRoster } : event
  })

  return { nextEvents, count }
}
