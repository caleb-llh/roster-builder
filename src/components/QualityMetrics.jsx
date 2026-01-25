import { calculateDistribution, BellCurveChart } from '../utils/distributionUtils.jsx'

/**
 * Shared component for displaying quality metrics (shift balance, time spacing, role rotation)
 * Used by both RosterStatsPanel and GenerationResultModal
 */
export default function QualityMetrics({ generationResult, members, stats, showRoleDiversity = true, compact = false }) {
  if (!generationResult) return null

  const { sortedDistribution, maxMemberCount, averageShifts } = calculateDistribution(generationResult, members)

  if (compact) {
    // Compact view for RosterStatsPanel
    return (
      <div className="space-y-4">
        {/* Workload Fairness - Compact Cards */}
        <div>
          <div className="text-sm font-semibold text-gray-700 mb-3">📊 Workload Fairness</div>
          <div className="grid grid-cols-2 gap-3">
            {/* Shift Balance */}
            <div className="bg-white rounded-lg p-3 border border-gray-200">
              <div className="text-xs text-gray-600 mb-1">Shift Balance</div>
              <div className="text-2xl font-bold text-blue-600">
                {generationResult.fairnessMetrics.assignmentStdDev.toFixed(2)}
              </div>
              <div className="relative h-6 bg-gradient-to-r from-green-500 via-yellow-400 to-red-500 rounded-lg overflow-hidden mt-2">
                <div 
                  className="absolute top-0 bottom-0 w-1 bg-gray-900 shadow-lg"
                  style={{ 
                    left: `${Math.min(100, (generationResult.fairnessMetrics.assignmentStdDev / 3) * 100)}%`,
                    transform: 'translateX(-50%)'
                  }}
                >
                  <div className="absolute -top-0.5 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-gray-900 rounded-full"></div>
                </div>
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>✅ Best</span>
                <span>⚠️ Worst</span>
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {generationResult.fairnessMetrics.assignmentStdDev < 1.0 
                  ? "✅ Excellent balance"
                  : generationResult.fairnessMetrics.assignmentStdDev < 2.0
                  ? "👍 Good balance"
                  : "⚠️ Unbalanced"}
              </div>
            </div>

            {/* Time Spacing */}
            <div className="bg-white rounded-lg p-3 border border-gray-200">
              <div className="text-xs text-gray-600 mb-1">Time Spacing</div>
              <div className="text-2xl font-bold text-purple-600">
                {generationResult.fairnessMetrics.spreadStdDev.toFixed(2)}
              </div>
              <div className="relative h-6 bg-gradient-to-r from-green-500 via-yellow-400 to-red-500 rounded-lg overflow-hidden mt-2">
                <div 
                  className="absolute top-0 bottom-0 w-1 bg-gray-900 shadow-lg"
                  style={{ 
                    left: `${Math.min(100, (generationResult.fairnessMetrics.spreadStdDev / 15) * 100)}%`,
                    transform: 'translateX(-50%)'
                  }}
                >
                  <div className="absolute -top-0.5 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-gray-900 rounded-full"></div>
                </div>
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>✅ Best</span>
                <span>⚠️ Worst</span>
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {generationResult.fairnessMetrics.spreadStdDev < 5.0
                  ? "✅ Well-spaced"
                  : generationResult.fairnessMetrics.spreadStdDev < 10.0
                  ? "👍 Good spacing"
                  : "⚠️ Clustered"}
              </div>
            </div>
          </div>
        </div>

        {/* Bell Curve */}
        <div>
          <div className="text-sm font-semibold text-gray-700 mb-2">📈 Shift Distribution Chart</div>
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200/40">
            <BellCurveChart sortedDistribution={sortedDistribution} maxMemberCount={maxMemberCount} />
            <div className="text-center text-xs text-gray-500 mt-2">
              Shifts per member (Avg: {averageShifts})
            </div>
            <div className="text-center text-xs text-gray-400 mt-1">
              Shows how evenly shifts are distributed
            </div>
          </div>
        </div>
        
        {/* Role Diversity */}
        {showRoleDiversity && stats?.roleDiversity?.roleStats && (
          <div className="pt-4 border-t border-gray-200">
            <div className="text-sm font-semibold text-gray-700 mb-3">🎭 Role Rotation Quality</div>
            <div className="bg-white rounded-lg p-3 border border-gray-200">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-gray-600">Avg Members Per Role</span>
                <span className="text-2xl font-bold text-orange-600">
                  {stats.roleDiversity.avgMembersPerRole}
                </span>
              </div>
              <div className="relative h-6 bg-gradient-to-r from-red-500 via-yellow-400 to-green-500 rounded-lg overflow-hidden">
                <div 
                  className="absolute top-0 bottom-0 w-1 bg-gray-900 shadow-lg"
                  style={{ 
                    left: `${Math.min(100, (stats.roleDiversity.avgMembersPerRole / 6) * 100)}%`,
                    transform: 'translateX(-50%)'
                  }}
                >
                  <div className="absolute -top-0.5 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-gray-900 rounded-full"></div>
                </div>
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>⚠️ Limited</span>
                <span>✅ Excellent</span>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {stats.roleDiversity.avgMembersPerRole >= 4
                  ? "Great! Many members are learning each role"
                  : stats.roleDiversity.avgMembersPerRole >= 2.5
                  ? "Good variety - members are rotating through roles"
                  : "Limited rotation - consider varying assignments"}
              </p>
            </div>
            <div className="space-y-2 mt-2">
              {stats.roleDiversity.roleStats
                .sort((a, b) => b.uniqueMembers - a.uniqueMembers)
                .map(roleStat => (
                  <div key={roleStat.role} className="bg-white rounded p-2.5 text-xs border border-gray-100">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                      <span className="font-medium text-gray-900">{roleStat.role}</span>
                      <div className="flex items-center gap-2 text-[11px] sm:text-xs">
                        <span className="text-gray-600 font-medium">{roleStat.uniqueMembers} different members</span>
                        <span className="text-gray-400">({roleStat.totalAssignments} assignments)</span>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Full view for GenerationResultModal
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <h3 className="font-semibold text-gray-900 mb-2">Quality Metrics</h3>
      <p className="text-xs text-gray-500 mb-4">Lower scores are better (left on spectrum = better)</p>
      <div className="space-y-6">
        {/* Shift Balance */}
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="flex justify-between items-center mb-3">
            <div>
              <span className="text-sm font-semibold text-gray-800">Shift Balance</span>
              <p className="text-xs text-gray-500 mt-0.5">Are shifts distributed fairly?</p>
            </div>
            <span className="text-xl font-bold text-gray-900">
              {generationResult.fairnessMetrics.assignmentStdDev.toFixed(2)}
            </span>
          </div>
          <div className="relative h-8 bg-gradient-to-r from-green-500 via-yellow-400 to-red-500 rounded-lg overflow-hidden">
            <div 
              className="absolute top-0 bottom-0 w-1 bg-gray-900 shadow-lg"
              style={{ 
                left: `${Math.min(100, (generationResult.fairnessMetrics.assignmentStdDev / 3) * 100)}%`,
                transform: 'translateX(-50%)'
              }}
            >
              <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-3 h-3 bg-gray-900 rounded-full"></div>
            </div>
          </div>
          <div className="flex justify-between text-xs text-gray-600 mt-1">
            <span>✅ Excellent</span>
            <span>👍 Good</span>
            <span>⚠️ Unbalanced</span>
          </div>
          <p className="text-xs text-gray-500 italic mt-3">
            {generationResult.fairnessMetrics.assignmentStdDev < 1.0 
              ? "Everyone has a similar number of assignments"
              : generationResult.fairnessMetrics.assignmentStdDev < 2.0
              ? "Assignments are fairly distributed"
              : "Some members have significantly more assignments than others"}
          </p>

          {/* Distribution Details */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="text-xs font-semibold text-gray-700 mb-3">Distribution Details</div>
            
            <div className="bg-white rounded-lg p-3 mb-3">
              <div className="text-2xl font-bold text-blue-600">{averageShifts}</div>
              <div className="text-xs text-gray-600">Average shifts per member</div>
            </div>
            
            <div className="bg-white rounded-lg p-3 mb-3">
              <BellCurveChart sortedDistribution={sortedDistribution} maxMemberCount={maxMemberCount} />
              <div className="text-center text-xs text-gray-500 mt-2">
                Shifts per member
              </div>
            </div>
          </div>
        </div>

        {/* Time Spacing */}
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="flex justify-between items-center mb-3">
            <div>
              <span className="text-sm font-semibold text-gray-800">Time Spacing</span>
              <p className="text-xs text-gray-500 mt-0.5">Are shifts spread over time?</p>
            </div>
            <span className="text-xl font-bold text-gray-900">
              {generationResult.fairnessMetrics.spreadStdDev.toFixed(2)}
            </span>
          </div>
          <div className="relative h-8 bg-gradient-to-r from-green-500 via-yellow-400 to-red-500 rounded-lg overflow-hidden">
            <div 
              className="absolute top-0 bottom-0 w-1 bg-gray-900 shadow-lg"
              style={{ 
                left: `${Math.min(100, (generationResult.fairnessMetrics.spreadStdDev / 15) * 100)}%`,
                transform: 'translateX(-50%)'
              }}
            >
              <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-3 h-3 bg-gray-900 rounded-full"></div>
            </div>
          </div>
          <div className="flex justify-between text-xs text-gray-600 mt-1">
            <span>✅ Well-spaced</span>
            <span>👍 Good</span>
            <span>⚠️ Clustered</span>
          </div>
          <p className="text-xs text-gray-500 italic mt-3">
            {generationResult.fairnessMetrics.spreadStdDev < 5.0
              ? "Assignments are well-spaced throughout the period"
              : generationResult.fairnessMetrics.spreadStdDev < 10.0
              ? "Assignments have reasonable spacing"
              : "Some members may have clustered assignments"}
          </p>
        </div>
        
        {/* Role Rotation */}
        {showRoleDiversity && stats?.roleDiversity?.roleStats && (
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="flex justify-between items-center mb-3">
              <div>
                <span className="text-sm font-semibold text-gray-800">Role Rotation</span>
                <p className="text-xs text-gray-500 mt-0.5">Are different members trying each role?</p>
              </div>
              <span className="text-xl font-bold text-gray-900">
                {stats.roleDiversity.avgMembersPerRole}
              </span>
            </div>
            <div className="relative h-8 bg-gradient-to-r from-red-500 via-yellow-400 to-green-500 rounded-lg overflow-hidden">
              <div 
                className="absolute top-0 bottom-0 w-1 bg-gray-900 shadow-lg"
                style={{ 
                  left: `${Math.min(100, (stats.roleDiversity.avgMembersPerRole / 6) * 100)}%`,
                  transform: 'translateX(-50%)'
                }}
              >
                <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-3 h-3 bg-gray-900 rounded-full"></div>
              </div>
            </div>
            <div className="flex justify-between text-xs text-gray-600 mt-1">
              <span>⚠️ Limited</span>
              <span>👍 Good</span>
              <span>✅ Excellent</span>
            </div>
            
            <div className="space-y-2 max-h-32 overflow-y-auto mt-3">
              {stats.roleDiversity.roleStats
                .sort((a, b) => b.uniqueMembers - a.uniqueMembers)
                .map(roleStat => (
                  <div key={roleStat.role} className="bg-gray-50 rounded p-3 text-xs border border-gray-100">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-3">
                      <span className="font-medium text-gray-900">{roleStat.role}</span>
                      <div className="flex items-center gap-2 text-[11px] sm:text-xs">
                        <span className="text-gray-600 font-medium">{roleStat.uniqueMembers} different members</span>
                        <span className="text-gray-400">({roleStat.totalAssignments} assignments)</span>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
