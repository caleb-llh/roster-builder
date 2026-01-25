import { useState, useEffect } from 'react'
import yaml from 'js-yaml'
import { runAllValidators } from '../validators'
import { saveToLocalStorage, loadFromLocalStorage, clearLocalStorage } from '../utils/dataExport'
import { getYAMLFromURL, updateURLWithYAML, clearYAMLFromURL } from '../utils/urlState'

/**
 * Custom hook for managing roster data state and operations
 * Persists: data, originalData, hasGenerated, history
 */
export function useRosterData() {
  const [data, setData] = useState(null)
  const [originalData, setOriginalData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [hasGenerated, setHasGenerated] = useState(false)
  const [history, setHistory] = useState([])

  // Auto-save all state to localStorage when any changes
  useEffect(() => {
    if (data || originalData || history.length > 0) {
      saveToLocalStorage({
        data,
        originalData,
        hasGenerated,
        history
      })
    }
  }, [data, originalData, hasGenerated, history])

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      // First, try to load from URL (higher priority)
      const urlYAML = getYAMLFromURL()
      
      if (urlYAML) {
        try {
          const parsedData = yaml.load(urlYAML)
          const validation = runAllValidators(parsedData)
          
          if (!validation.isValid) {
            setError({ type: 'validation', message: validation.errors })
          } else {
            // Store original data for comparison
            setOriginalData(JSON.parse(JSON.stringify(parsedData)))
            
            if (validation.hasWarnings) {
              setData({ ...parsedData, warnings: validation.warnings })
            } else {
              setData(parsedData)
            }
          }
          
          setLoading(false)
          return
        } catch (err) {
          console.error('Failed to load from URL:', err)
          // Fall through to localStorage
        }
      }
      
      // If no URL data, load from localStorage
      const saved = loadFromLocalStorage()
      
      if (saved && saved.data) {
        // saved.data contains the state object { data, originalData, hasGenerated, history }
        const state = saved.data
        
        if (state.data) {
          const validation = runAllValidators(state.data)
          
          if (!validation.isValid) {
            setError({ type: 'validation', message: validation.errors })
          } else if (validation.hasWarnings) {
            setData({ ...state.data, warnings: validation.warnings })
          } else {
            setData(state.data)
          }
          
          // Restore all persisted state
          if (state.originalData) setOriginalData(state.originalData)
          if (state.hasGenerated !== undefined) setHasGenerated(state.hasGenerated)
          if (state.history) setHistory(state.history)
        }
      }
      
      setLoading(false)
    }
    
    loadData()
  }, [])

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
    
    // Actions
    importData,
    clearData,
    updateEvents,
    saveToHistory,
    undoToHistory,
    setError,
    setData
  }
}
