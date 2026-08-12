import { useState, useEffect } from 'react'
import { createRoleColorMap, formatDateRange, formatDate } from './utils/colorUtils'
import { calculateRosterStats } from './utils/rosterStats'
import { validateEventAssignments } from './utils/assignmentValidator'
import { generateRoster } from './utils/rosterGenerator'
import { getDerivedState } from './utils/derivedState'
import { computeRosterDiff } from './utils/rosterDiff'
import { useRosterData } from './hooks/useRosterData'
import { canSwapRosterSlots } from './utils/constraintsUtils'
import { getActiveConstraints, getActivePreferences, getConstraintDescription, getPreferenceDescription, MEMBER_PREF_FIELDS } from './schema/rosterSchema'
import { ErrorDisplay, GlassFab } from './components/SharedComponents'
import MembersView from './components/MembersView'
import EventsView from './components/EventsView'
import RosterStatsPanel from './components/RosterStatsPanel'
import AlgorithmDescriptionModal from './components/AlgorithmDescriptionModal'
import GenerationResultModal from './components/GenerationResultModal'
import ChangeReviewPanel from './components/ChangeReviewPanel'
import YamlDrawer from './components/YamlDrawer'
import AdminModal from './components/AdminModal'
import { headingPage, headingModal, glassModal, glassCard, modalBackdrop, btnDanger, btnPrimary, tabActive, tabInactive, monoChip, semanticError, glassPanel, tierSection } from './utils/statsTheme'

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
  const [showChanges, setShowChanges] = useState(false) // expand the uncommitted-changes review list
  const [pendingRemoveSlot, setPendingRemoveSlot] = useState(null) // { nextEvents, prompt, message } awaiting confirmation
  const [pendingClearGenerated, setPendingClearGenerated] = useState(null) // { nextEvents, count, prompt, message } awaiting confirmation

  // Custom hook for all data management (consolidated state)
  const roster = useRosterData()
  const { 
    data, 
    error, 
    loading, 
    canUndo,
    canRedo,
    hasUncommitted,
    effectiveEvents,
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
    undo,
    redo,
    commitDraft,
    discardDraft,
    setError 
  } = roster

  // The document the UI renders from: committed data with the uncommitted draft
  // events overlaid (effectiveEvents === draftEvents ?? data.events). All
  // derived state and validation run against this, so pending edits are visible
  // everywhere before they are saved.
  const effectiveData = data ? { ...data, events: effectiveEvents } : data

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
  } = getDerivedState(effectiveData)

  // Committed (last-saved) events, for diffing against the draft.
  const committedEvents = getDerivedState(data).events
  const rosterDiff = computeRosterDiff(committedEvents, events)
  // Name-only label for the change-review list (diff stores member_id).
  const getMemberName = (memberId) => memberId ? (members.find(m => m.id === memberId)?.name || memberId) : null

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

  // Undo / redo. These navigate the draft history and NEVER touch committed
  // state (committing is a separate concern — see the draft/commit spec).
  const handleUndo = () => {
    if (undo()) setGenerationResult(null)
  }
  const handleRedo = () => {
    if (redo()) setGenerationResult(null)
  }

  // Save the uncommitted draft (the "binding" update) / discard it.
  const handleCommitDraft = async () => {
    const result = await commitDraft()
    if (result.ok) {
      setShowChanges(false)
    } else {
      setError({ type: 'save', message: result.errors.join('; ') })
    }
  }
  const handleDiscardDraft = () => {
    discardDraft()
    setShowChanges(false)
    setGenerationResult(null)
  }

  // Keyboard shortcuts: Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z (or Ctrl+Y) redo.
  // Ignored while typing in a field so we don't hijack the browser's text undo.
  useEffect(() => {
    if (!permissions.canUndo) return
    const isTextTarget = (el) => {
      if (!el) return false
      const tag = el.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable || el.closest?.('.cm-editor')
    }
    const onKeyDown = (e) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod || isTextTarget(e.target)) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault()
        handleRedo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [permissions.canUndo, undo, redo])

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

    // updateEvents records the pre-mutation snapshot for undo automatically.
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
    // confirmation instead of applying immediately. The payload carries the
    // two slots' before/after occupants so the dialog can render a structured
    // before→after card rather than a prose sentence.
    setPendingSwap({
      nextEvents,
      message,
      isMove: !(memberA && memberB),
      slotA: { date: eventA.date, role: slotA.role, before: nameOf(memberA), after: nameOf(memberB) },
      slotB: { date: eventB.date, role: slotB.role, before: nameOf(memberB), after: nameOf(memberA) },
    })
  }

  // Apply the staged swap after the user confirms.
  const confirmSwap = () => {
    if (!pendingSwap) return
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

  if (loading) return <div className="min-h-screen bg-white/40 flex items-center justify-center"><div className="text-gray-600">Loading...</div></div>
  if (error) return <ErrorDisplay title={error.type === 'validation' ? 'Validation Errors' : 'Loading Error'} message={error.message} hint={error.type === 'load' ? 'Check YAML file syntax. Telegram handles need quotes.' : undefined} />

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className={`${glassPanel} border-b pt-safe`}>
        <div className="max-w-full px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <h1 className={headingPage}>Roster Builder</h1>
              {rosterPeriod && rosterPeriod.start_date && rosterPeriod.end_date && (
                <div className={`text-xs sm:text-sm font-medium px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg w-fit ${monoChip}`}>
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
                    Manage
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
                className={`w-full px-3 sm:px-4 py-2 pr-10 text-sm sm:text-base ${glassPanel} focus:ring-2 focus:ring-gray-400/50 focus:border-transparent placeholder-gray-600 touch-manipulation`}
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

      {/* Uncommitted-changes bar: draft edits are visible in the roster but not
          yet saved to the binding. Shows what changed + who is affected, with
          Save / Discard. Undo/redo are independent of this (see spec). */}
      {hasUncommitted && permissions.canEditRoster && (
        <div className="sticky top-0 z-40 border-b border-amber-300 bg-amber-50/95 backdrop-blur-md">
          <div className="max-w-full px-3 sm:px-6 lg:px-8 py-2 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <div className="flex-1 min-w-0 text-sm text-amber-900">
              <button
                type="button"
                onClick={() => setShowChanges(v => !v)}
                className="inline-flex items-center gap-1 font-semibold hover:text-amber-700"
                aria-expanded={showChanges}
                title={showChanges ? 'Hide changes' : 'Review changes'}
              >
                <span className={`inline-block transition-transform ${showChanges ? 'rotate-90' : ''}`}>▸</span>
                {rosterDiff.slotChanges.length} unsaved change{rosterDiff.slotChanges.length === 1 ? '' : 's'}
              </button>
              {(rosterDiff.affectedMemberIds.added.length > 0 || rosterDiff.affectedMemberIds.removed.length > 0) && (
                <span className="ml-2 text-amber-800">
                  {rosterDiff.affectedMemberIds.added.length > 0 && (
                    <span title="Newly on the roster">
                      +{rosterDiff.affectedMemberIds.added.map(id => members.find(m => m.id === id)?.name || id).join(', ')}
                    </span>
                  )}
                  {rosterDiff.affectedMemberIds.added.length > 0 && rosterDiff.affectedMemberIds.removed.length > 0 && ' · '}
                  {rosterDiff.affectedMemberIds.removed.length > 0 && (
                    <span title="No longer on the roster">
                      −{rosterDiff.affectedMemberIds.removed.map(id => members.find(m => m.id === id)?.name || id).join(', ')}
                    </span>
                  )}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleDiscardDraft}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100 active:scale-95 transition-all touch-manipulation"
              >
                Discard
              </button>
              <button
                onClick={handleCommitDraft}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-700 active:scale-95 transition-all touch-manipulation"
              >
                Save changes
              </button>
            </div>
          </div>
          {showChanges && (
            <ChangeReviewPanel slotChanges={rosterDiff.slotChanges} getMemberName={getMemberName} />
          )}
        </div>
      )}

      {/* Mobile tab switcher (hidden on lg where both panels show side-by-side) */}
      <div className="lg:hidden sticky top-0 z-30 flex bg-white/70 backdrop-blur-md border-b border-gray-200">
        <button
          onClick={() => setActiveTab('members')}
          className={`flex-1 py-3 text-sm font-semibold transition-colors touch-manipulation ${activeTab === 'members' ? tabActive : tabInactive}`}
        >
          Members <span className="text-xs font-normal">({activeMembers.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('events')}
          className={`flex-1 py-3 text-sm font-semibold transition-colors touch-manipulation ${activeTab === 'events' ? tabActive : tabInactive}`}
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
            rosterDiff={hasUncommitted ? rosterDiff : null}
          />
        </div>
      </div>

      {/* Floating action buttons */}
      {!showDrawer && (
        <div className="fixed right-4 z-40 flex flex-col items-end gap-2 bottom-safe sm:right-6">
          {hasUnassignedRoles && permissions.canEditRoster && (
            <GlassFab
              onClick={handleGenerateRoster}
              className="relative h-14 w-14 text-[11px] font-semibold uppercase tracking-wide"
              title="Generate roster"
            >
              Auto
              {unassignedRolesCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-gray-700 px-1 text-xs font-bold text-white shadow">
                  {unassignedRolesCount}
                </span>
              )}
            </GlassFab>
          )}
          {canUndo && permissions.canUndo && (
            <GlassFab
              onClick={handleUndo}
              className="h-12 w-12 text-lg"
              title="Undo (Ctrl/Cmd+Z)"
            >
              ↶
            </GlassFab>
          )}
          {canRedo && permissions.canUndo && (
            <GlassFab
              onClick={handleRedo}
              className="h-12 w-12 text-lg"
              title="Redo (Ctrl/Cmd+Shift+Z)"
            >
              ↷
            </GlassFab>
          )}
          {permissions.canImport && (
            <GlassFab
              onClick={() => setShowDrawer(true)}
              className="h-12 w-12 text-base font-mono"
              title="View & edit YAML"
            >
              {'{ }'}
            </GlassFab>
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
        <div className={`fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-2 text-sm shadow-lg ${semanticError}`}>
          {swapNotice}
        </div>
      )}
      {/* Swap confirmation (drag-and-drop rewrites two slots — loss-ful) */}
      {pendingSwap && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${modalBackdrop}`} onClick={() => setPendingSwap(null)}>
          <div className={`w-full max-w-sm p-4 sm:p-6 ${glassModal}`} onClick={e => e.stopPropagation()}>
            <h2 className={headingModal}>{pendingSwap.isMove ? 'Confirm move' : 'Confirm swap'}</h2>
            <div className="mt-4 space-y-2">
              {[pendingSwap.slotA, pendingSwap.slotB].map((slot, i) => (
                <div key={i} className={`flex items-center gap-3 rounded-lg p-2.5 ${glassCard}`}>
                  <div className="min-w-0 flex-1">
                    <div className={tierSection}>
                      {formatDate(slot.date)} · {slot.role}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-900">
                      <span className={slot.before === slot.after ? '' : 'text-gray-400 line-through'}>{slot.before}</span>
                      {slot.before !== slot.after && (
                        <>
                          <span className="text-gray-400">→</span>
                          <span className="font-semibold">{slot.after}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingSwap(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-500/10 touch-manipulation"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSwap}
                className={`px-4 py-2 text-sm ${btnPrimary} touch-manipulation`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Role-slot removal confirmation (removes an entire role requirement) */}
      {pendingRemoveSlot && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${modalBackdrop}`} onClick={() => setPendingRemoveSlot(null)}>
          <div className={`w-full max-w-sm p-5 ${glassModal}`} onClick={e => e.stopPropagation()}>
            <p className="text-base font-semibold text-gray-900">{pendingRemoveSlot.prompt}</p>
            <p className="mt-1 text-sm text-gray-600">{pendingRemoveSlot.message}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingRemoveSlot(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-500/10 touch-manipulation"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRemoveSlot}
                className={`px-4 py-2 text-sm ${btnDanger} touch-manipulation`}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Clear-generated confirmation (removes all auto-generated assignments) */}
      {pendingClearGenerated && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${modalBackdrop}`} onClick={() => setPendingClearGenerated(null)}>
          <div className={`w-full max-w-sm p-5 ${glassModal}`} onClick={e => e.stopPropagation()}>
            <p className="text-base font-semibold text-gray-900">{pendingClearGenerated.prompt}</p>
            <p className="mt-1 text-sm text-gray-600">{pendingClearGenerated.message}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingClearGenerated(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-500/10 touch-manipulation"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmClearGenerated}
                className={`px-4 py-2 text-sm ${btnDanger} touch-manipulation`}
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
