import { useState } from 'react'
import { createRoleColorMap, formatDateRange } from './utils/colorUtils'
import { calculateRosterStats } from './utils/rosterStats'
import { validateEventAssignments } from './utils/assignmentValidator'
import { generateRoster } from './utils/rosterGenerator'
import { getDerivedState } from './utils/derivedState'
import { useRosterData } from './hooks/useRosterData'
import { canSwapRosterSlots } from './utils/constraintsUtils'
import { getActiveConstraints, getActivePreferences, getConstraintDescription, getPreferenceDescription, MEMBER_PREF_FIELDS } from './schema/rosterSchema'
import { ErrorDisplay } from './components/SharedComponents'
import MembersView from './components/MembersView'
import EventsView from './components/EventsView'
import RosterStatsPanel from './components/RosterStatsPanel'
import AlgorithmDescriptionModal from './components/AlgorithmDescriptionModal'
import GenerationResultModal from './components/GenerationResultModal'
import YamlDrawer from './components/YamlDrawer'
import AdminModal from './components/AdminModal'

function App({ auth }) {
  // UI State
  const [searchQuery, setSearchQuery] = useState('')
  const [showGenerationModal, setShowGenerationModal] = useState(false)
  const [showDrawer, setShowDrawer] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [activeTab, setActiveTab] = useState('members') // mobile-only: 'members' | 'events'
  const [showAlgorithmModal, setShowAlgorithmModal] = useState(false)
  const [generationResult, setGenerationResult] = useState(null)
  const [swapNotice, setSwapNotice] = useState(null)
  const [pendingSwap, setPendingSwap] = useState(null) // { nextEvents, logEntry, message } awaiting confirmation
  const [pendingRemoveSlot, setPendingRemoveSlot] = useState(null) // { nextEvents, prompt, message } awaiting confirmation
  const [pendingClearGenerated, setPendingClearGenerated] = useState(null) // { nextEvents, count, prompt, message } awaiting confirmation

  // Custom hook for all data management (consolidated state)
  const roster = useRosterData()
  const { 
    data, 
    error, 
    loading, 
    canUndo,
    actionLog,
    permissions,
    role,
    rosters,
    activeRosterId,
    selectRoster,
    importData, 
    clearData, 
    updateEvents,
    replaceData,
    logAction,
    saveToHistory,
    undoToHistory,
    setError 
  } = roster

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

  // Handle YAML import from the drawer (fresh session).
  const handleImport = async (yamlText) => {
    const result = await importData(yamlText)
    if (result.ok) setGenerationResult(null)
    return result
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
  const handleUndo = async () => {
    if (await undoToHistory()) {
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

    // Record a pre-mutation snapshot so this single action can be undone.
    if (logEntry) saveToHistory(events)
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

    const isValid = canSwapRosterSlots({
      memberA, memberB, eventA, eventB,
      sourceIndex: source.roleIndex, targetIndex: target.roleIndex,
      slotA, slotB, members, memberConstraints, allEvents: events,
    })

    if (!isValid) {
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

    const message =
      memberA && memberB
        ? `Swapped ${nameOf(memberA)} (${eventA.date}/${slotA.role}) ↔ ${nameOf(memberB)} (${eventB.date}/${slotB.role})`
        : `Moved ${nameOf(memberA || memberB)} to ${(memberA ? eventB : eventA).date}/${(memberA ? slotB : slotA).role}`

    // A swap rewrites two occupants at once (loss-ful), so stage it for
    // confirmation instead of applying immediately.
    setPendingSwap({
      nextEvents,
      message,
      prompt: memberA && memberB
        ? `Swap ${nameOf(memberA)} ↔ ${nameOf(memberB)}?`
        : `Move ${nameOf(memberA || memberB)}?`,
    })
  }

  // Apply the staged swap after the user confirms.
  const confirmSwap = () => {
    if (!pendingSwap) return
    saveToHistory(events) // pre-swap snapshot for single-action undo
    updateEvents(pendingSwap.nextEvents)
    logAction({ level: 'info', category: 'swap', group: 'manual', message: pendingSwap.message })
    setPendingSwap(null)
  }

  // Add a new (unassigned) role requirement to an event. Non-destructive, so
  // it applies immediately. Ignores roles already present on the event.
  const handleAddRosterSlot = (eventDate, role) => {
    if (!role) return
    let added = false
    const nextEvents = events.map(event => {
      if (event.date !== eventDate) return event
      const roster = event.roster || []
      if (roster.some(slot => slot.role === role)) return event // no duplicate roles
      added = true
      return { ...event, roster: [...roster, { role, member_id: null }] }
    })
    if (!added) return
    const event = events.find(e => e.date === eventDate)
    saveToHistory(events)
    updateEvents(nextEvents)
    logAction({
      level: 'info', category: 'insert', group: 'manual',
      message: `Added ${role} role to ${eventDate}${event ? ` ${event.name}` : ''}`,
    })
  }

  // Apply the staged role-slot removal after the user confirms. Removing an
  // entire role requirement is destructive, so it is staged for confirmation.
  const confirmRemoveSlot = () => {
    if (!pendingRemoveSlot) return
    saveToHistory(events)
    updateEvents(pendingRemoveSlot.nextEvents)
    logAction({ level: 'info', category: 'delete', group: 'manual', message: pendingRemoveSlot.message })
    setPendingRemoveSlot(null)
  }

  // Stage the removal of an entire role slot from an event for confirmation.
  const handleRemoveRosterSlot = (eventDate, roleIndex) => {
    const event = events.find(e => e.date === eventDate)
    const slot = event?.roster?.[roleIndex]
    if (!slot) return

    const nameOf = (id) => members.find(m => m.id === id)?.name || id
    const nextEvents = events.map(e => {
      if (e.date !== eventDate) return e
      return { ...e, roster: e.roster.filter((_, idx) => idx !== roleIndex) }
    })

    const occupant = slot.member_id ? ` (currently ${nameOf(slot.member_id)})` : ''
    setPendingRemoveSlot({
      nextEvents,
      prompt: `Remove the ${slot.role} role?`,
      message: `Removes the ${slot.role} role from ${event.date} ${event.name}${occupant}.`,
    })
  }

  // Clear all auto-generated assignments (slots tagged isGenerated), leaving
  // their role requirements in place but unassigned. Manual assignments are
  // untouched. Staged for confirmation since it's destructive.
  const handleClearGenerated = () => {
    let count = 0
    const nextEvents = events.map(event => {
      if (!event.roster?.some(s => s.isGenerated)) return event
      const nextRoster = event.roster.map(slot => {
        if (!slot.isGenerated) return slot
        count++
        const { isGenerated, ...rest } = slot
        return { ...rest, member_id: null }
      })
      return { ...event, roster: nextRoster }
    })
    if (count === 0) return
    setPendingClearGenerated({
      nextEvents,
      count,
      prompt: `Remove ${count} generated assignment${count > 1 ? 's' : ''}?`,
      message: 'Clears every assignment tagged "generated", leaving the role slots empty. Manual assignments are kept.',
    })
  }

  // Apply the staged clear-generated action after the user confirms.
  const confirmClearGenerated = () => {
    if (!pendingClearGenerated) return
    saveToHistory(events)
    updateEvents(pendingClearGenerated.nextEvents)
    logAction({
      level: 'info', category: 'delete', group: 'manual',
      message: `Removed ${pendingClearGenerated.count} generated assignment${pendingClearGenerated.count > 1 ? 's' : ''}`,
    })
    setPendingClearGenerated(null)
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
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4 pt-safe pb-safe">
          <div className="max-w-2xl w-full">
            <div className="text-center mb-8">
              <h1 className="text-3xl sm:text-5xl font-bold text-gray-900 mb-4">📋 Roster Builder</h1>
              <p className="text-base sm:text-xl text-gray-600">
                Intelligent roster generation and management
              </p>
            </div>
            
            <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-2xl p-6 sm:p-8 border border-white/50">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6 text-center">Get Started</h2>
              
              <div className="space-y-4">
                {permissions.canImport && (
                  <>
                    <button
                      onClick={() => setShowDrawer(true)}
                      className="w-full px-6 sm:px-8 py-5 sm:py-6 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-bold text-base sm:text-lg rounded-xl shadow-lg hover:shadow-xl hover:from-blue-600 hover:to-blue-700 active:scale-[0.98] transition-all flex items-center justify-center gap-3 touch-manipulation"
                    >
                      <span className="text-2xl">📥</span>
                      <span>Import Roster Data</span>
                    </button>

                    <div className="text-center text-sm text-gray-500">
                      Paste YAML or upload a file to begin
                    </div>
                  </>
                )}

                {auth?.mode === 'production' && auth.user && (
                  <button
                    onClick={() => setShowAdmin(true)}
                    className="w-full rounded-xl border border-gray-300 px-6 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 touch-manipulation"
                  >
                    ⚙ Create or manage a roster
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* YAML Drawer (import) — owner-only in production */}
        {permissions.canImport && (
          <YamlDrawer
            open={showDrawer}
            onClose={() => setShowDrawer(false)}
            data={null}
            onReplace={replaceData}
            onImport={handleImport}
          />
        )}

        {/* Owner admin panel (production) */}
        <AdminModal open={showAdmin} onClose={() => setShowAdmin(false)} roster={roster} />
      </>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white/40 backdrop-blur-md shadow-lg border-b border-white/30 pt-safe">
        <div className="max-w-full px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Roster Builder</h1>
              {rosterPeriod && rosterPeriod.start_date && rosterPeriod.end_date && (
                <div className="text-xs sm:text-sm font-medium text-gray-700 bg-blue-100/60 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-blue-200/30 w-fit">
                  {formatDateRange(rosterPeriod.start_date, rosterPeriod.end_date)}
                </div>
              )}
            </div>
            {auth?.mode === 'production' && auth.user && (
              <div className="flex items-center gap-2 text-xs text-gray-600">
                {rosters.length > 1 && (
                  <select
                    value={activeRosterId || ''}
                    onChange={(e) => selectRoster(e.target.value)}
                    className="max-w-[160px] rounded-md border border-gray-300 px-2 py-1 font-medium text-gray-700 touch-manipulation"
                    title="Switch roster"
                  >
                    {rosters.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                )}
                {role === 'owner' && (
                  <button
                    onClick={() => setShowAdmin(true)}
                    className="rounded-md border border-gray-300 px-2 py-1 font-medium text-gray-600 hover:bg-gray-100 touch-manipulation"
                    title="Manage roster & members"
                  >
                    ⚙ Manage
                  </button>
                )}
                <span className="max-w-[180px] truncate">{auth.user.email}</span>
                <button
                  onClick={auth.signOut}
                  className="rounded-md border border-gray-300 px-2 py-1 font-medium text-gray-600 hover:bg-gray-100 touch-manipulation"
                >
                  Sign out
                </button>
              </div>
            )}
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

      {/* Mobile tab switcher (hidden on lg where both panels show side-by-side) */}
      <div className="lg:hidden sticky top-0 z-30 flex bg-white/70 backdrop-blur-md border-b border-gray-200">
        <button
          onClick={() => setActiveTab('members')}
          className={`flex-1 py-3 text-sm font-semibold transition-colors touch-manipulation ${activeTab === 'members' ? 'text-blue-600 border-b-2 border-blue-500' : 'text-gray-500'}`}
        >
          Members <span className="text-xs font-normal">({activeMembers.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('events')}
          className={`flex-1 py-3 text-sm font-semibold transition-colors touch-manipulation ${activeTab === 'events' ? 'text-blue-600 border-b-2 border-blue-500' : 'text-gray-500'}`}
        >
          Events <span className="text-xs font-normal">({events.length})</span>
        </button>
      </div>

      {/* Split View Container */}
      <div className="flex flex-col lg:flex-row pb-24 lg:pb-safe">
        {/* Members Section */}
        <div className={`${activeTab === 'members' ? 'block' : 'hidden'} lg:block w-full lg:w-5/12 lg:border-r border-gray-200 pb-4 lg:pb-0`}>
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
        <div className={`${activeTab === 'events' ? 'block' : 'hidden'} lg:block w-full lg:w-7/12`}>
          <EventsView 
            events={events}
            members={members}
            memberConstraints={memberConstraints}
            roleColorMap={roleColorMap}
            roles={roles}
            searchQuery={searchQuery}
            validationResults={validationResults}
            onEditRosterSlot={permissions.canEditRoster ? handleEditRosterSlot : undefined}
            onSwapRosterSlots={permissions.canEditRoster ? handleSwapRosterSlots : undefined}
            onAddRosterSlot={permissions.canEditRoster ? handleAddRosterSlot : undefined}
            onRemoveRosterSlot={permissions.canEditRoster ? handleRemoveRosterSlot : undefined}
            onClearGenerated={permissions.canEditRoster ? handleClearGenerated : undefined}
            yamlData={data}
          />
        </div>
      </div>

      {/* Floating action buttons */}
      {!showDrawer && (
        <div className="fixed right-4 z-40 flex flex-col items-end gap-2 bottom-safe sm:right-6">
          {hasUnassignedRoles && permissions.canEditRoster && (
            <button
              onClick={handleGenerateRoster}
              className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white/80 backdrop-blur-md border border-gray-300/50 text-2xl text-gray-700 shadow-lg hover:bg-white active:scale-95 transition-all touch-manipulation"
              title="Generate roster"
            >
              ✨
              {unassignedRolesCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-gray-700 px-1 text-xs font-bold text-white shadow">
                  {unassignedRolesCount}
                </span>
              )}
            </button>
          )}
          {canUndo && permissions.canUndo && (
            <button
              onClick={handleUndo}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white/80 backdrop-blur-md border border-gray-300/50 text-lg text-gray-700 shadow-lg hover:bg-white active:scale-95 transition-all touch-manipulation"
              title="Undo last action"
            >
              ↶
            </button>
          )}
          {permissions.canImport && (
            <button
              onClick={() => setShowDrawer(true)}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white/80 backdrop-blur-md border border-gray-300/50 text-lg shadow-lg hover:bg-white active:scale-95 transition-all touch-manipulation"
              title="View & edit YAML"
            >
              📄
            </button>
          )}
        </div>
      )}

      {/* Two-way YAML editor drawer — owner-only in production */}
      {permissions.canImport && (
        <YamlDrawer
          open={showDrawer}
          onClose={() => setShowDrawer(false)}
          data={data}
          onReplace={replaceData}
          onImport={handleImport}
        />
      )}

      {/* Owner admin panel (production) */}
      <AdminModal open={showAdmin} onClose={() => setShowAdmin(false)} roster={roster} />

      {/* Invalid-swap toast */}
      {swapNotice && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 shadow-lg">
          {swapNotice}
        </div>
      )}
      {/* Swap confirmation (drag-and-drop rewrites two slots — loss-ful) */}
      {pendingSwap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setPendingSwap(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <p className="text-base font-semibold text-gray-900">{pendingSwap.prompt}</p>
            <p className="mt-1 text-sm text-gray-600">{pendingSwap.message}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingSwap(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 touch-manipulation"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSwap}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 touch-manipulation"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Role-slot removal confirmation (removes an entire role requirement) */}
      {pendingRemoveSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setPendingRemoveSlot(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <p className="text-base font-semibold text-gray-900">{pendingRemoveSlot.prompt}</p>
            <p className="mt-1 text-sm text-gray-600">{pendingRemoveSlot.message}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingRemoveSlot(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 touch-manipulation"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRemoveSlot}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 touch-manipulation"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Clear-generated confirmation (removes all auto-generated assignments) */}
      {pendingClearGenerated && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setPendingClearGenerated(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <p className="text-base font-semibold text-gray-900">{pendingClearGenerated.prompt}</p>
            <p className="mt-1 text-sm text-gray-600">{pendingClearGenerated.message}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingClearGenerated(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 touch-manipulation"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmClearGenerated}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 touch-manipulation"
              >
                Remove
              </button>
            </div>
          </div>
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
    </div>
  )
}

export default App
