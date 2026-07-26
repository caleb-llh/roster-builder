import { useState, useEffect } from 'react'
import yaml from 'js-yaml'
import { runAllValidators } from '../validators'
import { saveToLocalStorage, loadFromLocalStorage, clearLocalStorage } from '../utils/dataExport'
import { getYAMLFromURL, updateURLWithYAML, clearYAMLFromURL } from '../utils/urlState'

/**
 * Custom hook for managing roster data state and operations
 * URL configs are temporary (not saved to localStorage)
 * Only explicitly imported configs are persisted
 */
export function useRosterData() {
  const [data, setData] = useState(null)
  const [originalData, setOriginalData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [hasGenerated, setHasGenerated] = useState(false)
  const [history, setHistory] = useState([])
  const [isFromURL, setIsFromURL] = useState(false) // Track if data is from URL
  const [actionLog, setActionLog] = useState([]) // Generic roster action log

  // Auto-save to localStorage only for explicitly imported data (not URL data)
  useEffect(() => {
    if (!isFromURL && (data || originalData || history.length > 0)) {
      console.log('[Auto-save] Saving to localStorage')
      saveToLocalStorage({
        data,
        originalData,
        hasGenerated,
        history,
        actionLog
      })
    } else if (isFromURL && data) {
      console.log('[Auto-save] Skipping localStorage save (data is from URL)')
    }
  }, [data, originalData, hasGenerated, history, isFromURL, actionLog])

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      const urlYAML = getYAMLFromURL()
      
      if (urlYAML) {
        // Load from URL (temporary, not saved to localStorage)
        console.log('[URL Load] Found config in URL, loading...', { 
          length: urlYAML.length,
          preview: urlYAML.substring(0, 50) + '...'
        })
        
        try {
          const parsedData = yaml.load(urlYAML)
          console.log('[URL Load] Successfully parsed YAML from URL')
          
          const validation = runAllValidators(parsedData)
          
          if (!validation.isValid) {
            console.error('[URL Load] Validation failed:', validation.errors)
            setError({ type: 'validation', message: validation.errors })
          } else {
            console.log('[URL Load] Validation passed, loading data from URL (temporary)')
            
            setIsFromURL(true)
            setOriginalData(JSON.parse(JSON.stringify(parsedData)))
            
            if (validation.hasWarnings) {
              setData({ ...parsedData, warnings: validation.warnings })
            } else {
              setData(parsedData)
            }
            
            // Clear localStorage so URL takes precedence
            console.log('[URL Load] Clearing localStorage - URL configs are temporary')
            clearLocalStorage()
          }
          
          setLoading(false)
          return
        } catch (err) {
          console.error('[URL Load] Failed to load from URL:', err)
          console.error('[URL Load] Error details:', { 
            name: err.name, 
            message: err.message,
            stack: err.stack 
          })
        }
      }
      
      // No URL config - start with clean slate
      console.log('[Load] No URL config found - starting with empty state')
      setLoading(false)
    }
    
    loadData()
  }, [])

  // Import YAML data (explicitly imported configs ARE saved to localStorage)
  const importData = async (yamlText) => {
    const parsedData = yaml.load(yamlText)
    const validation = runAllValidators(parsedData)
    
    if (!validation.isValid) {
      throw new Error(validation.errors.join('\n'))
    }
    
    // Mark as NOT from URL so it gets saved to localStorage
    setIsFromURL(false)
    
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
    
    // Update URL with new data
    updateURLWithYAML(yamlText)
    
    return true
  }

  // Clear all data
  const clearData = () => {
    clearLocalStorage()
    clearYAMLFromURL()
    setData(null)
    setOriginalData(null)
    setHasGenerated(false)
    setHistory([])
    setActionLog([])
    setError(null)
    setIsFromURL(false)
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
