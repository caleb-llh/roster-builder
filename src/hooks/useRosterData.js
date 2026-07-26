import { useState } from 'react'
import yaml from 'js-yaml'
import { runAllValidators } from '../validators'

/**
 * Custom hook for managing roster data state and operations.
 * State is held fully in memory for the session — nothing is persisted to
 * localStorage or the URL, so a page refresh starts from an empty state.
 */
export function useRosterData() {
  const [data, setData] = useState(null)
  const [originalData, setOriginalData] = useState(null)
  const [error, setError] = useState(null)
  const [loading] = useState(false)
  const [hasGenerated, setHasGenerated] = useState(false)
  const [history, setHistory] = useState([])
  const [actionLog, setActionLog] = useState([]) // Generic roster action log

  // Import YAML data
  const importData = async (yamlText) => {
    const parsedData = yaml.load(yamlText)
    const validation = runAllValidators(parsedData)

    if (!validation.isValid) {
      throw new Error(validation.errors.join('\n'))
    }

    // Store original data for comparison
    setOriginalData(JSON.parse(JSON.stringify(parsedData)))

    if (validation.hasWarnings) {
      setData({ ...parsedData, warnings: validation.warnings })
    } else {
      setData(parsedData)
    }

    setError(null)
    setHasGenerated(false)
    setHistory([])
    setActionLog([])

    return true
  }

  // Clear all data
  const clearData = () => {
    setData(null)
    setOriginalData(null)
    setHasGenerated(false)
    setHistory([])
    setActionLog([])
    setError(null)
  }

  // Update events after generation
  const updateEvents = (newEvents) => {
    setData(prevData => ({
      ...prevData,
      events: newEvents
    }))
    setHasGenerated(true)
  }

  /**
   * Append entries to the generic roster action log.
   *
   * Each entry is a structured record { level, category, group, message, data }
   * where `category` describes the kind of action ('generation', 'swap',
   * 'update', 'delete', 'insert', ...). This is the single choke point future
   * manual edit handlers (swaps/updates/deletes/inserts) should call so their
   * actions are captured alongside the generation trace.
   *
   * Accepts a single entry or an array of entries.
   */
  const logAction = (entryOrEntries) => {
    const additions = Array.isArray(entryOrEntries) ? entryOrEntries : [entryOrEntries]
    if (additions.length === 0) return
    setActionLog(prev => [...prev, ...additions])
  }

  // Add to history
  const saveToHistory = (events) => {
    setHistory(prev => [...prev, JSON.parse(JSON.stringify(events))])
  }

  // Undo to previous state
  const undoToHistory = () => {
    if (history.length === 0) return false
    
    const previousEvents = history[history.length - 1]
    setHistory(prev => prev.slice(0, -1))
    setData(prevData => ({
      ...prevData,
      events: previousEvents
    }))
    
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
    
    // Actions
    importData,
    clearData,
    updateEvents,
    logAction,
    saveToHistory,
    undoToHistory,
    setError,
    setData
  }
}
