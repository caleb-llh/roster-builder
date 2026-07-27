/**
 * The provider contract shared by every data-layer mode (local, production).
 *
 * This is the seam that makes dual-mode maintainable: components depend ONLY on
 * this shape, never on a concrete provider or on the current mode. Every mutation
 * is async and fallible ({ ok, errors }) so that callers written against the local
 * playground already handle the production reality (network / RLS / validation
 * failures). Local mode simply resolves immediately and never denies permission.
 *
 * Business rules (validation, generation, constraint checks) live in the shared
 * layer and are invoked identically by both providers — providers differ only in
 * I/O (where the document is read from / written to).
 */

/**
 * @typedef {Object} MutationResult
 * @property {boolean} ok           Whether the mutation succeeded.
 * @property {string[]} errors      Human-readable errors when ok === false.
 */

/**
 * Permission flags supplied by the provider. Components gate UI on these instead
 * of checking the mode. Local mode returns all-true (single-user sandbox);
 * production derives them from the authenticated user's role (admin/member).
 *
 * @typedef {Object} RosterPermissions
 * @property {boolean} canEditRoster   Insert/remove/replace/swap assignments, generate.
 * @property {boolean} canImport       Import/replace the whole document (seed).
 * @property {boolean} canUndo         Undo the last change.
 */

/**
 * The uniform value returned by every provider (and by useRosterData).
 *
 * @typedef {Object} RosterProvider
 * @property {any} data                       Parsed working document (or null).
 * @property {any} originalData               Snapshot for diffing (or null).
 * @property {{type: string, message: string}|null} error
 * @property {boolean} loading
 * @property {boolean} hasGenerated
 * @property {any[]} history
 * @property {boolean} canUndo
 * @property {any[]} actionLog
 * @property {RosterPermissions} permissions
 *
 * @property {('owner'|'editor'|'viewer'|null)} role  Caller's role on the active
 *   roster (production); null in local mode. The admin UI is gated on role === 'owner'.
 * @property {{id: string, name: string, role: string}[]} rosters  All rosters the
 *   user belongs to (production); empty in local mode.
 * @property {(string|null)} activeRosterId  Currently-loaded roster id.
 * @property {(id: string) => void} selectRoster  Switch the active roster.
 * @property {(name: string) => Promise<MutationResult>} createRoster
 * @property {() => Promise<MutationResult & {members: {user_id: string, email: string, role: string}[]}>} listMembers
 * @property {(email: string, role: string) => Promise<MutationResult>} setMemberRole
 * @property {(userId: string) => Promise<MutationResult>} removeMember
 * @property {(email: string, role: string) => Promise<MutationResult>} inviteMember  Whitelist an email before login.
 * @property {() => Promise<MutationResult & {invites: {email: string, role: string}[]}>} listInvites
 * @property {(email: string) => Promise<MutationResult>} revokeInvite
 *
 * @property {(yamlText: string) => Promise<MutationResult>} importData
 * @property {() => Promise<void>} clearData
 * @property {(events: any[]) => Promise<MutationResult>} updateEvents
 * @property {(parsedData: any) => Promise<MutationResult>} replaceData
 * @property {(entryOrEntries: any) => void} logAction
 * @property {(events: any[]) => Promise<void>} saveToHistory
 * @property {() => Promise<boolean>} undoToHistory
 * @property {(error: any) => void} setError
 */

/**
 * Full-access permissions used by the local single-user playground.
 * @type {RosterPermissions}
 */
export const LOCAL_PERMISSIONS = Object.freeze({
  canEditRoster: true,
  canImport: true,
  canUndo: true,
})
