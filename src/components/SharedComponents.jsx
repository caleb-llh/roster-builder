// Shared components for the application
import { useState, useRef, useEffect } from 'react'
import { monoChip, semanticError, glassMenu, glassPanel, tierSection, glassCard, glassFab, tierLabel } from '../utils/statsTheme'

/**
 * Close the popup when a mousedown lands outside `ref`. Shared by the various
 * click-to-open dropdowns/menus so the outside-click behaviour is identical.
 */
export const useClickOutside = (ref, onOutside, active = true) => {
  useEffect(() => {
    if (!active) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onOutside() }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [ref, onOutside, active])
}

/** Standard modal "×" close button. */
export const ModalCloseButton = ({ onClick, className = '' }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label="Close"
    className={`text-gray-400 hover:text-gray-600 transition-colors ${className}`}
  >
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  </button>
)

/** Standard modal header: title (headingModal-ish) + close button on one bar.
 *  Any `children` render next to the title (e.g. a status badge). */
export const ModalHeader = ({ title, onClose, children }) => (
  <div className="flex items-center justify-between border-b border-white/40 px-4 sm:px-6 py-3 sm:py-4">
    <div className="flex min-w-0 items-center gap-2">
      <h2 className="text-lg font-semibold tracking-tight text-gray-900">{title}</h2>
      {children}
    </div>
    {onClose && <ModalCloseButton onClick={onClose} />}
  </div>
)

/** Glass stat tile: a big number with an uppercase caption below. */
export const StatTile = ({ value, label, className = '' }) => (
  <div className={`${glassCard} p-3 text-center ${className}`}>
    <div className="text-2xl font-bold text-gray-800">{value}</div>
    <div className={`mt-1 ${tierLabel}`}>{label}</div>
  </div>
)

/** Round glass floating action button. */
export const GlassFab = ({ onClick, disabled, title, className = '', children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`${glassFab} disabled:opacity-40 disabled:pointer-events-none ${className}`}
  >
    {children}
  </button>
)

