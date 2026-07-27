import { useState } from 'react'
import yaml from 'js-yaml'
import { runAllValidators } from '../validators'
import { LOCAL_PERMISSIONS } from './providerContract'

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
  const [history, setHistory] = useState([])
  const [actionLog, setActionLog] = useState([]) // Generic roster action log

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
    setHistory([])
    setActionLog([])

    return { ok: true, errors: [] }
  }

  // Clear all data.
  const clearData = async () => {
    setData(null)
    setOriginalData(null)
    setHasGenerated(false)
    setHistory([])
    setActionLog([])
    setError(null)
  }

  // Update events after generation / manual edit.
  const updateEvents = async (newEvents) => {
    setData(prevData => ({ ...prevData, events: newEvents }))
    setHasGenerated(true)
    return { ok: true, errors: [] }
  }

  /**
   * Replace the entire working document from an edited object (e.g. the live
   * YAML editor). Validates first; on failure the current state is kept
   * unchanged and the errors are returned so the caller can surface them.
   * This is a live edit of the working document, so history / generated flags
   * are preserved (unlike importData, which starts a fresh session).
   */
  const replaceData = async (parsedData) => {
    const validation = runAllValidators(parsedData)
    if (!validation.isValid) {
      return { ok: false, errors: validation.errors }
    }

    setData(
      validation.hasWarnings
        ? { ...parsedData, warnings: validation.warnings }
        : parsedData
    )
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

  // Add to history.
  const saveToHistory = async (events) => {
    setHistory(prev => [...prev, JSON.parse(JSON.stringify(events))])
  }

  // Undo to previous state.
  const undoToHistory = async () => {
    if (history.length === 0) return false

    const previousEvents = history[history.length - 1]
    setHistory(prev => prev.slice(0, -1))
    setData(prevData => ({ ...prevData, events: previousEvents }))
    return true
  }

  return {
    // State
    data,
    originalData,
    error,
    loading,
    hasGenerated,
    history,
    canUndo: history.length > 0,
    actionLog,
    permissions: LOCAL_PERMISSIONS,

    // Actions
    importData,
    clearData,
    updateEvents,
    replaceData,
    logAction,
    saveToHistory,
    undoToHistory,
    setError,
  }
}
