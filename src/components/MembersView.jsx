import { useState } from 'react'
import { WarningBanner, MemberCard } from './SharedComponents'

export default function MembersView({ members, roles, roleColorMap, warnings, searchQuery, memberConstraints, memberPreferences }) {
  const [selectedRole, setSelectedRole] = useState('All')

  const activeMembers = members.filter(m => m.include !== false)
  const searchLower = searchQuery.toLowerCase()
  
  const filteredMembers = activeMembers
    .filter(m => 
      (selectedRole === 'All' || m.roles?.includes(selectedRole)) &&
      (!searchQuery || m.name.toLowerCase().includes(searchLower) || m.telegram?.toLowerCase().includes(searchLower))
    )
    .sort((a, b) => a.name.localeCompare(b.name))

  const roleCount = (role) => role === 'All' ? activeMembers.length : activeMembers.filter(m => m.roles?.includes(role)).length

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Members</h2>
      {warnings && <WarningBanner warnings={warnings} />}
      
      {/* Role Filter Buttons */}
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedRole('All')}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${selectedRole === 'All' ? 'bg-blue-500/80 backdrop-blur-md text-white shadow-lg border border-blue-300/30' : 'bg-white/40 backdrop-blur-md text-gray-700 hover:bg-white/60 border border-white/30 shadow-md'}`}
        >
          All ({roleCount('All')})
        </button>
        {roles.map(role => (
          <button
            key={role}
            onClick={() => setSelectedRole(role)}
            className={`px-4 py-2 rounded-lg font-medium transition-all backdrop-blur-md border ${roleColorMap[role]} ${selectedRole === role ? 'shadow-lg ring-2 ring-offset-2 ring-current' : 'opacity-60 hover:opacity-80 shadow-md'}`}
          >
            {role} ({roleCount(role)})
          </button>
        ))}
      </div>

      {/* Results Info */}
      <div className="mb-4 text-sm text-gray-600">
        Showing {filteredMembers.length} member{filteredMembers.length !== 1 ? 's' : ''}
        {selectedRole !== 'All' && ` with ${selectedRole} role`}
        {searchQuery && ` matching "${searchQuery}"`}
      </div>

      {/* Member Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredMembers.map((member, i) => (
          <MemberCard key={i} member={member} roleColorMap={roleColorMap} memberConstraints={memberConstraints} memberPreferences={memberPreferences} />
        ))}
      </div>

      {filteredMembers.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No members found matching your criteria
        </div>
      )}
    </div>
  )
}