// Compact validation summary: coloured dot(s) + count(s) with a disclosure
// caret that toggles a dropdown listing the individual issues. Used next to
// the Events and Members headings so both surfaces present errors/warnings the
// same way (click to open — no hover). Each item is { level, label?, msg }.
export const IssueSummary = ({ errorCount = 0, warningCount = 0, items = [] }) => {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useClickOutside(ref, () => setOpen(false), open)

  if (errorCount === 0 && warningCount === 0) return null

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label="View validation issues"
        className="flex items-center gap-1.5 text-xs font-semibold"
      >
        {errorCount > 0 && (
          <span className="flex items-center gap-1 text-red-600">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400" />
            {errorCount}
          </span>
        )}
        {warningCount > 0 && (
          <span className="flex items-center gap-1 text-amber-600">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
            {warningCount}
          </span>
        )}
        <span className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <div className={`absolute left-0 top-full z-40 mt-1 w-72 max-h-64 overflow-y-auto p-2 ${glassMenu}`}>
          <div className={`px-1 pb-1 ${tierSection}`}>
            {errorCount} {errorCount === 1 ? 'Error' : 'Errors'} · {warningCount} {warningCount === 1 ? 'Warning' : 'Warnings'}
          </div>
          <ul className="space-y-1">
            {items.map((issue, idx) => (
              <li key={idx} className="flex items-start gap-1.5 rounded px-1 py-0.5 text-xs">
                <span className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${issue.level === 'error' ? 'bg-red-400' : 'bg-amber-400'}`} />
                <span className="text-gray-600">
                  {issue.label && <span className="font-medium text-gray-800">{issue.label}</span>}
                  {issue.label ? ' — ' : ''}{issue.msg}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export const ErrorDisplay = ({ title, message, hint }) => (
  <div className="min-h-screen bg-slate-50 p-8">
    <div className="max-w-4xl mx-auto">
      <div className={`p-6 rounded-lg ${semanticError}`}>
        <div className="flex items-center mb-2">
          <svg className="w-6 h-6 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-lg font-semibold tracking-tight text-red-800">{title}</h2>
        </div>
        {typeof message === 'string' ? (
          <p className="text-red-700 font-mono text-sm">{message}</p>
        ) : (
          <ul className="space-y-2">
            {message.map((err, i) => (
              <li key={i} className="text-red-700 text-sm flex items-start">
                <span className="mr-2">•</span>
                <span>{err}</span>
              </li>
            ))}
          </ul>
        )}
        {hint && <p className="mt-4 text-red-600 text-sm">{hint}</p>}
      </div>
    </div>
  </div>
)

export const MemberCard = ({ member, roleColorMap, memberConstraints, memberPreferences }) => {
  const [showUnavailability, setShowUnavailability] = useState(false)
  const [showPreferences, setShowPreferences] = useState(false)
  
  // Find constraints for this member using member.id
  const memberConstraintData = memberConstraints?.find(c => c.member_id === member.id)
  const unavailableDates = memberConstraintData?.unavailable_dates || []
  const hasUnavailability = unavailableDates.length > 0
  
  // Find preferences for this member
  const memberPreferenceData = memberPreferences?.find(p => p.member_id === member.id)
  const preferredDays = memberPreferenceData?.days || []
  const preferredRoles = memberPreferenceData?.roles || []
  const hasPreferences = preferredDays.length > 0 || preferredRoles.length > 0
  
  // Format unavailable dates
  const formatUnavailableDate = (dateItem) => {
    if (typeof dateItem === 'string') {
      const date = new Date(dateItem)
      return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    } else if (dateItem.start && dateItem.end) {
      const startDate = new Date(dateItem.start)
      const endDate = new Date(dateItem.end)
      return `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    }
    return 'Invalid date'
  }
  
  return (
    <div className={`${glassPanel} p-4 hover:shadow-xl hover:bg-white/50 transition-all ${member.include === false ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-900">{member.name}</h3>
        {member.include === false && (
          <span className={`px-2 py-1 text-xs font-medium rounded ${monoChip}`}>Inactive</span>
        )}
      </div>
      {member.telegram && (
        <div className="text-sm text-gray-600 mb-3">
          <span className="font-medium">Telegram:</span> {member.telegram}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {member.roles?.map((role, i) => (
          <span key={i} className={`px-1.5 py-0.5 rounded border border-gray-200/70 bg-white/30 text-xs font-medium ${roleColorMap[role] || 'text-gray-700'}`}>
            {role}
          </span>
        ))}
        {member.understudyFor?.map((role, i) => (
          <span
            key={`u-${i}`}
            title={`Training as understudy for ${role}`}
            className={`px-1.5 py-0.5 rounded border border-dashed border-gray-300/70 bg-white/30 text-xs font-medium italic opacity-80 ${roleColorMap[role] || 'text-gray-700'}`}
          >
            {role} (understudy)
          </span>
        ))}
      </div>
      
      {/* Unavailable Period and Preferences Section */}
      {(hasUnavailability || hasPreferences) && (
        <div className="mt-2 pt-2 border-t border-gray-200 space-y-2">
          {/* Unavailable Period */}
          {hasUnavailability && (
            <div>
              <button
                onClick={() => setShowUnavailability(!showUnavailability)}
                className="text-xs text-gray-600 hover:text-gray-800 font-medium flex items-center gap-1 w-full text-left"
              >
                {showUnavailability ? '▼' : '▶'} Unavailable Period ({unavailableDates.length})
              </button>
              {showUnavailability && (
                <div className="mt-2 space-y-1">
                  {unavailableDates.map((dateItem, idx) => (
                    <div key={idx} className="text-xs text-gray-700 bg-gray-50/60 px-2 py-1.5 rounded border border-gray-200/40">
                      {formatUnavailableDate(dateItem)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          
          {/* Preferences */}
          {hasPreferences && (
            <div>
              <button
                onClick={() => setShowPreferences(!showPreferences)}
                className="text-xs text-gray-600 hover:text-gray-800 font-medium flex items-center gap-1 w-full text-left"
              >
                {showPreferences ? '▼' : '▶'} Preferences
              </button>
              {showPreferences && (
                <div className="mt-2 space-y-1">
                  {preferredDays.length > 0 && (
                    <div className={`text-xs text-gray-700 px-2 py-1.5 rounded ${monoChip}`}>
                      Prefers days: {preferredDays.join(', ')}
                    </div>
                  )}
                  {preferredRoles.length > 0 && (
                    <div className={`text-xs text-gray-700 px-2 py-1.5 rounded ${monoChip}`}>
                      Prefers roles: {preferredRoles.join(', ')}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
