/**
 * Track assignments during roster generation to maintain state
 */

import { getWeekKey } from '../constraintChecking'

export class AssignmentTracker {
  constructor(members, events, rosterPeriod) {
    this.members = members
    this.events = events
    this.rosterPeriod = rosterPeriod
    
    // Track assignments per member
    this.memberAssignments = {}
    this.memberRoleAssignments = {}
    members.forEach(m => {
      if (m.include !== false) {
        this.memberAssignments[m.id] = {
          total: 0,
          byMonth: {},
          byWeek: {},
          byDay: {},
          dates: []
        }
        this.memberRoleAssignments[m.id] = {}
      }
    })
    
    // Initialize with existing assignments
    this._initializeFromEvents(events)
  }
  
  _initializeFromEvents(events) {
    events.forEach(event => {
      if (event.roster) {
        event.roster.forEach(assignment => {
          if (assignment.member_id) {
            this.recordAssignment(assignment.member_id, event.date, event.day_of_week, assignment.role)
          }
        })
      }
    })
  }
  
  recordAssignment(memberId, date, dayOfWeek, role = null) {
    if (!this.memberAssignments[memberId]) return
    
    const eventDate = new Date(date)
    const monthKey = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}`
    const weekKey = getWeekKey(eventDate)
    
    const tracker = this.memberAssignments[memberId]
    tracker.total++
    tracker.byMonth[monthKey] = (tracker.byMonth[monthKey] || 0) + 1
    tracker.byWeek[weekKey] = (tracker.byWeek[weekKey] || 0) + 1
    tracker.byDay[dayOfWeek] = (tracker.byDay[dayOfWeek] || 0) + 1
    tracker.dates.push(date)
    
    // Track role assignments
    if (role && this.memberRoleAssignments[memberId]) {
      this.memberRoleAssignments[memberId][role] = (this.memberRoleAssignments[memberId][role] || 0) + 1
    }
  }
  
  getAssignmentCount(memberId) {
    return this.memberAssignments[memberId]?.total || 0
  }
  
  getMonthlyAssignmentCount(memberId, date) {
    const eventDate = new Date(date)
    const monthKey = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}`
    return this.memberAssignments[memberId]?.byMonth[monthKey] || 0
  }
  
  getWeeklyAssignmentCount(memberId, date) {
    const weekKey = getWeekKey(new Date(date))
    return this.memberAssignments[memberId]?.byWeek[weekKey] || 0
  }
  
  getDayAssignmentCount(memberId, dayOfWeek) {
    return this.memberAssignments[memberId]?.byDay[dayOfWeek] || 0
  }
  
  getLastAssignmentDate(memberId) {
    const dates = this.memberAssignments[memberId]?.dates || []
    if (dates.length === 0) return null
    return dates[dates.length - 1]
  }
  
  getAllAssignmentDates(memberId) {
    return this.memberAssignments[memberId]?.dates || []
  }
  
  getRoleAssignmentCount(memberId, role) {
    return this.memberRoleAssignments[memberId]?.[role] || 0
  }
  
  // Get fairness metric: standard deviation of assignment counts
  getFairnessScore() {
    const counts = Object.values(this.memberAssignments).map(a => a.total)
    if (counts.length === 0) return 0
    
    const mean = counts.reduce((sum, c) => sum + c, 0) / counts.length
    const variance = counts.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / counts.length
    return Math.sqrt(variance)
  }
  
  // Get spread metric: how evenly assignments are distributed over time
  getSpreadScore() {
    if (!this.rosterPeriod?.start_date || !this.rosterPeriod?.end_date) return 0
    
    const startDate = new Date(this.rosterPeriod.start_date)
    const endDate = new Date(this.rosterPeriod.end_date)
    const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24))
    
    // Calculate time gaps between consecutive assignments for each member
    const gaps = []
    Object.values(this.memberAssignments).forEach(tracker => {
      const sortedDates = tracker.dates.map(d => new Date(d)).sort((a, b) => a - b)
      for (let i = 1; i < sortedDates.length; i++) {
        const gap = Math.ceil((sortedDates[i] - sortedDates[i-1]) / (1000 * 60 * 60 * 24))
        gaps.push(gap)
      }
    })
    
    if (gaps.length === 0) return 0
    
    const mean = gaps.reduce((sum, g) => sum + g, 0) / gaps.length
    const variance = gaps.reduce((sum, g) => sum + Math.pow(g - mean, 2), 0) / gaps.length
    return Math.sqrt(variance) // Lower is better (more even spread)
  }
}
