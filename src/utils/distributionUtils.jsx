import { useState } from 'react'

/**
 * Calculate shift distribution from generation result
 * @param {Object} generationResult - The result from roster generation
 * @param {Array} members - Array of member objects
 * @returns {Object} Distribution data with sortedDistribution, maxMemberCount, averageShifts
 */
export function calculateDistribution(generationResult, members) {
  if (!generationResult) {
    return {
      sortedDistribution: [],
      maxMemberCount: 1,
      averageShifts: '0.0'
    }
  }

  const assignmentsByMember = generationResult.fairnessMetrics.assignmentsByMember || {}
  const distribution = {}
  
  if (typeof assignmentsByMember === 'object') {
    Object.entries(assignmentsByMember).forEach(([memberId, data]) => {
      let shiftCount
      if (typeof data === 'object' && data !== null) {
        shiftCount = data.total || data.count || data.assignments || Object.keys(data).length
      } else {
        shiftCount = typeof data === 'number' ? data : parseInt(data, 10)
      }
      
      if (!isNaN(shiftCount) && shiftCount > 0) {
        if (!distribution[shiftCount]) {
          distribution[shiftCount] = {
            memberCount: 0,
            memberIds: []
          }
        }
        distribution[shiftCount].memberCount++
        distribution[shiftCount].memberIds.push(memberId)
      }
    })
  }

  const sortedDistribution = Object.entries(distribution)
    .map(([shiftCount, data]) => ({
      shiftCount: parseInt(shiftCount, 10),
      memberCount: data.memberCount,
      memberIds: data.memberIds
    }))
    .filter(d => !isNaN(d.shiftCount) && !isNaN(d.memberCount) && d.shiftCount > 0)
    .sort((a, b) => a.shiftCount - b.shiftCount)

  const maxMemberCount = sortedDistribution.length > 0 
    ? Math.max(...sortedDistribution.map(d => d.memberCount)) 
    : 1
    
  const activeMembers = members?.filter(m => m.include !== false) || []
  const averageShifts = activeMembers.length > 0 
    ? (generationResult.stats.assignedRoles / activeMembers.length).toFixed(1)
    : '0.0'

  return {
    sortedDistribution,
    maxMemberCount,
    averageShifts
  }
}

/**
 * Render bell curve bars
 * @param {Array} sortedDistribution - Sorted distribution array with memberIds
 * @param {number} maxMemberCount - Maximum member count for scaling
 * @param {Array} members - Array of member objects to get names
 * @param {number} barWidth - Width of each bar in pixels (default: 32)
 * @returns {JSX} Bell curve visualization
 */
export function BellCurveChart({ sortedDistribution, maxMemberCount, members = [], barWidth = 32 }) {
  const [hoveredBar, setHoveredBar] = useState(null)
  
  if (sortedDistribution.length === 0) {
    return (
      <div className="text-center text-sm text-gray-500 py-4">
        No distribution data available
      </div>
    )
  }

  // Helper to get member name from ID
  const getMemberName = (memberId) => {
    const member = members.find(m => m.id === memberId)
    return member?.name || memberId
  }

  return (
    <div className="relative">
      <div className="flex items-end justify-center gap-3 px-8" style={{ height: '96px' }}>
        {sortedDistribution.map(({ shiftCount, memberCount, memberIds }) => {
          // Reserve space for label (20px) and gap (4px)
          const maxBarHeight = 72
          const heightPixels = Math.max((memberCount / maxMemberCount) * maxBarHeight, 12)
          const isHovered = hoveredBar === shiftCount
          
          return (
            <div 
              key={shiftCount} 
              className="flex flex-col items-center justify-end gap-1 relative" 
              style={{ width: `${barWidth}px` }}
              onMouseEnter={() => setHoveredBar(shiftCount)}
              onMouseLeave={() => setHoveredBar(null)}
            >
              <div 
                className={`w-full rounded-t transition-all cursor-pointer flex items-start justify-center ${
                  isHovered ? 'bg-slate-700 ring-2 ring-slate-400' : 'bg-slate-500 hover:bg-slate-600'
                }`}
                style={{ 
                  height: `${heightPixels}px`
                }}
              >
                <div className="text-white text-xs font-bold pt-1">
                  {memberCount}
                </div>
              </div>
              <div className="text-xs font-semibold text-gray-700">{shiftCount}</div>
              
              {/* Tooltip with member names */}
              {isHovered && memberIds && memberIds.length > 0 && (
                <div className="absolute bottom-full mb-2 bg-gray-900 text-white text-xs rounded-lg py-2 px-3 shadow-xl z-50 whitespace-nowrap max-w-xs">
                  <div className="font-semibold mb-1">
                    {memberCount} member{memberCount > 1 ? 's' : ''} with {shiftCount} shift{shiftCount > 1 ? 's' : ''}:
                  </div>
                  <div className="space-y-0.5">
                    {memberIds.map((memberId, idx) => (
                      <div key={idx}>• {getMemberName(memberId)}</div>
                    ))}
                  </div>
                  {/* Arrow */}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
