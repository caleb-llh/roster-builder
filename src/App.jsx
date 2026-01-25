import { useState } from 'react'
import yaml from 'js-yaml'
import { createRoleColorMap, formatDateRange } from './utils/colorUtils'
import { calculateRosterStats } from './utils/rosterStats'
import { validateEventAssignments } from './utils/assignmentValidator'
import { generateRoster } from './utils/rosterGenerator'
import { getDerivedState } from './utils/derivedState'
import { useRosterData } from './hooks/useRosterData'
import { generateShareableURL } from './utils/urlState'
import { getActiveConstraints, getActivePreferences, getConstraintDescription, getPreferenceDescription, MEMBER_PREF_FIELDS } from './schema/rosterSchema'
import { ErrorDisplay } from './components/SharedComponents'
import MembersView from './components/MembersView'
import EventsView from './components/EventsView'
import RosterStatsPanel from './components/RosterStatsPanel'
import AlgorithmDescriptionModal from './components/AlgorithmDescriptionModal'
import GenerationResultModal from './components/GenerationResultModal'
import YAMLImportModal from './components/YAMLImportModal'
import YAMLDiffModal from './components/YAMLDiffModal'

function App() {
  // UI State
  const [searchQuery, setSearchQuery] = useState('')
  const [showGenerationModal, setShowGenerationModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showDiffModal, setShowDiffModal] = useState(false)
  const [showAlgorithmModal, setShowAlgorithmModal] = useState(false)
  const [generationResult, setGenerationResult] = useState(null)
  const [showCopiedTooltip, setShowCopiedTooltip] = useState(false)

  // Custom hook for all data management (consolidated state)
  const { 
    data, 
    originalData, 
    error, 
    loading, 
    hasGenerated,
    canUndo,
    importData, 
    clearData, 
    updateEvents,
    saveToHistory,
    undoToHistory,
    setError 
  } = useRosterData()

  // Derived state using utility function
  const {
    members,
    events,
    roles,
    activeMembers,
    memberConstraints,
    memberPreferences,
    rosterConstraints,
    rosterPreferences,
    rosterPeriod
  } = getDerivedState(data)

  const roleColorMap = createRoleColorMap(roles)
  const rosterStats = calculateRosterStats(events, members, rosterPeriod)
  
  // Validate event assignments
  const validationResults = validateEventAssignments(
    events,
    members,
    memberConstraints,
    memberPreferences,
    rosterConstraints,
    rosterPreferences,
    rosterPeriod
  )

  // Generate dynamic algorithm description based on configuration
  const getAlgorithmDescription = () => {
    const sections = []
    
    // Constraints section
    const activeConstraintKeys = getActiveConstraints(rosterConstraints)
    if (activeConstraintKeys.length > 0) {
      const descriptions = activeConstraintKeys
        .map(key => getConstraintDescription(key, rosterConstraints))
        .filter(Boolean)
      sections.push('✓ Rules that must be followed:\n• ' + descriptions.join('\n• '))
    }
    
    // Preferences section
    const activePreferenceKeys = getActivePreferences(rosterPreferences)
    if (activePreferenceKeys.length > 0) {
      const descriptions = activePreferenceKeys
        .map(key => getPreferenceDescription(key))
        .filter(Boolean)
      sections.push('⚖️ Goals to optimize for:\n• ' + descriptions.join('\n• '))
    }
    
    // Member day preferences
    if (memberPreferences && Object.keys(memberPreferences).length > 0) {
      const dayPrefs = {}
      Object.values(memberPreferences).forEach(pref => {
        if (pref[MEMBER_PREF_FIELDS.PREFERRED_DAY]) {
          const day = pref[MEMBER_PREF_FIELDS.PREFERRED_DAY]
          dayPrefs[day] = (dayPrefs[day] || 0) + 1
        }
      })
      
      if (Object.keys(dayPrefs).length > 0) {
        const prefSummary = Object.entries(dayPrefs)
          .map(([day, count]) => `${count} member${count > 1 ? 's' : ''} prefer ${day}`)
          .join(', ')
        sections.push('👥 Individual preferences:\n• The system will try to match members with their preferred days (' + prefSummary + ')')
      }
    }
    
    // Default message if no configuration
    if (sections.length === 0) {
      return 'The system will automatically assign members to open slots, making sure everyone gets a fair share and respecting any preferences you\'ve set up.'
    }
    
    return 'The system will automatically create assignments based on:\n\n' + sections.join('\n\n')
  }

  // Handle YAML import
  const handleImport = async (yamlText) => {
    try {
      await importData(yamlText)
      setShowImportModal(false)
      setGenerationResult(null)
    } catch (err) {
      throw new Error(`Failed to parse YAML: ${err.message}`)
    }
  }

  // Handle roster generation - show description modal first
  const handleGenerateRoster = () => {
    setShowAlgorithmModal(true)
  }

  // Actually generate the roster after user confirms
  const handleConfirmGeneration = () => {
    setShowAlgorithmModal(false)
    try {
      // Save current state to history
      saveToHistory(events)
      
      const result = generateRoster(
        events,
        members,
        memberConstraints,
        memberPreferences,
        rosterConstraints,
        rosterPreferences,
        rosterPeriod
      )
      
      updateEvents(result.events)
      setGenerationResult(result)
      setShowGenerationModal(true)
    } catch (err) {
      setError({ type: 'generation', message: err.message })
    }
  }

  // Handle undo
  const handleUndo = () => {
    if (undoToHistory()) {
      setGenerationResult(null)
    }
  }

  // Handle view diff
  const handleViewDiff = () => {
    if (originalData) {
      setShowDiffModal(true)
    }
  }

  // Handle share - copy shareable URL to clipboard
  const handleShare = async () => {
    try {
      const yamlText = yaml.dump(data)
      const shareableURL = generateShareableURL(yamlText)
      
      await navigator.clipboard.writeText(shareableURL)
      setShowCopiedTooltip(true)
      setTimeout(() => setShowCopiedTooltip(false), 2000)
    } catch (err) {
      console.error('Failed to copy URL:', err)
      alert('Failed to copy shareable URL')
    }
  }

  // Handle import new data - consolidates import and clear functionality
  const handleImportNew = () => {
    if (data) {
      // If data exists, confirm before clearing
      if (confirm('Import new data? This will clear all existing data including localStorage.')) {
        clearData()
        setGenerationResult(null)
        setShowImportModal(true)
      }
    } else {
      // No data exists, just show import modal
      setShowImportModal(true)
    }
  }

  // Check if there are unassigned roles
  const hasUnassignedRoles = events.some(event => 
    event.roster && event.roster.some(r => !r.member_id)
  )
  
  const unassignedRolesCount = events.reduce((count, event) => {
    if (!event.roster) return count
    return count + event.roster.filter(r => !r.member_id).length
  }, 0)

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-600">Loading...</div></div>
  if (error) return <ErrorDisplay title={error.type === 'validation' ? 'Validation Errors' : 'Loading Error'} message={error.message} hint={error.type === 'load' ? 'Check YAML file syntax. Telegram handles need quotes.' : undefined} />

  // Show welcome screen if no data
  if (!data) {
    return (
      <>
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
          <div className="max-w-2xl w-full">
            <div className="text-center mb-8">
              <h1 className="text-5xl font-bold text-gray-900 mb-4">📋 Roster Builder</h1>
              <p className="text-xl text-gray-600">
                Intelligent roster generation and management
              </p>
            </div>
            
            <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-2xl p-8 border border-white/50">
              <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">Get Started</h2>
              
              <div className="space-y-4">
                <button
                  onClick={() => setShowImportModal(true)}
                  className="w-full px-8 py-6 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-bold text-lg rounded-xl shadow-lg hover:shadow-xl hover:from-blue-600 hover:to-blue-700 transition-all flex items-center justify-center gap-3"
                >
                  <span className="text-2xl">📥</span>
                  <span>Import Roster Data</span>
                </button>
                
                <div className="text-center text-sm text-gray-500">
                  Paste YAML or upload a file to begin
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {showImportModal && (
          <YAMLImportModal
            onImport={handleImport}
            onClose={() => {}}
          />
        )}
      </>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white/40 backdrop-blur-md shadow-lg border-b border-white/30">
        <div className="max-w-full px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Roster Builder</h1>
              {rosterPeriod && rosterPeriod.start_date && rosterPeriod.end_date && (
                <div className="text-xs sm:text-sm font-medium text-gray-700 bg-blue-100/60 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-blue-200/30 w-fit">
                  {formatDateRange(rosterPeriod.start_date, rosterPeriod.end_date)}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Share Button */}
              {data && (
                <div className="relative">
                  <button
                    onClick={handleShare}
                    className="px-3 sm:px-4 py-2 sm:py-2.5 text-sm font-medium text-gray-700 bg-white/60 backdrop-blur-md border border-gray-300/50 rounded-lg shadow-md hover:bg-gray-50/80 active:bg-gray-100/80 transition-all touch-manipulation min-h-[44px]"
                    title="Copy shareable URL to clipboard"
                  >
                    🔗 <span className="hidden sm:inline">Share</span>
                  </button>
                  {showCopiedTooltip && (
                    <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-green-600 text-white text-xs rounded shadow-lg whitespace-nowrap">
                      ✓ Copied to clipboard!
                    </div>
                  )}
                </div>
              )}
              
              {/* Import Button */}
              <button
                onClick={handleImportNew}
                className="px-3 sm:px-4 py-2 sm:py-2.5 text-sm font-medium text-gray-700 bg-white/60 backdrop-blur-md border border-gray-300/50 rounded-lg shadow-md hover:bg-gray-50/80 active:bg-gray-100/80 transition-all touch-manipulation min-h-[44px]"
                title="Import new data"
              >
                📥 <span className="hidden sm:inline">Import</span><span className="sm:hidden">Import</span>
              </button>
              
              {/* Generation Buttons */}
              {canUndo && (
                <button
                  onClick={handleUndo}
                  className="px-3 sm:px-4 py-2 sm:py-2.5 text-sm font-medium text-gray-700 bg-white/60 backdrop-blur-md border border-gray-300/50 rounded-lg shadow-md hover:bg-gray-50/80 active:bg-gray-100/80 transition-all touch-manipulation min-h-[44px]"
                  title="Undo last generation"
                >
                  ↶ <span className="hidden sm:inline">Undo</span>
                </button>
              )}
              {hasUnassignedRoles && (
                <button
                  onClick={handleGenerateRoster}
                  className="relative px-4 sm:px-6 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-blue-500 via-blue-600 to-blue-500 bg-[length:200%_100%] rounded-lg shadow-lg hover:shadow-xl active:scale-95 transition-all overflow-hidden group touch-manipulation min-h-[44px]"
                  style={{ 
                    animation: 'shimmer 3s ease-in-out infinite',
                    boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.5), 0 0 20px rgba(59, 130, 246, 0.3)'
                  }}
                >
                  <span className="relative z-10 flex items-center">
                    ✨ Generate Roster
                    {unassignedRolesCount > 0 && (
                      <span className="ml-2 px-2 py-0.5 bg-white/30 rounded-full text-xs font-semibold">
                        {unassignedRolesCount}
                      </span>
                    )}
                  </span>
                  <div className="absolute inset-0 rounded-lg" style={{ 
                    animation: 'borderShimmer 3s ease-in-out infinite',
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                    backgroundSize: '200% 100%'
                  }} />
                </button>
              )}
              <style>{`
                @keyframes shimmer {
                  0%, 100% { background-position: 0% 50%; }
                  50% { background-position: 100% 50%; }
                }
                @keyframes borderShimmer {
                  0%, 100% { background-position: -100% 0; }
                  50% { background-position: 200% 0; }
                }
              `}</style>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-gray-600">{activeMembers.length} members · {events.length} events</p>
          
          {/* Roster Statistics */}
          <div className="mt-3 sm:mt-4">
            <RosterStatsPanel stats={rosterStats} generationResult={generationResult} members={members} />
          </div>
          
          {/* Shared Search Bar */}
          <div className="mt-3 sm:mt-4 flex sm:justify-end">
            <div className="relative w-full sm:max-w-md">
              <input
                type="text"
                placeholder="Search members and events..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 sm:px-4 py-2 pr-10 text-sm sm:text-base bg-white/40 backdrop-blur-md border border-white/30 rounded-lg shadow-lg focus:ring-2 focus:ring-blue-400/50 focus:border-transparent placeholder-gray-600 touch-manipulation"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700 active:text-gray-900 transition-colors touch-manipulation"
                  aria-label="Clear search"
                >
                  <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Split View Container */}
      <div className="flex flex-col xl:flex-row">
        {/* Members Section */}
        <div className="w-full xl:w-5/12 xl:border-r border-gray-200 pb-4 xl:pb-0">
          <MembersView 
            members={members}
            roles={roles}
            roleColorMap={roleColorMap}
            warnings={data?.warnings}
            searchQuery={searchQuery}
            memberConstraints={memberConstraints}
          />
        </div>

        {/* Events Section */}
        <div className="w-full xl:w-7/12">
          <EventsView 
            events={events}
            members={members}
            memberConstraints={memberConstraints}
            roleColorMap={roleColorMap}
            roles={roles}
            searchQuery={searchQuery}
            validationResults={validationResults}
            originalData={originalData}
            hasGenerated={hasGenerated}
            onViewDiff={handleViewDiff}
          />
        </div>
      </div>
      {/* Algorithm Description Modal */}
      {showAlgorithmModal && (
        <AlgorithmDescriptionModal
          description={getAlgorithmDescription()}
          onContinue={handleConfirmGeneration}
          onClose={() => setShowAlgorithmModal(false)}
        />
      )}
      {/* Generation Result Modal */}
      {showGenerationModal && (
        <GenerationResultModal
          generationResult={generationResult}
          members={members}
          onClose={() => setShowGenerationModal(false)}
        />
      )}

      {/* YAML Import Modal */}
      {showImportModal && (
        <YAMLImportModal
          onImport={handleImport}
          onClose={() => setShowImportModal(false)}
        />
      )}

      {/* YAML Diff Modal */}
      {showDiffModal && originalData && (
        <YAMLDiffModal
          originalData={originalData}
          currentData={data}
          onClose={() => setShowDiffModal(false)}
        />
      )}
    </div>
  )
}

export default App
