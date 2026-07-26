import { useState } from 'react'
import { getAvailableMembersForEvent } from '../utils/constraintsUtils'
import { getCardColorForDay, formatDate } from '../utils/colorUtils'
import { exportToYAML, downloadYAML } from '../utils/dataExport'
import { YAML_FIELDS } from '../schema/rosterSchema'
import RosterSlotPill from './RosterSlotPill'

export default function EventsView({ events, members, memberConstraints, roleColorMap, searchQuery, validationResults, roles, originalData, hasGenerated, onViewDiff, onEditRosterSlot, onSwapRosterSlots, yamlData }) {
  const [expandedEvent, setExpandedEvent] = useState(null)
  const [viewMode, setViewMode] = useState('cards') // 'cards' or 'table'
  
  // Helper to get member display name from member_id
  const getMemberDisplay = (memberId) => {
    if (!memberId) return 'Unassigned'
    const member = members.find(m => m.id === memberId)
    if (!member) return memberId
    return member.telegram ? `${member.name} - ${member.telegram}` : member.name
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

  // Calculate total validation issues
  const totalErrors = Object.values(validationResults || {}).reduce((sum, v) => sum + v.errors.length, 0)
  const totalWarnings = Object.values(validationResults || {}).reduce((sum, v) => sum + v.warnings.length, 0)

  // Use roles from builder config (already ordered)
  const allRoles = roles || []

  // Generate export data with roles as columns
  const generateExportData = () => {
    const rows = []
    
    filteredMonths.forEach(month => {
      month.events.forEach(event => {
        const validation = validationResults?.[event.date] || { errors: [], warnings: [] }
        const errorSummary = validation.errors.length > 0 ? validation.errors.join('; ') : ''
        const warningSummary = validation.warnings.length > 0 ? validation.warnings.join('; ') : ''
        
        // Create roster map for easy lookup
        const rosterMap = {}
        if (event.roster) {
          event.roster.forEach(assignment => {
            rosterMap[assignment.role] = getMemberDisplay(assignment.member_id)
          })
        }
        
        // Build row with each role as a column
        const row = [
          event.date,
          event.day_of_week,
          event.name,
          event.reporting_time,
          ...allRoles.map(role => rosterMap[role] || ''),
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
    const header = ['Date', 'Day', 'Event Name', 'Reporting Time', ...allRoles, 'Errors', 'Warnings']
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
    const header = ['Date', 'Day', 'Event Name', 'Reporting Time', ...allRoles, 'Errors', 'Warnings']
    const data = generateExportData()
    const tsvContent = [
      header.join('\t'),
      ...data.map(row => row.join('\t'))
    ].join('\n')
    
    try {
      await navigator.clipboard.writeText(tsvContent)
      alert('Table copied to clipboard! You can now paste it into Excel or Google Sheets.')
    } catch (err) {
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
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3 sm:mb-4">Events</h2>
        
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setViewMode('cards')}
            className={`px-3 sm:px-4 py-2 rounded-lg font-medium text-xs sm:text-sm transition-all touch-manipulation min-h-[44px] ${
              viewMode === 'cards'
                ? 'bg-blue-500 text-white shadow-lg'
                : 'bg-white/60 text-gray-700 hover:bg-white/80 active:bg-white border border-gray-200'
            }`}
          >
            📇 Cards
          </button>

          <button
            onClick={() => setViewMode('table')}
            className={`px-3 sm:px-4 py-2 rounded-lg font-medium text-xs sm:text-sm transition-all touch-manipulation min-h-[44px] ${
              viewMode === 'table'
                ? 'bg-blue-500 text-white shadow-lg'
                : 'bg-white/60 text-gray-700 hover:bg-white/80 active:bg-white border border-gray-200'
            }`}
          >
            📊 Table
          </button>

          {originalData && hasGenerated && (
            <button
              onClick={onViewDiff}
              className="px-3 sm:px-4 py-2 rounded-lg font-medium text-xs sm:text-sm bg-white/60 text-gray-700 hover:bg-white/80 active:bg-white border border-gray-200 shadow-md transition-all touch-manipulation min-h-[44px]"
              title="View changes between original and generated"
            >
              🔍 <span className="xs:inline">Diff</span>
            </button>
          )}
          
          <button
            onClick={copyToClipboard}
            className="px-3 sm:px-4 py-2 rounded-lg font-medium text-xs sm:text-sm bg-white/60 text-gray-700 hover:bg-white/80 active:bg-white border border-gray-200 shadow-md transition-all touch-manipulation min-h-[44px]"
            title="Copy to clipboard for pasting into Excel/Sheets"
          >
            📋 <span className="hidden xs:inline">Copy to </span>Excel
          </button>

          <button
            onClick={exportToCSV}
            className="px-3 sm:px-4 py-2 rounded-lg font-medium text-xs sm:text-sm bg-white/60 text-gray-700 hover:bg-white/80 active:bg-white border border-gray-200 shadow-md transition-all touch-manipulation min-h-[44px]"
            title="Download as CSV file"
          >
            💾 <span className="hidden xs:inline">Export </span>CSV
          </button>

          <button
            onClick={exportYAML}
            className="px-3 sm:px-4 py-2 rounded-lg font-medium text-xs sm:text-sm bg-white/60 text-gray-700 hover:bg-white/80 active:bg-white border border-gray-200 shadow-md transition-all touch-manipulation min-h-[44px]"
            title="Download as YAML file"
          >
            📄 <span className="hidden xs:inline">Export </span>YAML
          </button>

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
      {viewMode === 'cards' && (
        <div className="space-y-8">
          {filteredMonths.map((month, monthIdx) => (
            <div key={monthIdx}>
              <h3 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-gray-400">
                {month.monthName}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {month.events.map((event, eventIdx) => {
                const eventKey = `${monthIdx}-${eventIdx}`
                const isExpanded = expandedEvent === eventKey
                const availabilityData = getAvailableMembersForEvent(event, members, memberConstraints)
                
                // Get validation results for this event
                const validation = validationResults?.[event.date] || { errors: [], warnings: [] }
                const hasErrors = validation.errors.length > 0
                const hasWarnings = validation.warnings.length > 0
                
                // Get day of week (0 = Sunday, 6 = Saturday) and corresponding color
                const eventDate = new Date(event.date)
                const dayOfWeek = eventDate.getDay()
                const cardBgClass = getCardColorForDay(dayOfWeek)
                
                return (
                <div key={eventIdx} className={`${cardBgClass} backdrop-blur-md rounded-lg shadow-lg border border-white/30 p-3 transition-all ${hasErrors ? 'ring-2 ring-red-500' : hasWarnings ? 'ring-2 ring-yellow-500' : ''}`}>
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
                  
                  {event.roster && event.roster.length > 0 && (
                    <div className="mb-2">
                      <div className="text-xs font-semibold text-gray-700 mb-1">Roster:</div>
                      <div className="flex flex-col gap-1.5">
                        {event.roster.map((assignment, idx) => {
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
                              roleColorClass={roleColorMap[assignment.role]}
                              memberId={assignment.member_id}
                              memberLabel={getMemberDisplay(assignment.member_id)}
                              isGenerated={assignment.isGenerated}
                              availableMembers={roleAvailability}
                              onSelect={(memberId) => onEditRosterSlot?.(event.date, idx, memberId)}
                              onRemove={() => onEditRosterSlot?.(event.date, idx, null)}
                              onSwap={onSwapRosterSlots}
                            />
                          )
                        })}
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
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="space-y-8">
          {filteredMonths.map((month, monthIdx) => (
            <div key={monthIdx}>
              <h3 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-gray-400">
                {month.monthName}
              </h3>
              <div className="bg-white/60 backdrop-blur-md rounded-lg shadow-lg border border-white/30 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-100/80">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Event</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Time</th>
                        {allRoles.map(role => (
                          <th key={role} className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            {role}
                          </th>
                        ))}
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {month.events.map((event, eventIdx) => {
                        const validation = validationResults?.[event.date] || { errors: [], warnings: [] }
                        const hasErrors = validation.errors.length > 0
                        const hasWarnings = validation.warnings.length > 0
                        const eventDate = new Date(event.date)
                        const dayOfWeek = eventDate.getDay()
                        const cardBgClass = getCardColorForDay(dayOfWeek)
                        
                        // Create roster map for easy lookup
                        const rosterMap = {}
                        const rosterGeneratedMap = {}
                        if (event.roster) {
                          event.roster.forEach(assignment => {
                            rosterMap[assignment.role] = assignment.member_id
                            rosterGeneratedMap[assignment.role] = assignment.isGenerated
                          })
                        }
                        
                        return (
                          <tr 
                            key={eventIdx} 
                            className={`${cardBgClass} hover:bg-white/40 transition-colors ${
                              hasErrors ? 'border-l-4 border-red-500' : hasWarnings ? 'border-l-4 border-yellow-500' : ''
                            }`}
                          >
                            <td className="px-4 py-3">
                              <div className="flex flex-col">
                                <span className="font-bold text-gray-900">{formatDate(event.date)}</span>
                                <span className="text-xs text-blue-800 bg-blue-100/60 px-2 py-0.5 rounded inline-block w-fit mt-1">
                                  {event.day_of_week}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-sm font-medium text-gray-900">{event.name}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-sm text-gray-700">{event.reporting_time}</span>
                            </td>
                            {allRoles.map(role => (
                              <td key={role} className="px-4 py-3">
                                {rosterMap[role] ? (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-sm text-gray-900 font-medium">{getMemberDisplay(rosterMap[role])}</span>
                                    {rosterGeneratedMap[role] && (
                                      <span className="px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500 rounded" title="Auto-generated by algorithm">
                                        generated
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-xs text-gray-400 italic">-</span>
                                )}
                              </td>
                            ))}
                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-1">
                                {hasErrors && (
                                  <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-semibold rounded border border-red-300 inline-block w-fit">
                                    ❌ {validation.errors.length} Error{validation.errors.length > 1 ? 's' : ''}
                                  </span>
                                )}
                                {hasWarnings && (
                                  <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-semibold rounded border border-yellow-300 inline-block w-fit">
                                    ⚠️ {validation.warnings.length} Warning{validation.warnings.length > 1 ? 's' : ''}
                                  </span>
                                )}
                                {!hasErrors && !hasWarnings && (
                                  <span className="text-xs text-green-700 font-medium">✓ OK</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {filteredMonths.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          {searchQuery ? 'No events match your search' : 'No events scheduled'}
        </div>
      )}
    </div>
  )
}
