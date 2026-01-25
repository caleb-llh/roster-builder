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
        distribution[shiftCount] = (distribution[shiftCount] || 0) + 1
      }
    })
  }

  const sortedDistribution = Object.entries(distribution)
    .map(([shiftCount, memberCount]) => ({
      shiftCount: parseInt(shiftCount, 10),
      memberCount: parseInt(memberCount, 10)
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
 * @param {Array} sortedDistribution - Sorted distribution array
 * @param {number} maxMemberCount - Maximum member count for scaling
 * @param {number} barWidth - Width of each bar in pixels (default: 32)
 * @returns {JSX} Bell curve visualization
 */
export function BellCurveChart({ sortedDistribution, maxMemberCount, barWidth = 32 }) {
  if (sortedDistribution.length === 0) {
    return (
      <div className="text-center text-sm text-gray-500 py-4">
        No distribution data available
      </div>
    )
  }

  return (
    <div className="flex items-end justify-center gap-3 px-8" style={{ height: '96px' }}>
      {sortedDistribution.map(({ shiftCount, memberCount }) => {
        // Reserve space for label (20px) and gap (4px)
        const maxBarHeight = 72
        const heightPixels = Math.max((memberCount / maxMemberCount) * maxBarHeight, 12)
        return (
          <div key={shiftCount} className="flex flex-col items-center justify-end gap-1" style={{ width: `${barWidth}px` }}>
            <div 
              className="w-full bg-blue-500 rounded-t transition-all hover:bg-blue-600 cursor-pointer flex items-start justify-center"
              style={{ 
                height: `${heightPixels}px`
              }}
              title={`${memberCount} member${memberCount > 1 ? 's' : ''} with ${shiftCount} shift${shiftCount > 1 ? 's' : ''}`}
            >
              <div className="text-white text-xs font-bold pt-1">
                {memberCount}
              </div>
            </div>
            <div className="text-xs font-semibold text-gray-700">{shiftCount}</div>
          </div>
        )
      })}
    </div>
  )
}
