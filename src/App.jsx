import { useState } from 'react'
import { createRoleColorMap, formatDateRange } from './utils/colorUtils'
import { calculateRosterStats } from './utils/rosterStats'
import { validateEventAssignments } from './utils/assignmentValidator'
import { generateRoster } from './utils/rosterGenerator'
import { getDerivedState } from './utils/derivedState'
import { useRosterData } from './hooks/useRosterData'
import { isMemberUnavailable } from './utils/constraintsUtils'
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
  const [swapNotice, setSwapNotice] = useState(null)

  // Custom hook for all data management (consolidated state)
  const { 
    data, 
    originalData, 
    error, 
    loading, 
    hasGenerated,
    canUndo,
    actionLog,
    importData, 
    clearData, 
    updateEvents,
    logAction,
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
      logAction(result.logEntries)
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

  // Handle a manual roster slot edit from the Events view.
  // memberId === null removes the current occupant; otherwise inserts/replaces.
  const handleEditRosterSlot = (eventDate, roleIndex, memberId) => {
    const nameOf = (id) => members.find(m => m.id === id)?.name || id || '—'
    let logEntry = null

    const nextEvents = events.map(event => {
      if (event.date !== eventDate || !event.roster?.[roleIndex]) return event

      const nextRoster = event.roster.map((slot, idx) => {
        if (idx !== roleIndex) return slot

        const previous = slot.member_id || null
        const role = slot.role
        const where = `${event.date} ${event.name} / ${role}`

        if (!memberId) {
          logEntry = {
            level: 'info', category: 'delete', group: 'manual',
            message: `Removed ${nameOf(previous)} from ${where}`,
          }
          const { isGenerated, ...rest } = slot
          return { ...rest, member_id: null }
        }

        logEntry = previous
          ? {
              level: 'info', category: 'replace', group: 'manual',
              message: `Replaced ${nameOf(previous)} with ${nameOf(memberId)} on ${where}`,
            }
          : {
              level: 'info', category: 'insert', group: 'manual',
              message: `Assigned ${nameOf(memberId)} to ${where}`,
            }
        return { ...slot, member_id: memberId, isGenerated: false }
      })

      return { ...event, roster: nextRoster }
    })

    updateEvents(nextEvents)
    if (logEntry) logAction(logEntry)
  }

  // Handle a drag-and-drop swap between two roster slots.
  // Swaps the two occupants (or moves one into an empty slot) only if both
  // resulting assignments are valid: role compatibility, date availability,
  // and no duplicate member within the same event.
  const handleSwapRosterSlots = (source, target) => {
    if (
      source.eventDate === target.eventDate &&
      source.roleIndex === target.roleIndex
    ) return

    const memberById = (id) => members.find(m => m.id === id)
    const nameOf = (id) => memberById(id)?.name || id || '—'

    const eventA = events.find(e => e.date === source.eventDate)
    const eventB = events.find(e => e.date === target.eventDate)
    if (!eventA || !eventB) return

    const slotA = eventA.roster?.[source.roleIndex]
    const slotB = eventB.roster?.[target.roleIndex]
    if (!slotA || !slotB) return

    const memberA = slotA.member_id || null
    const memberB = slotB.member_id || null
    if (!memberA && !memberB) return

    // Can `memberId` occupy the given slot in `event`? Ignores the slot the
    // member is leaving so a straight swap never fails on itself.
    const canOccupy = (memberId, event, slot, ignoreRoleIndex) => {
      if (!memberId) return true // clearing a slot is always valid
      const member = memberById(memberId)
      if (!member || member.include === false) return false
      if (!member.roles?.includes(slot.role)) return false
      if (isMemberUnavailable(memberId, event.date, memberConstraints)) return false
      // No duplicate member within the same event.
      const clash = event.roster.some((r, i) =>
        i !== ignoreRoleIndex && r.member_id === memberId
      )
      return !clash
    }

    const sameEvent = eventA === eventB
    // When swapping within one event, both slots share the roster array, so
    // ignore both indices when checking for duplicates.
    const aOk = canOccupy(memberA, eventB, slotB, sameEvent ? source.roleIndex : target.roleIndex)
    const bOk = canOccupy(memberB, eventA, slotA, source.roleIndex)

    if (!aOk || !bOk) {
      setSwapNotice(
        `Invalid swap: ${nameOf(memberA)} ↔ ${nameOf(memberB)} would break role, availability, or once-per-event rules.`
      )
      setTimeout(() => setSwapNotice(null), 3000)
      return
    }

    const nextEvents = events.map(event => {
      if (event !== eventA && event !== eventB) return event
      const nextRoster = event.roster.map((slot, idx) => {
        const isSlotA = event === eventA && idx === source.roleIndex
        const isSlotB = event === eventB && idx === target.roleIndex
        if (isSlotA) {
          if (!memberB) { const { isGenerated, ...rest } = slot; return { ...rest, member_id: null } }
          return { ...slot, member_id: memberB, isGenerated: false }
        }
        if (isSlotB) {
          if (!memberA) { const { isGenerated, ...rest } = slot; return { ...rest, member_id: null } }
          return { ...slot, member_id: memberA, isGenerated: false }
        }
        return slot
      })
      return { ...event, roster: nextRoster }
    })

    updateEvents(nextEvents)
    logAction({
      level: 'info', category: 'swap', group: 'manual',
      message:
        memberA && memberB
          ? `Swapped ${nameOf(memberA)} (${eventA.date}/${slotA.role}) ↔ ${nameOf(memberB)} (${eventB.date}/${slotB.role})`
          : `Moved ${nameOf(memberA || memberB)} to ${(memberA ? eventB : eventA).date}/${(memberA ? slotB : slotA).role}`,
    })
  }

  // Handle view diff
  const handleViewDiff = () => {
    if (originalData) {
      setShowDiffModal(true)
    }
  }

  // Handle import new data - consolidates import and clear functionality
  const handleImportNew = () => {
    if (data) {
      // If data exists, confirm before clearing
      if (confirm('Import new data? This will clear all existing data.')) {
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

        {/* Import Modal for Landing Page */}
        {showImportModal && (
          <YAMLImportModal
            onImport={handleImport}
            onClose={() => setShowImportModal(false)}
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
              {/* Import Button */}
              <button
                onClick={handleImportNew}
                className="px-3 sm:px-4 py-2 sm:py-2.5 text-sm font-medium text-gray-700 bg-white/60 backdrop-blur-md border border-gray-300/50 rounded-lg shadow-md hover:bg-gray-50/80 active:bg-gray-100/80 transition-all touch-manipulation min-h-[44px]"
                title="Import new data"
              >
                📥 <span className="sm:inline">Import</span>
              </button>
              
              {/* Generation Buttons */}
              {canUndo && (
                <button
                  onClick={handleUndo}
                  className="px-3 sm:px-4 py-2 sm:py-2.5 text-sm font-medium text-gray-700 bg-white/60 backdrop-blur-md border border-gray-300/50 rounded-lg shadow-md hover:bg-gray-50/80 active:bg-gray-100/80 transition-all touch-manipulation min-h-[44px]"
                  title="Undo last generation"
                >
                  ↶ <span className="sm:inline">Undo</span>
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
            <RosterStatsPanel stats={rosterStats} generationResult={generationResult} members={members} actionLog={actionLog} />
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
      <div className="flex flex-col lg:flex-row">
        {/* Members Section */}
        <div className="w-full lg:w-5/12 lg:border-r border-gray-200 pb-4 lg:pb-0">
          <MembersView 
            members={members}
            roles={roles}
            roleColorMap={roleColorMap}
            warnings={data?.warnings}
            searchQuery={searchQuery}
            memberConstraints={memberConstraints}
            memberPreferences={memberPreferences}
          />
        </div>

        {/* Events Section */}
        <div className="w-full lg:w-7/12">
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
            onEditRosterSlot={handleEditRosterSlot}
            onSwapRosterSlots={handleSwapRosterSlots}
            yamlData={data}
          />
        </div>
      </div>
      {/* Invalid-swap toast */}
      {swapNotice && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 shadow-lg">
          {swapNotice}
        </div>
      )}
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
