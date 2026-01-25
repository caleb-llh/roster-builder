/**
 * Validation Builder for extensible validation rules
 */

export class ValidationBuilder {
  constructor(data) {
    this.data = data
    this.errors = []
    this.warnings = []
  }

  validate(validatorFn) {
    const result = validatorFn(this.data)
    if (result.errors) {
      this.errors.push(...result.errors)
    }
    if (result.warnings) {
      this.warnings.push(...result.warnings)
    }
    return this
  }

  getResults() {
    return {
      isValid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      hasWarnings: this.warnings.length > 0
    }
  }
}

export const validateYamlStructure = (data) => {
  const errors = []
  const warnings = []

  if (!data) {
    errors.push('YAML data is empty or invalid')
    return { errors, warnings }
  }

  if (!data.members || !Array.isArray(data.members)) {
    errors.push('Missing or invalid "members" array in YAML')
  }

  if (data.events !== undefined && !Array.isArray(data.events)) {
    errors.push('"events" must be an array if defined')
  }

  return { errors, warnings }
}

export const validateMembers = (data) => {
  const errors = []
  const warnings = []

  if (!data?.members) return { errors, warnings }

  data.members.forEach((member, index) => {
    const memberRef = `Member #${index + 1}${member.name ? ` (${member.name})` : ''}`

    if (!member.name) {
      errors.push(`${memberRef}: Missing required field "name"`)
    }

    if (!member.roles || !Array.isArray(member.roles) || member.roles.length === 0) {
      errors.push(`${memberRef}: Missing or empty "roles" array`)
    }

    if (!member.telegram) {
      warnings.push(`${member.name || memberRef}: No telegram handle provided`)
    }

    if (member.include === undefined) {
      warnings.push(`${memberRef}: "include" field not set, defaulting to true`)
    }

    const duplicates = data.members.filter(m => m.name === member.name)
    if (duplicates.length > 1 && index === data.members.findIndex(m => m.name === member.name)) {
      warnings.push(`${memberRef}: Duplicate name detected`)
    }
  })

  return { errors, warnings }
}

export const validateTelegramHandles = (data) => {
  const errors = []
  const warnings = []

  if (!data?.members) return { errors, warnings }

  data.members.forEach((member, index) => {
    if (member.telegram) {
      const memberRef = `${member.name || `Member #${index + 1}`}`
      
      if (!member.telegram.startsWith('@')) {
        warnings.push(`${memberRef}: Telegram handle should start with @`)
      }

      if (member.telegram.length < 6) {
        warnings.push(`${memberRef}: Telegram handle seems too short`)
      }

      if (!/^@[a-zA-Z0-9_]+$/.test(member.telegram)) {
        warnings.push(`${memberRef}: Telegram handle contains invalid characters`)
      }
    }
  })

  return { errors, warnings }
}

export const validateRoles = (data) => {
  const errors = []
  const warnings = []

  if (!data?.members) return { errors, warnings }

  let validRoles
  if (data.roles && Array.isArray(data.roles)) {
    validRoles = data.roles.map(r => r.name || r).filter(Boolean)
    if (validRoles.length === 0) {
      errors.push('Roles section is empty or invalid')
      return { errors, warnings }
    }
  } else {
    errors.push('No roles section found in YAML - roles must be defined')
    return { errors, warnings }
  }

  data.members.forEach((member, index) => {
    const memberRef = `${member.name || `Member #${index + 1}`}`
    
    if (member.roles) {
      member.roles.forEach(role => {
        if (!validRoles.includes(role)) {
          errors.push(
            `${memberRef}: Invalid role "${role}" - not found in declared roles. ` +
            `Valid roles are: ${validRoles.join(', ')}`
          )
        }
      })

      const uniqueRoles = new Set(member.roles)
      if (uniqueRoles.size !== member.roles.length) {
        warnings.push(`${memberRef}: Has duplicate roles`)
      }
    }
  })

  return { errors, warnings }
}

export const validateEventMemberMapping = (data) => {
  const errors = []
  const warnings = []

  if (!data?.events || !Array.isArray(data.events) || data.events.length === 0) {
    return { errors, warnings }
  }

  const memberNames = new Set(data.members?.map(m => m.name) || [])

  data.events.forEach((event, index) => {
    const eventRef = `Event #${index + 1}${event.name ? ` (${event.name})` : ''}`

    if (!event.name) {
      errors.push(`${eventRef}: Missing required field "name"`)
    }

    if (!event.date) {
      warnings.push(`${eventRef}: No date specified`)
    }
  })

  return { errors, warnings }
}

