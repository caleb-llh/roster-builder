import { useState } from 'react'
import yaml from 'js-yaml'
import { runAllValidators } from '../validators'
import { LOCAL_PERMISSIONS } from './providerContract'
import { useDraftHistory } from './useDraftHistory'

/**
 * Local (in-memory) implementation of the roster data provider contract.
 *
 * State is held fully in memory for the session — nothing is persisted, so a
 * page refresh starts from an empty state. This is the default GitHub Pages
 * playground. Mutations are async-shaped and return { ok, errors } to match the
 * production contract exactly, even though local edits cannot really fail; this
 * keeps callers honest so the same code paths work in production.
 *
 * @returns {import('./providerContract').RosterProvider}
 */
export function useLocalRosterProvider() {
  const [data, setData] = useState(null)
  const [originalData, setOriginalData] = useState(null)
  const [error, setError] = useState(null)
  const [loading] = useState(false)
  const [hasGenerated, setHasGenerated] = useState(false)
  const [actionLog, setActionLog] = useState([]) // Generic roster action log

  // Draft overlay + undo/redo. Committed events live in `data.events`; edits
  // build an uncommitted draft that is only merged back on commit().
  const persistCommittedEvents = async (events) => {
    setData(prevData => ({ ...prevData, events }))
    setHasGenerated(true)
    return { ok: true, errors: [] }
  }
  const draft = useDraftHistory(data?.events, persistCommittedEvents)

  // Import YAML data (fresh session).
  const importData = async (yamlText) => {
    let parsedData
    try {
      parsedData = yaml.load(yamlText)
    } catch (err) {
      return { ok: false, errors: [err.message] }
    }

    const validation = runAllValidators(parsedData)
    if (!validation.isValid) {
      return { ok: false, errors: validation.errors }
    }

    setOriginalData(JSON.parse(JSON.stringify(parsedData)))
    setData(
      validation.hasWarnings
        ? { ...parsedData, warnings: validation.warnings }
        : parsedData
    )
    setError(null)
    setHasGenerated(false)
    draft.resetDraftHistory()
    setActionLog([])

    return { ok: true, errors: [] }
  }

  // Clear all data.
  const clearData = async () => {
    setData(null)
    setOriginalData(null)
    setHasGenerated(false)
    draft.resetDraftHistory()
    setActionLog([])
    setError(null)
  }

  // Update events after generation / manual edit. Goes into the uncommitted
  // draft (undoable); committed state changes only on commit().
  const updateEvents = async (newEvents) => {
    draft.applyDraftEdit(newEvents)
    return { ok: true, errors: [] }
  }

  /**
   * Replace the entire working document from an edited object (e.g. the live
   * YAML editor). Validates first; on failure the current state is kept
   * unchanged and the errors are returned so the caller can surface them.
   *
   * Non-event fields (members, roles, constraints) apply to the working
   * document immediately. The events portion is routed through the draft so
   * YAML-editor roster changes are undoable and part of the same commit flow as
   * manual edits (see README "Draft/commit is separate from undo/redo history").
   */
  const replaceData = async (parsedData) => {
    const validation = runAllValidators(parsedData)
    if (!validation.isValid) {
      return { ok: false, errors: validation.errors }
    }

    const { events: nextEvents, ...docWithoutEvents } = parsedData
    setData(prev => ({
      ...docWithoutEvents,
      events: (draft.draftEvents !== null ? draft.draftEvents : prev?.events) || [],
      ...(validation.hasWarnings ? { warnings: validation.warnings } : {}),
    }))
    draft.applyDraftEdit(nextEvents || [])
    return { ok: true, errors: [] }
  }

  /**
   * Append entries to the generic roster action log. Accepts a single entry or
   * an array of entries. Synchronous (purely a UI log), same in both modes.
   */
  const logAction = (entryOrEntries) => {
    const additions = Array.isArray(entryOrEntries) ? entryOrEntries : [entryOrEntries]
    if (additions.length === 0) return
    setActionLog(prev => [...prev, ...additions])
  }

  return {
    // State
    data,
    originalData,
    error,
    loading,
    hasGenerated,
    // Draft + undo/redo (see useDraftHistory)
    draftEvents: draft.draftEvents,
    effectiveEvents: draft.effectiveEvents,
    hasUncommitted: draft.hasUncommitted,
    canUndo: draft.canUndo,
    canRedo: draft.canRedo,
    actionLog,
    permissions: LOCAL_PERMISSIONS,
    // Admin surface — production only. Local mode has no roles or membership,
    // so role is null (the admin UI is gated on role === 'owner') and the
    // actions are inert stubs to keep the contract shape uniform.
    role: null,
    rosters: [],
    activeRosterId: null,
    selectRoster: () => {},
    createRoster: async () => ({ ok: false, errors: ['Not available in local mode.'] }),
    listMembers: async () => ({ ok: true, errors: [], members: [] }),
    setMemberRole: async () => ({ ok: false, errors: ['Not available in local mode.'] }),
    removeMember: async () => ({ ok: false, errors: ['Not available in local mode.'] }),
    inviteMember: async () => ({ ok: false, errors: ['Not available in local mode.'] }),
    listInvites: async () => ({ ok: true, errors: [], invites: [] }),
    revokeInvite: async () => ({ ok: false, errors: ['Not available in local mode.'] }),

    // Actions
    importData,
    clearData,
    updateEvents,
    replaceData,
    logAction,
    undo: draft.undo,
    redo: draft.redo,
    commitDraft: draft.commit,
    discardDraft: draft.discard,
    setError,
  }
}
