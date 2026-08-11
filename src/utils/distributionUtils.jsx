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
      <div className="flex items-end justify-center gap-3 px-8" style={{ height: '116px' }}>
        {sortedDistribution.map(({ shiftCount, memberCount, memberIds }) => {
          // Reserve space for the count label above (~16px), the shift-count
          // label below (~20px), and gaps.
          const maxBarHeight = 72
          const heightPixels = Math.max((memberCount / maxMemberCount) * maxBarHeight, 8)
          const isHovered = hoveredBar === shiftCount
          
          return (
            <div 
              key={shiftCount} 
              className="flex flex-col items-center justify-end gap-1 relative" 
              style={{ width: `${barWidth}px` }}
              onMouseEnter={() => setHoveredBar(shiftCount)}
              onMouseLeave={() => setHoveredBar(null)}
            >
              {/* Count sits ABOVE the bar so it never spills out of short bars. */}
              <div className="text-slate-500 text-xs font-bold leading-none">
                {memberCount}
              </div>
              <div
                className={`w-full rounded-t transition-all cursor-pointer ${
                  isHovered ? 'ring-2 ring-slate-300' : ''
                }`}
                style={{
                  height: `${heightPixels}px`,
                  background: isHovered
                    ? 'linear-gradient(to top, #64748b, #94a3b8)'
                    : 'linear-gradient(to top, #94a3b8, #cbd5e1)'
                }}
              />
              <div className="text-xs font-semibold text-gray-700">{shiftCount}</div>
              
              {/* Tooltip with member names — light translucent glass, matching
                  the roster-stats theme */}
              {isHovered && memberIds && memberIds.length > 0 && (
                <div className="absolute bottom-full mb-2 rounded-lg border border-white/60 bg-white/80 py-2 px-3 text-xs text-slate-700 shadow-lg backdrop-blur-md z-50 whitespace-nowrap max-w-xs">
                  <div className="font-semibold mb-1">
                    {memberCount} member{memberCount > 1 ? 's' : ''} with {shiftCount} shift{shiftCount > 1 ? 's' : ''}:
                  </div>
                  <div className="space-y-0.5 text-slate-600">
                    {memberIds.map((memberId, idx) => (
                      <div key={idx}>• {getMemberName(memberId)}</div>
                    ))}
                  </div>
                  {/* Arrow */}
                  <div className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-white/60 bg-white/80"></div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
