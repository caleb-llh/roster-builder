// Shared components for the application
import { useState } from 'react'

export const ErrorDisplay = ({ title, message, hint }) => (
  <div className="min-h-screen bg-gray-50 p-8">
    <div className="max-w-4xl mx-auto">
      <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded-lg">
        <div className="flex items-center mb-2">
          <svg className="w-6 h-6 text-red-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-xl font-bold text-red-800">{title}</h2>
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

export const WarningBanner = ({ warnings }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  
  if (!warnings || warnings.length === 0) return null
  
  // Group warnings by type
  const groupedWarnings = warnings.reduce((acc, warning) => {
    if (warning.includes('No telegram handle')) {
      acc.telegram = acc.telegram || []
      acc.telegram.push(warning)
    } else if (warning.includes('No unavailable dates')) {
      acc.availability = acc.availability || []
      acc.availability.push(warning)
    } else {
      acc.other = acc.other || []
      acc.other.push(warning)
    }
    return acc
  }, {})

  const totalWarnings = warnings.length
  const warningTypes = Object.keys(groupedWarnings).length

  return (
    <div className="mb-6 bg-yellow-50/60 backdrop-blur-md border-l-4 border-yellow-400/60 rounded-lg shadow-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-yellow-100/40 transition-colors"
      >
        <div className="flex items-center">
          <svg className="w-5 h-5 text-yellow-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h3 className="text-sm font-semibold text-yellow-800">
            {totalWarnings} Warning{totalWarnings !== 1 ? 's' : ''} ({warningTypes} {warningTypes === 1 ? 'type' : 'types'})
          </h3>
        </div>
        <span className="text-xs text-yellow-700 font-medium">
          {isExpanded ? '▼ Hide' : '▶ Show Details'}
        </span>
      </button>
      
      {isExpanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-yellow-200/40">
          {groupedWarnings.telegram && (
            <div>
              <div className="text-xs font-semibold text-yellow-800 mb-1 mt-2">
                Missing Telegram Handles ({groupedWarnings.telegram.length})
              </div>
              <ul className="space-y-0.5 ml-2">
                {groupedWarnings.telegram.map((warning, i) => (
                  <li key={i} className="text-yellow-700 text-xs flex items-start">
                    <span className="mr-2">•</span>
                    <span>{warning}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {groupedWarnings.availability && (
            <div>
              <div className="text-xs font-semibold text-yellow-800 mb-1">
                Missing Availability Data ({groupedWarnings.availability.length})
              </div>
              <ul className="space-y-0.5 ml-2">
                {groupedWarnings.availability.map((warning, i) => (
                  <li key={i} className="text-yellow-700 text-xs flex items-start">
                    <span className="mr-2">•</span>
                    <span>{warning}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {groupedWarnings.other && (
            <div>
              <div className="text-xs font-semibold text-yellow-800 mb-1">
                Other Warnings ({groupedWarnings.other.length})
              </div>
              <ul className="space-y-0.5 ml-2">
                {groupedWarnings.other.map((warning, i) => (
                  <li key={i} className="text-yellow-700 text-xs flex items-start">
                    <span className="mr-2">•</span>
                    <span>{warning}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

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
    <div className={`bg-white/40 backdrop-blur-md rounded-lg shadow-lg border border-white/30 p-4 hover:shadow-xl hover:bg-white/50 transition-all ${member.include === false ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-900">{member.name}</h3>
        {member.include === false && (
          <span className="px-2 py-1 text-xs font-medium bg-gray-200 text-gray-600 rounded">Inactive</span>
        )}
      </div>
      {member.telegram && (
        <div className="text-sm text-gray-600 mb-3">
          <span className="font-medium">Telegram:</span> {member.telegram}
        </div>
      )}
      <div className="flex flex-wrap gap-1 mb-3">
        {member.roles?.map((role, i) => (
          <span key={i} className={`px-2 py-1 text-xs font-medium rounded-full ${roleColorMap[role] || 'bg-gray-100 text-gray-800'}`}>
            {role}
          </span>
        ))}
        {member.understudyFor?.map((role, i) => (
          <span
            key={`u-${i}`}
            title={`Training as understudy for ${role}`}
            className={`px-2 py-1 text-xs font-medium rounded-full border border-dashed border-current opacity-70 ${roleColorMap[role] || 'bg-gray-100 text-gray-800'}`}
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
                      📅 {formatUnavailableDate(dateItem)}
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
                    <div className="text-xs text-gray-700 bg-blue-50/60 px-2 py-1.5 rounded border border-blue-200/40">
                      📅 Prefers: {preferredDays.join(', ')}
                    </div>
                  )}
                  {preferredRoles.length > 0 && (
                    <div className="text-xs text-gray-700 bg-purple-50/60 px-2 py-1.5 rounded border border-purple-200/40">
                      🎭 Prefers: {preferredRoles.join(', ')}
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
