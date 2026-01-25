// Global color palette for role tags - Cool Spectrum (Muted)
export const COLOR_PALETTE = [
  'bg-purple-100/60 text-purple-800',    // Muted purple
  'bg-violet-100/60 text-violet-800',    // Muted violet
  'bg-indigo-100/60 text-indigo-800',    // Muted indigo
  'bg-blue-100/60 text-blue-800',        // Muted blue
  'bg-sky-100/60 text-sky-800',          // Muted sky
  'bg-cyan-100/60 text-cyan-800',        // Muted cyan
  'bg-teal-100/60 text-teal-800',        // Muted teal
  'bg-emerald-100/60 text-emerald-800',  // Muted emerald
  'bg-green-100/60 text-green-800',      // Muted green
  'bg-lime-100/60 text-lime-800',        // Muted lime
]

// Card background palette for day of week - Extremely light tints
export const DAY_CARD_COLORS = [
  'bg-purple-50/40 hover:bg-purple-50/100',    // Sunday
  'bg-violet-50/40 hover:bg-violet-50/100',    // Monday
  'bg-indigo-50/40 hover:bg-indigo-50/100',    // Tuesday
  'bg-blue-50/40 hover:bg-blue-50/100',        // Wednesday
  'bg-sky-50/40 hover:bg-sky-50/100',          // Thursday
  'bg-cyan-50/40 hover:bg-cyan-50/100',        // Friday
  'bg-teal-50/40 hover:bg-teal-50/100',        // Saturday
]

// Create a stable color mapping for roles
export const createRoleColorMap = (roles) => {
  const colorMap = {}
  roles.forEach((role, index) => {
    colorMap[role] = COLOR_PALETTE[index % COLOR_PALETTE.length]
  })
  return colorMap
}

// Get card background color based on day of week (0 = Sunday, 6 = Saturday)
export const getCardColorForDay = (dayOfWeek) => {
  return DAY_CARD_COLORS[dayOfWeek % DAY_CARD_COLORS.length]
}

// Date formatting utilities
export const formatDate = (dateString, options = { month: 'short', day: 'numeric' }) => {
  return new Date(dateString).toLocaleDateString('en-US', options)
}

export const formatDateRange = (startDate, endDate) => {
  return `${formatDate(startDate, { month: 'short', day: 'numeric', year: 'numeric' })} - ${formatDate(endDate, { month: 'short', day: 'numeric', year: 'numeric' })}`
}
