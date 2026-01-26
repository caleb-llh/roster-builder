import QualityMetrics from './QualityMetrics'
import { calculateRosterStats } from '../utils/rosterStats'

export default function GenerationResultModal({ generationResult, members, onClose }) {
  if (!generationResult) return null

  const activeMembers = members.filter(m => m.include !== false)
  
  // Calculate stats for role diversity
  const stats = calculateRosterStats(
    generationResult.events || [],
    members,
    generationResult.rosterPeriod || { start_date: '2026-01-01', end_date: '2026-12-31' }
  )

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900">Generation Complete</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            >
              ×
            </button>
          </div>

          <div className="space-y-4">
            {/* Statistics */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-blue-600">
                  {generationResult.stats.generatedAssignments}
                </div>
                <div className="text-sm text-gray-600">Generated</div>
              </div>
              <div className="bg-green-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-green-600">
                  {generationResult.stats.assignedRoles}
                </div>
                <div className="text-sm text-gray-600">Total Assigned</div>
              </div>
              <div className="bg-purple-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-purple-600">
                  {generationResult.stats.totalRoles}
                </div>
                <div className="text-sm text-gray-600">Total Roles</div>
              </div>
            </div>

            {/* Multi-Start Info */}
            {generationResult.stats.multiStartInfo && (
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-4 border border-indigo-200">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">✨</span>
                  <h3 className="font-semibold text-indigo-900">Multi-Start Optimization</h3>
                </div>
                <div className="text-sm text-gray-700 space-y-1">
                  <p>
                    Generated <span className="font-semibold text-indigo-700">{generationResult.stats.multiStartInfo.totalRuns} variations</span> and selected the best quality roster
                  </p>
                  <p className="text-xs text-gray-600">
                    Best solution: Run #{generationResult.stats.multiStartInfo.bestRun + 1} • 
                    Quality range: {generationResult.stats.multiStartInfo.qualityRange.best} to {generationResult.stats.multiStartInfo.qualityRange.worst}
                  </p>
                </div>
              </div>
            )}

            {/* Quality Metrics */}
            <QualityMetrics 
              generationResult={generationResult}
              members={members}
              stats={stats}
              showRoleDiversity={true}
              compact={false}
            />

            {/* Unassignable Roles */}
            {generationResult.stats.unassignableRoles.length > 0 && (
              <div className="bg-red-50 rounded-lg p-4">
                <h3 className="font-semibold text-red-900 mb-3">
                  ⚠️ Unassignable Roles ({generationResult.stats.unassignableRoles.length})
                </h3>
                <div className="space-y-2 text-sm max-h-60 overflow-y-auto">
                  {generationResult.stats.unassignableRoles.map((item, idx) => (
                    <div key={idx} className="bg-white rounded p-3">
                      <div className="font-medium text-gray-900">{item.event}</div>
                      <div className="text-gray-600">
                        {item.date} - {item.role}
                      </div>
                      <div className="text-red-600 text-xs mt-1">{item.reason}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
