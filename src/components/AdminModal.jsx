import { useState, useEffect, useCallback } from 'react'

/**
 * Owner-only admin panel: create a roster, invite/manage members by email.
 * Rendered from the header, gated on role === 'owner'. All actions go through
 * the provider's RPC-backed methods; errors are surfaced inline.
 */
export default function AdminModal({ open, onClose, roster }) {
  const { role, createRoster, listMembers, setMemberRole, removeMember, inviteMember, listInvites, revokeInvite } = roster

  const [members, setMembers] = useState([])
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const [newRosterName, setNewRosterName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('editor')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [mRes, iRes] = await Promise.all([listMembers(), listInvites()])
    if (!mRes.ok) setError(mRes.errors.join('; '))
    else setMembers(mRes.members)
    if (iRes.ok) setInvites(iRes.invites)
    setLoading(false)
  }, [listMembers, listInvites])

  useEffect(() => {
    if (open && role === 'owner') refresh()
  }, [open, role, refresh])

  if (!open) return null

  const run = async (fn) => {
    setBusy(true)
    setError(null)
    const res = await fn()
    if (res && !res.ok) setError(res.errors.join('; '))
    setBusy(false)
    return res
  }

  const handleCreate = async () => {
    const res = await run(() => createRoster(newRosterName))
    if (res.ok) setNewRosterName('')
  }

  const handleInvite = async () => {
    const res = await run(() => inviteMember(inviteEmail, inviteRole))
    if (res.ok) {
      setInviteEmail('')
      await refresh()
    }
  }

  const handleRevoke = async (email) => {
    const res = await run(() => revokeInvite(email))
    if (res.ok) await refresh()
  }

  const handleRoleChange = async (email, nextRole) => {
    const res = await run(() => setMemberRole(email, nextRole))
    if (res.ok) await refresh()
  }

  const handleRemove = async (userId) => {
    const res = await run(() => removeMember(userId))
    if (res.ok) await refresh()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-lg font-bold text-gray-900">Manage roster</h2>
          <button onClick={onClose} className="text-2xl leading-none text-gray-400 hover:text-gray-700" title="Close">
            ×
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          {/* Create roster */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Create a new roster</h3>
            <div className="flex gap-2">
              <input
                value={newRosterName}
                onChange={(e) => setNewRosterName(e.target.value)}
                placeholder="Roster name"
                className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                onClick={handleCreate}
                disabled={busy}
                className="rounded-lg bg-gray-800 px-3 py-2 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-50"
              >
                Create
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-400">Creating switches you to the new roster.</p>
          </section>

          {/* Invite by email */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Whitelist by email</h3>
            <div className="flex gap-2">
              <input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="friend@gmail.com"
                type="email"
                className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-2 text-sm"
              >
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
                <option value="owner">Owner</option>
              </select>
              <button
                onClick={handleInvite}
                disabled={busy || !inviteEmail}
                className="rounded-lg bg-gray-800 px-3 py-2 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-50"
              >
                Add
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-400">Works before they sign in — access is granted automatically on their first Google login.</p>
          </section>

          {/* Members list */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Members</h3>
            {loading ? (
              <p className="text-sm text-gray-400">Loading…</p>
            ) : members.length === 0 ? (
              <p className="text-sm text-gray-400">No members yet.</p>
            ) : (
              <ul className="space-y-2">
                {members.map((m) => (
                  <li key={m.user_id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{m.email}</span>
                    <select
                      value={m.role}
                      onChange={(e) => handleRoleChange(m.email, e.target.value)}
                      disabled={busy}
                      className="rounded-md border border-gray-300 px-1.5 py-1 text-xs"
                    >
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                      <option value="owner">Owner</option>
                    </select>
                    <button
                      onClick={() => handleRemove(m.user_id)}
                      disabled={busy}
                      className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                      title="Remove member"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Pending invites */}
          {invites.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Pending invites</h3>
              <ul className="space-y-2">
                {invites.map((i) => (
                  <li key={i.email} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-gray-500">{i.email}</span>
                    <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{i.role}</span>
                    <button
                      onClick={() => handleRevoke(i.email)}
                      disabled={busy}
                      className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                      title="Revoke invite"
                    >
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