export const validateDates = (data) => {
  const errors = []
  const warnings = []
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/

  if (data?.events) {
    data.events.forEach((event, index) => {
      if (event.date && !dateRegex.test(event.date)) {
        errors.push(`Event #${index + 1}: Invalid date format "${event.date}" (expected YYYY-MM-DD)`)
      }
    })
  }

  if (data?.roster) {
    if (data.roster.start_date && !dateRegex.test(data.roster.start_date)) {
      errors.push(`Roster period: Invalid start_date format (expected YYYY-MM-DD)`)
    }
    if (data.roster.end_date && !dateRegex.test(data.roster.end_date)) {
      errors.push(`Roster period: Invalid end_date format (expected YYYY-MM-DD)`)
    }
  }

  return { errors, warnings }
}

export const validateRosterPeriod = (data) => {
  const errors = []
  const warnings = []

  if (data?.roster) {
    if (!data.roster.start_date) {
      warnings.push('Roster period: Missing start_date')
    }
    if (!data.roster.end_date) {
      warnings.push('Roster period: Missing end_date')
    }

    if (data.roster.start_date && data.roster.end_date) {
      if (data.roster.start_date > data.roster.end_date) {
        errors.push('Roster period: start_date must be before end_date')
      }

      // Check if events are outside roster period
      if (data.events && Array.isArray(data.events)) {
        data.events.forEach((event) => {
          if (event.date && (event.date < data.roster.start_date || event.date > data.roster.end_date)) {
            warnings.push(`Event "${event.name || event.date}" is outside roster period`)
          }
        })
      }

      // Check if member constraint dates are outside roster period
      if (data.member_constraints && Array.isArray(data.member_constraints)) {
        data.member_constraints.forEach((constraint) => {
          if (constraint.unavailable_dates && Array.isArray(constraint.unavailable_dates)) {
            const memberName = data.members?.find(m => (m.id || m.name) === constraint.member_id)?.name || constraint.member_id
            
            constraint.unavailable_dates.forEach((dateItem) => {
              // Handle both string dates and date range objects
              if (typeof dateItem === 'string') {
                if (dateItem < data.roster.start_date || dateItem > data.roster.end_date) {
                  warnings.push(`${memberName}: Unavailable date ${dateItem} is outside roster period`)
                }
              } else if (dateItem && typeof dateItem === 'object' && dateItem.start && dateItem.end) {
                if (dateItem.end < data.roster.start_date || dateItem.start > data.roster.end_date) {
                  warnings.push(`${memberName}: Date range ${dateItem.start} to ${dateItem.end} is completely outside roster period`)
                }
              }
            })
          }
        })
      }
    }
  }

  return { errors, warnings }
}

export const validateMemberConstraints = (data) => {
  const errors = []
  const warnings = []

  if (!data?.members) return { errors, warnings }

  // Check for members without constraints
  const includedMembers = data.members.filter(m => m.include !== false)
  const constraintMap = new Map()
  
  if (data.member_constraints && Array.isArray(data.member_constraints)) {
    data.member_constraints.forEach((constraint) => {
      if (constraint.member_id) {
        constraintMap.set(constraint.member_id, constraint)
      }
    })
  }

  includedMembers.forEach((member) => {
    const memberId = member.id || member.name
    const constraint = constraintMap.get(memberId)
    
    if (!constraint || !constraint.unavailable_dates || 
        (Array.isArray(constraint.unavailable_dates) && constraint.unavailable_dates.length === 0)) {
      warnings.push(`${member.name}: No unavailable dates specified in member constraints`)
    }
  })

  // Check for invalid member references
  const validMemberIds = new Set(data.members.map(m => m.id || m.name))
  
  if (data.member_constraints) {
    data.member_constraints.forEach((constraint, index) => {
      if (!constraint.member_id) {
        errors.push(`Member constraint #${index + 1}: Missing member_id`)
      } else if (!validMemberIds.has(constraint.member_id)) {
        const memberName = members.find(m => m.id === constraint.member_id)?.name || constraint.member_id
        warnings.push(`Member constraint for "${memberName}": Member not found`)
      }
    })
  }

  return { errors, warnings }
}

export const runAllValidators = (data) => {
  return new ValidationBuilder(data)
    .validate(validateYamlStructure)
    .validate(validateDates)
    .validate(validateMembers)
    .validate(validateTelegramHandles)
    .validate(validateRoles)
    .validate(validateEventMemberMapping)
    .validate(validateRosterPeriod)
    .validate(validateMemberConstraints)
    .getResults()
}
