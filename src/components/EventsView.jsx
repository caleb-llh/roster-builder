import { useState, useEffect, useRef } from 'react'
import { getAvailableMembersForEvent } from '../utils/constraintsUtils'
import { getCardColorForDay, formatDate } from '../utils/colorUtils'
import { exportToYAML, downloadYAML } from '../utils/dataExport'
import RosterSlotPill from './RosterSlotPill'
import { understudySlotRole, isUnderstudyRole, baseRoleOf } from '../utils/understudy'

/**
 * Copy text to the clipboard, returning true on success.
 *
 * Uses the async Clipboard API when available (HTTPS / localhost), and falls
 * back to a hidden <textarea> + execCommand('copy') otherwise (e.g. insecure
 * origins, older browsers, or when the async write is blocked/rejected).
 */
async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to the legacy path
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.top = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}

export default function EventsView({ events, members, memberConstraints, roleColorMap, searchQuery, validationResults, roles, onEditRosterSlot, onSwapRosterSlots, onAddRosterSlot, onRemoveRosterSlot, onClearGenerated, yamlData, rosterDiff }) {
  const [expandedEvent, setExpandedEvent] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [addRoleFor, setAddRoleFor] = useState(null) // event.date whose add-role picker is open
  const [overlayEventKey, setOverlayEventKey] = useState(null) // card with an open slot picker/confirm (lifts its z-index)
  const menuRef = useRef(null)
  const addRoleRef = useRef(null)

  useEffect(() => {
    if (!addRoleFor) return
    const onDocClick = (e) => {
      if (addRoleRef.current && !addRoleRef.current.contains(e.target)) setAddRoleFor(null)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [addRoleFor])

  useEffect(() => {
    if (!menuOpen) return
    const onDocClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [menuOpen])

  // Floating month selector (cards view): track which month is in view and
  // auto-scroll the active chip into view within the selector bar.
  const [activeMonthKey, setActiveMonthKey] = useState(null)
  const monthRefs = useRef({})   // monthKey -> section element
  const chipRefs = useRef({})    // monthKey -> chip button element
  const selectorRef = useRef(null)

  const scrollToMonth = (key) => {
    setActiveMonthKey(key)
    monthRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  
  // Helper to get member display name from member_id
  const getMemberDisplay = (memberId) => {
    if (!memberId) return 'Unassigned'
    const member = members.find(m => m.id === memberId)
    if (!member) return memberId
    return member.telegram ? `${member.name} - ${member.telegram}` : member.name
  }

  // Short (name-only) label for the uncommitted-change tooltip.
  const getMemberName = (memberId) => {
    if (!memberId) return null
    return members.find(m => m.id === memberId)?.name || memberId
  }

  // Map each changed slot (date#roleIndex → change record) so a slot can show
  // its own before→after tooltip on the diff dot.
  const slotChangeByKey = {}
  ;(rosterDiff?.slotChanges || []).forEach(c => {
    slotChangeByKey[`${c.date}#${c.roleIndex}`] = c
  })
  const diffChangeFor = (date, roleIndex) => {
    const c = slotChangeByKey[`${date}#${roleIndex}`]
    if (!c) return undefined
    return {
      status: c.status,
      role: c.role,
      beforeLabel: getMemberName(c.before),
      afterLabel: getMemberName(c.after),
    }
  }

  // Group events by month only
  const eventsByMonth = (events || []).reduce((acc, event) => {
    const date = new Date(event.date)
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    
    if (!acc[monthKey]) {
      acc[monthKey] = {
        monthName: date.toLocaleString('default', { month: 'long', year: 'numeric' }),
        events: []
      }
    }
    
    acc[monthKey].events.push(event)
    return acc
  }, {})

  const sortedMonths = Object.entries(eventsByMonth)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, data]) => ({
      key,
      ...data,
      events: data.events.sort((a, b) => new Date(a.date) - new Date(b.date))
    }))

  // Filter events by search query
  const searchLower = (searchQuery || '').toLowerCase()
  const filteredMonths = sortedMonths
    .map(month => ({
      ...month,
      events: month.events.filter(event => 
        !searchQuery || 
        event.name.toLowerCase().includes(searchLower) ||
        event.day_of_week.toLowerCase().includes(searchLower) ||
        event.reminder?.toLowerCase().includes(searchLower) ||
        event.roster?.some(r => r.role.toLowerCase().includes(searchLower) || r.member_id?.toLowerCase().includes(searchLower))
      )
    }))
    .filter(month => month.events.length > 0)

  const monthKeysSignature = filteredMonths.map(m => m.key).join(',')

  // Observe month sections to highlight the one currently in view. On each
  // change we recompute from *all* section positions (not just the entries in
  // the callback) and pick the section whose top is closest to a line ~15%
  // down the viewport. This avoids the stale-highlight lag that happened when
  // relying on which entry happened to fire.
  useEffect(() => {
    const sections = filteredMonths
      .map(m => monthRefs.current[m.key])
      .filter(Boolean)
    if (sections.length === 0) return

    const pickActive = () => {
      const line = window.innerHeight * 0.15
      let best = null
      let bestDist = Infinity
      sections.forEach(section => {
        const top = section.getBoundingClientRect().top
        // Prefer the last section whose top has passed the line; fall back to
        // the closest one when none has (e.g. scrolled to the very top).
        const dist = top <= line ? line - top : (top - line) + 100000
        if (dist < bestDist) {
          bestDist = dist
          best = section
        }
      })
      if (best) setActiveMonthKey(best.dataset.monthKey)
    }

    const observer = new IntersectionObserver(pickActive, { threshold: [0, 0.25, 0.5, 0.75, 1] })
    sections.forEach(s => observer.observe(s))

    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      window.requestAnimationFrame(() => {
        pickActive()
        ticking = false
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    pickActive()

    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', onScroll)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKeysSignature])

  // Keep the active chip scrolled into view within the selector bar.
  useEffect(() => {
    if (!activeMonthKey) return
    chipRefs.current[activeMonthKey]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [activeMonthKey])

  // Calculate total validation issues
  const totalErrors = Object.values(validationResults || {}).reduce((sum, v) => sum + v.errors.length, 0)
  const totalWarnings = Object.values(validationResults || {}).reduce((sum, v) => sum + v.warnings.length, 0)

  // Use roles from builder config (already ordered)
  const allRoles = roles || []

  // Column layout for tabular exports (CSV / clipboard). An event may contain
  // the same role more than once (e.g. two "roving-cam" slots), so we widen to
  // the MAX count of each role across all events. Columns are ordered by the
  // base catalog with each base role's understudy column ("X-understudy")
  // inserted right after it; duplicate columns get a numbered label
  // ("roving-cam 2"). Returns { columns: [{role,label}], maxCount: {role:n} }.
  const exportColumnLayout = (() => {
    const maxCount = {}
    ;(events || []).forEach(e => {
      const perEvent = {}
      e.roster?.forEach(s => { if (s.role) perEvent[s.role] = (perEvent[s.role] || 0) + 1 })
      Object.entries(perEvent).forEach(([role, n]) => {
        if (n > (maxCount[role] || 0)) maxCount[role] = n
      })
    })

    const columns = []
    const pushRole = (role) => {
      const n = maxCount[role] || 0
      for (let i = 0; i < n; i++) {
        columns.push({ role, index: i, label: i === 0 ? role : `${role} ${i + 1}` })
      }
    }
    // All REAL roles first (in catalog order), then all UNDERSTUDY columns
    // after them, so the sequence is: real roles..., then X-understudy columns.
    allRoles.forEach(role => pushRole(role))
    allRoles.forEach(role => pushRole(understudySlotRole(role)))
    // Roles present in data but not derived from a base catalog role: append
    // real ones with the real block and understudy ones at the very end.
    Object.keys(maxCount).forEach(role => {
      if (columns.some(c => c.role === role)) return
      if (!isUnderstudyRole(role)) pushRole(role)
    })
    Object.keys(maxCount).forEach(role => {
      if (columns.some(c => c.role === role)) return
      if (isUnderstudyRole(role)) pushRole(role)
    })
    return { columns, maxCount }
  })()
  const exportColumns = exportColumnLayout.columns

  // Whether any slot carries the auto-generated tag (enables "Remove generated").
  const hasGenerated = (events || []).some(e => e.roster?.some(s => s.isGenerated))

  // Roles offered by the "+ Role" picker: every base role plus its understudy
  // variant (understudy slots follow the "X-understudy" suffix convention and
  // aren't part of the base catalog).
  const addableRoleOptions = allRoles.flatMap(role => [role, understudySlotRole(role)])

  // Color class for a role tag; understudy slots reuse their base role's color
  // since they aren't in the base color map.
  const roleColor = (role) =>
    roleColorMap[role] || (isUnderstudyRole(role) ? roleColorMap[baseRoleOf(role)] : undefined) || ''

  // Generate export data with roles as columns
  const generateExportData = () => {
    const rows = []
    
    filteredMonths.forEach(month => {
      month.events.forEach(event => {
        const validation = validationResults?.[event.date] || { errors: [], warnings: [] }
        const errorSummary = validation.errors.length > 0 ? validation.errors.join('; ') : ''
        const warningSummary = validation.warnings.length > 0 ? validation.warnings.join('; ') : ''
        
        // Group this event's assignments by role so duplicate roles (e.g. two
        // "roving-cam" slots) can be placed into their own columns positionally.
        const byRole = {}
        if (event.roster) {
          event.roster.forEach(assignment => {
            ;(byRole[assignment.role] = byRole[assignment.role] || []).push(assignment.member_id)
          })
        }

        // Build row: metadata (date, day, reporting time, name), then one cell
        // per export column (real roles first, then understudy columns).
        const row = [
          event.date,
          event.day_of_week,
          event.reporting_time,
          event.name,
          ...exportColumns.map(col => {
            const memberId = byRole[col.role]?.[col.index]
            return memberId !== undefined && memberId !== null ? getMemberDisplay(memberId) : '-'
          }),
          errorSummary,
          warningSummary
        ]
        rows.push(row)
      })
    })
    
    return rows
  }

  // Export to CSV
  const exportToCSV = () => {
    const header = ['Date', 'Day', 'Reporting Time', 'Event Name', ...exportColumns.map(c => c.label), 'Errors', 'Warnings']
    const data = generateExportData()
    const csvRows = [
      header.join(','),
      ...data.map(row => row.map(cell => `"${cell}"`).join(','))
    ]
    
    const csvContent = csvRows.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `roster_events_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Copy to clipboard in tab-separated format
  const copyToClipboard = async () => {
    const header = ['Date', 'Day', 'Reporting Time', 'Event Name', ...exportColumns.map(c => c.label), 'Errors', 'Warnings']
    const data = generateExportData()
    const tsvContent = [
      header.join('\t'),
      ...data.map(row => row.join('\t'))
    ].join('\n')

    const ok = await copyText(tsvContent)
    if (ok) {
      alert('Table copied to clipboard! You can now paste it into Excel or Google Sheets.')
    } else {
      alert('Failed to copy to clipboard. Please try again.')
    }
  }

  // Export to YAML
  const exportYAML = () => {
    try {
      const yamlString = exportToYAML(yamlData)
      const filename = `roster_${new Date().toISOString().split('T')[0]}.yaml`
      downloadYAML(yamlString, filename)
    } catch (err) {
      alert(`Failed to export YAML: ${err.message}`)
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 sm:mb-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Events</h2>

          {/* Actions menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="flex items-center justify-center rounded-lg px-2 py-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 active:bg-gray-200 touch-manipulation min-h-[44px] min-w-[44px]"
              title="View & export options"
              aria-haspopup="true"
              aria-expanded={menuOpen}
            >
              <span className="text-xl leading-none">⋮</span>
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                {onClearGenerated && (
                  <>
                    <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Roster</div>
                    <button
                      onClick={() => { onClearGenerated(); setMenuOpen(false) }}
                      disabled={!hasGenerated}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${hasGenerated ? 'text-red-700 hover:bg-red-50' : 'cursor-default text-gray-300'}`}
                      title={hasGenerated ? 'Remove all auto-generated assignments' : 'No generated assignments'}
                    >
                      🧹 Remove generated
                    </button>
                    <div className="my-1 border-t border-gray-100" />
                  </>
                )}

                <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Export</div>
                <button
                  onClick={() => { copyToClipboard(); setMenuOpen(false) }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-blue-50"
                >
                  📋 Copy to Excel
                </button>
                <button
                  onClick={() => { exportToCSV(); setMenuOpen(false) }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-blue-50"
                >
                  💾 Export CSV
                </button>
                <button
                  onClick={() => { exportYAML(); setMenuOpen(false) }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-blue-50"
                >
                  📄 Export YAML
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Validation Summary */}
      {(totalErrors > 0 || totalWarnings > 0) && (
        <div className="mb-6 bg-white/60 backdrop-blur-md rounded-lg shadow-lg border border-white/30 p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-2">Assignment Validation Summary</h3>
          <div className="flex gap-4">
            {totalErrors > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="px-3 py-1 bg-red-100 text-red-800 font-semibold rounded border border-red-300">
                  ❌ {totalErrors} Error{totalErrors > 1 ? 's' : ''}
                </span>
                <span className="text-gray-600">Constraint violations detected</span>
              </div>
            )}
            {totalWarnings > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="px-3 py-1 bg-yellow-100 text-yellow-800 font-semibold rounded border border-yellow-300">
                  ⚠️ {totalWarnings} Warning{totalWarnings > 1 ? 's' : ''}
                </span>
                <span className="text-gray-600">Preference violations detected</span>
              </div>
            )}
          </div>
        </div>
      )}
        
      {/* Card View */}
      <div className="space-y-8">
          {filteredMonths.map((month, monthIdx) => (
            <div
              key={monthIdx}
              data-month-key={month.key}
              ref={el => { monthRefs.current[month.key] = el }}
              className="scroll-mt-16"
            >
              <h3 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-gray-400">
                {month.monthName}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {month.events.map((event, eventIdx) => {
                const eventKey = `${monthIdx}-${eventIdx}`
                const isExpanded = expandedEvent === eventKey
                const availabilityData = getAvailableMembersForEvent(event, members, memberConstraints, events)
                
                // Get validation results for this event
                const validation = validationResults?.[event.date] || { errors: [], warnings: [] }
                const hasErrors = validation.errors.length > 0
                const hasWarnings = validation.warnings.length > 0
                
                // Get day of week (0 = Sunday, 6 = Saturday) and corresponding color
                const eventDate = new Date(event.date)
                const dayOfWeek = eventDate.getDay()
                const cardBgClass = getCardColorForDay(dayOfWeek)
                
                return (
                <div key={eventIdx} className={`relative ${overlayEventKey === eventKey || addRoleFor === event.date ? 'z-40' : ''} ${cardBgClass} backdrop-blur-md rounded-lg shadow-lg border border-white/30 p-3 transition-all ${hasErrors ? 'ring-2 ring-red-500' : hasWarnings ? 'ring-2 ring-yellow-500' : ''}`}>
                  <div className="mb-3">
                    <div className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
                      {formatDate(event.date)}
                      <span className="mx-1 px-2 py-0.5 bg-blue-100/60 text-blue-800 text-xs rounded">
                          {event.day_of_week}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-gray-700">{event.name}</span>
                    </div>
                    <div className="py-0.5">
                      <span className="text-xs text-gray-500">
                        Reporting time: {event.reporting_time}
                      </span>
                    </div>
                  </div>
                  
                  {(event.roster?.length > 0 || onAddRosterSlot) && (
                    <div className="mb-2">
                      <div className="text-xs font-semibold text-gray-700 mb-1">Roster:</div>
                      <div className="flex flex-col gap-1.5">
                        {(event.roster || []).map((assignment, idx) => {
                          // Members already assigned in this event (exclude from
                          // candidates so inserts respect one-slot-per-event).
                          const assignedInEvent = new Set(
                            event.roster
                              .filter((r, i) => i !== idx && r.member_id)
                              .map(r => r.member_id)
                          )
                          const roleAvailability = (availabilityData[assignment.role] || [])
                            .filter(m => !assignedInEvent.has(m.id))

                          return (
                            <RosterSlotPill
                              key={idx}
                              slot={{ eventDate: event.date, roleIndex: idx }}
                              role={assignment.role}
                              roleColorClass={roleColor(assignment.role)}
                              memberId={assignment.member_id}
                              memberLabel={getMemberDisplay(assignment.member_id)}
                              isGenerated={assignment.isGenerated}
                              diffChange={rosterDiff ? diffChangeFor(event.date, idx) : undefined}
                              availableMembers={roleAvailability}
                              onSelect={onEditRosterSlot ? (memberId) => onEditRosterSlot(event.date, idx, memberId) : undefined}
                              onRemove={onEditRosterSlot ? () => onEditRosterSlot(event.date, idx, null) : undefined}
                              onRemoveSlot={onRemoveRosterSlot ? () => onRemoveRosterSlot(event.date, idx) : undefined}
                              onSwap={onSwapRosterSlots}
                              onOpenChange={(isOpen) => setOverlayEventKey(prev => isOpen ? eventKey : (prev === eventKey ? null : prev))}
                            />
                          )
                        })}

                        {/* Add-role control */}
                        {onAddRosterSlot && (() => {
                          const usedRoles = new Set((event.roster || []).map(r => r.role))
                          const addableRoles = addableRoleOptions.filter(r => !usedRoles.has(r))
                          const isOpen = addRoleFor === event.date
                          return (
                            <div className="relative inline-flex" ref={isOpen ? addRoleRef : undefined}>
                              <button
                                type="button"
                                onClick={() => setAddRoleFor(isOpen ? null : event.date)}
                                disabled={addableRoles.length === 0}
                                className={`inline-flex w-fit items-center rounded-full border border-dashed px-2 py-0.5 text-xs transition-colors touch-manipulation ${addableRoles.length === 0 ? 'cursor-default border-gray-300 text-gray-300' : 'border-gray-400 bg-white/40 text-gray-500 hover:border-blue-400 hover:text-blue-600'}`}
                                title={addableRoles.length === 0 ? 'All roles already added' : 'Add a role to this event'}
                              >
                                + Role
                              </button>
                              {isOpen && addableRoles.length > 0 && (
                                <div className="absolute left-0 top-full z-20 mt-1 max-h-52 w-44 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                                  {addableRoles.map(role => (
                                    <button
                                      key={role}
                                      type="button"
                                      onClick={() => { onAddRosterSlot(event.date, role); setAddRoleFor(null) }}
                                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-blue-50"
                                    >
                                      <span className={`px-1.5 py-0.5 rounded font-medium ${roleColor(role)}`}>{role}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                  )}
                  
                  {/* Availability Details Dropdown */}
                  <div className="mt-2 pt-2 border-t border-gray-200">
                    <button
                      onClick={() => setExpandedEvent(isExpanded ? null : eventKey)}
                      className="text-xs text-gray-600 hover:text-gray-800 font-medium flex items-center gap-1 w-full"
                    >
                      {isExpanded ? '▼' : '▶'} Availability Details
                    </button>
                    {isExpanded && (
                      <div className="mt-2 pt-2 border-t border-gray-200 space-y-2">
                        {Object.entries(availabilityData).map(([role, memberList]) => (
                          <div key={role} className="text-xs">
                            <div className={`font-semibold mb-1 px-1.5 py-0.5 rounded inline-block ${roleColorMap[role]}`}>
                              {role}
                            </div>
                            <div className="ml-2 space-y-0.5">
                              {memberList.length === 0 ? (
                                <div className="text-gray-500 italic">No qualified members</div>
                              ) : (
                                memberList.map(member => (
                                  <div 
                                    key={member.id} 
                                    className={`flex items-center gap-1 ${
                                      member.available 
                                        ? 'text-green-700' 
                                        : 'text-red-600 line-through'
                                    }`}
                                  >
                                    <span>{member.available ? '✓' : '✗'}</span>
                                    <span>{member.name}</span>
                                    {member.assigned && (
                                      <span className="ml-auto text-blue-600 font-semibold">★</span>
                                    )}
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {/* Validation Messages */}
                  {(hasErrors || hasWarnings) && (
                    <div className="mt-2 pt-2 border-t border-gray-300 space-y-1">
                      {validation.errors.map((error, idx) => (
                        <div key={`error-${idx}`} className="text-xs text-red-700 bg-red-50/80 px-2 py-1.5 rounded border border-red-200/60">
                          <span className="font-semibold">❌ Error:</span> {error}
                        </div>
                      ))}
                      {validation.warnings.map((warning, idx) => (
                        <div key={`warning-${idx}`} className="text-xs text-yellow-800 bg-yellow-50/80 px-2 py-1.5 rounded border border-yellow-200/60">
                          <span className="font-semibold">⚠️ Warning:</span> {warning}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {event.reminder && (
                    <div className="mt-2 text-xs text-blue-700 bg-blue-50/60 px-2 py-1.5 rounded border border-blue-200/40">
                      ℹ️ {event.reminder}
                    </div>
                  )}
                </div>
              )})}
            </div>
          </div>
        ))}
        </div>

      {filteredMonths.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          {searchQuery ? 'No events match your search' : 'No events scheduled'}
        </div>
      )}

      {/* Floating month selector (2+ months) */}
      {filteredMonths.length > 1 && (
        <div className="pointer-events-none fixed inset-x-0 z-30 flex justify-center px-4 bottom-safe">
          <div
            ref={selectorRef}
            className="pointer-events-auto flex max-w-[calc(100%-5rem)] gap-1 overflow-x-auto rounded-full border border-gray-200 bg-white/90 p-1 shadow-lg backdrop-blur-md [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {filteredMonths.map(month => {
              const isActive = month.key === activeMonthKey
              return (
                <button
                  key={month.key}
                  ref={el => { chipRefs.current[month.key] = el }}
                  onClick={() => scrollToMonth(month.key)}
                  className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors touch-manipulation ${isActive ? 'bg-gray-700 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  {month.monthName}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
