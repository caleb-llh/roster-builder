import QualityMetrics from './QualityMetrics'
import { calculateRosterStats } from '../utils/rosterStats'
import { modalBackdrop, glassModal, headingModal, glassCard, semanticError, btnNeutral } from '../utils/statsTheme'
import { StatTile, ModalCloseButton } from './SharedComponents'

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
    <div className={`fixed inset-0 ${modalBackdrop} flex items-center justify-center z-50 p-4`}>
      <div className={`${glassModal} max-w-2xl w-full max-h-[80vh] overflow-y-auto`}>
        <div className="p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className={headingModal}>Generation Complete</h2>
            <ModalCloseButton onClick={onClose} />
          </div>

          <div className="space-y-4">
            {/* Statistics */}
            <div className="grid grid-cols-3 gap-4">
              <StatTile value={generationResult.stats.generatedAssignments} label="Generated" />
              <StatTile value={generationResult.stats.assignedRoles} label="Total Assigned" />
              <StatTile value={generationResult.stats.totalRoles} label="Total Roles" />
            </div>

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
              <div className={`rounded-lg p-4 ${semanticError}`}>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-red-700 mb-3">
                  Unassignable Roles ({generationResult.stats.unassignableRoles.length})
                </h3>
                <div className="space-y-2 text-sm max-h-60 overflow-y-auto">
                  {generationResult.stats.unassignableRoles.map((item, idx) => (
                    <div key={idx} className={`${glassCard} p-3`}>
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
                className={`${btnNeutral} px-4 py-2 text-sm`}
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
