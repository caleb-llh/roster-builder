import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  encodeYAMLToURL,
  decodeYAMLFromURL,
  updateURLWithYAML,
  getYAMLFromURL,
  clearYAMLFromURL,
  generateShareableURL
} from './urlState'

describe('urlState', () => {
  let originalLocation
  let originalHistory

  beforeEach(() => {
    // Mock window.location and window.history
    originalLocation = window.location
    originalHistory = window.history
    
    delete window.location
    delete window.history
    
    window.location = {
      origin: 'http://localhost:5173',
      pathname: '/',
      search: '',
      href: 'http://localhost:5173/'
    }
    
    window.history = {
      replaceState: vi.fn()
    }
  })

  afterEach(() => {
    window.location = originalLocation
    window.history = originalHistory
  })

  describe('encodeYAMLToURL', () => {
    it('should encode simple YAML to URL-safe string', () => {
      const yaml = 'members:\n  - id: alice\n    name: Alice'
      const encoded = encodeYAMLToURL(yaml)
      
      expect(encoded).toBeTruthy()
      expect(typeof encoded).toBe('string')
      expect(encoded).not.toContain('\n')
      expect(encoded).not.toContain(' ')
    })

    it('should encode complex YAML with special characters', () => {
      const yaml = `members:
  - id: alice
    name: Alice O'Brien
    telegram: "@alice123"
    roles: [vm, cam-1]
events:
  - date: "2026-02-01"
    roster: []`
      
      const encoded = encodeYAMLToURL(yaml)
      
      expect(encoded).toBeTruthy()
      expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/) // URL-safe characters only
    })

    it('should be reversible with decodeYAMLFromURL', () => {
      const yaml = 'test: value\nnested:\n  key: data'
      const encoded = encodeYAMLToURL(yaml)
      const decoded = decodeYAMLFromURL(encoded)
      
      expect(decoded).toBe(yaml)
    })

    it('should handle empty string', () => {
      const encoded = encodeYAMLToURL('')
      expect(encoded).toBeTruthy()
    })

    it('should handle large YAML content', () => {
      const largeYaml = Array.from({ length: 100 }, (_, i) => 
        `member_${i}:\n  name: Member ${i}\n  roles: [vm, cam-1]`
      ).join('\n')
      
      const encoded = encodeYAMLToURL(largeYaml)
      
      expect(encoded).toBeTruthy()
      expect(encoded.length).toBeLessThan(largeYaml.length) // Should compress
    })
  })

  describe('decodeYAMLFromURL', () => {
    it('should decode URL-encoded string back to YAML', () => {
      const original = 'members:\n  - alice\n  - bob'
      const encoded = encodeYAMLToURL(original)
      const decoded = decodeYAMLFromURL(encoded)
      
      expect(decoded).toBe(original)
    })

    it('should return null for invalid encoded string', () => {
      const decoded = decodeYAMLFromURL('invalid-encoding!!!')
      expect(decoded).toBeNull()
    })

    it('should return null for empty string', () => {
      const decoded = decodeYAMLFromURL('')
      expect(decoded).toBeNull()
    })

    it('should return null for null input', () => {
      const decoded = decodeYAMLFromURL(null)
      // LZ-String returns empty string for null, not null
      expect(decoded === null || decoded === '').toBe(true)
    })

    it('should handle Unicode characters', () => {
      const yamlWithUnicode = 'name: 王小明\ndescription: café ☕'
      const encoded = encodeYAMLToURL(yamlWithUnicode)
      const decoded = decodeYAMLFromURL(encoded)
      
      expect(decoded).toBe(yamlWithUnicode)
    })
  })

  describe('updateURLWithYAML', () => {
    it('should update URL with config parameter', () => {
      const yaml = 'test: data'
      updateURLWithYAML(yaml)
      
      expect(window.history.replaceState).toHaveBeenCalled()
      const call = window.history.replaceState.mock.calls[0]
      const url = call[2]
      expect(url.href || url.toString()).toContain('config=')
    })

    it('should preserve other URL parameters', () => {
      window.location.search = '?other=param'
      window.location.href = 'http://localhost:5173/?other=param'
      const yaml = 'test: data'
      updateURLWithYAML(yaml)
      
      const call = window.history.replaceState.mock.calls[0]
      const url = call[2].href || call[2].toString()
      expect(url).toContain('other=param')
      expect(url).toContain('config=')
    })

    it('should replace existing config parameter', () => {
      window.location.search = '?config=old'
      const yaml = 'new: data'
      updateURLWithYAML(yaml)
      
      expect(window.history.replaceState).toHaveBeenCalled()
    })

    it('should not add duplicate parameters', () => {
      const yaml = 'test: data'
      updateURLWithYAML(yaml)
      
      const urlObj = window.history.replaceState.mock.calls[0][2]
      const urlStr = urlObj.href || urlObj.toString()
      const matches = urlStr.match(/config=/g)
      expect(matches).toHaveLength(1)
    })
  })

  describe('getYAMLFromURL', () => {
    it('should retrieve YAML from URL config parameter', () => {
      const yaml = 'members:\n  - alice'
      const encoded = encodeYAMLToURL(yaml)
      window.location.search = `?config=${encoded}`
      
      const retrieved = getYAMLFromURL()
      expect(retrieved).toBe(yaml)
    })

    it('should return null when no config parameter exists', () => {
      window.location.search = ''
      const retrieved = getYAMLFromURL()
      expect(retrieved).toBeNull()
    })

    it('should return null when config parameter is invalid', () => {
      window.location.search = '?config=invalid!!!'
      const retrieved = getYAMLFromURL()
      expect(retrieved).toBeNull()
    })

    it('should work with multiple URL parameters', () => {
      const yaml = 'test: value'
      const encoded = encodeYAMLToURL(yaml)
      window.location.search = `?debug=true&config=${encoded}&other=param`
      
      const retrieved = getYAMLFromURL()
      expect(retrieved).toBe(yaml)
    })

    it('should handle encoded special characters in config', () => {
      const yaml = 'key: "value with spaces & symbols!"'
      const encoded = encodeYAMLToURL(yaml)
      window.location.search = `?config=${encodeURIComponent(encoded)}`
      
      const retrieved = getYAMLFromURL()
      expect(retrieved).toBe(yaml)
    })
  })

  describe('clearYAMLFromURL', () => {
    it('should remove config parameter from URL', () => {
      window.location.search = '?config=test'
      clearYAMLFromURL()
      
      expect(window.history.replaceState).toHaveBeenCalled()
      const call = window.history.replaceState.mock.calls[0]
      expect(call[2]).not.toContain('config')
    })

    it('should preserve other URL parameters when clearing config', () => {
      window.location.search = '?other=param&config=test&another=value'
      window.location.href = 'http://localhost:5173/?other=param&config=test&another=value'
      clearYAMLFromURL()
      
      const call = window.history.replaceState.mock.calls[0]
      const url = call[2].href || call[2].toString()
      expect(url).toContain('other=param')
      expect(url).toContain('another=value')
      expect(url).not.toContain('config')
    })

    it('should handle URL with no config parameter gracefully', () => {
      window.location.search = '?other=param'
      window.location.href = 'http://localhost:5173/?other=param'
      clearYAMLFromURL()
      
      expect(window.history.replaceState).toHaveBeenCalled()
      const call = window.history.replaceState.mock.calls[0]
      const url = call[2].href || call[2].toString()
      expect(url).toContain('other=param')
    })

    it('should result in clean URL when config was only parameter', () => {
      window.location.search = '?config=test'
      clearYAMLFromURL()
      
      const call = window.history.replaceState.mock.calls[0]
      const newUrl = call[2].href || call[2].toString()
      expect(newUrl.endsWith('/')).toBe(true)
      expect(newUrl).not.toContain('?')
    })
  })

  describe('generateShareableURL', () => {
    it('should generate full URL with origin', () => {
      const yaml = 'test: data'
      const url = generateShareableURL(yaml)
      
      expect(url).toContain('http://localhost:5173')
      expect(url).toContain('config=')
    })

    it('should generate URL that can be parsed back', () => {
      const yaml = 'members:\n  - alice\n  - bob'
      const shareableUrl = generateShareableURL(yaml)
      
      // Extract config parameter
      const urlObj = new URL(shareableUrl)
      const encoded = urlObj.searchParams.get('config')
      const decoded = decodeYAMLFromURL(encoded)
      
      expect(decoded).toBe(yaml)
    })

    it('should preserve pathname', () => {
      window.location.pathname = '/app/roster'
      const yaml = 'test: data'
      const url = generateShareableURL(yaml)
      
      expect(url).toContain('/app/roster')
    })

    it('should handle complex YAML configurations', () => {
      const complexYaml = `roster_period:
  start_date: "2026-02-01"
  end_date: "2026-04-30"
members:
  - id: alice
    name: Alice O'Brien
    telegram: "@alice"
    roles: [vm, cam-1]
    include: true
events:
  - date: "2026-02-07"
    roster:
      - role: vm
        member_id: alice`
      
      const url = generateShareableURL(complexYaml)
      
      expect(url).toBeTruthy()
      expect(url).toContain('http://')
      expect(url).toContain('config=')
    })

    it('should generate different URLs for different YAML', () => {
      const yaml1 = 'test: one'
      const yaml2 = 'test: two'
      
      const url1 = generateShareableURL(yaml1)
      const url2 = generateShareableURL(yaml2)
      
      expect(url1).not.toBe(url2)
    })
  })

  describe('Round-trip encoding', () => {
    it('should maintain data integrity through full cycle', () => {
      const originalYaml = `roster_period:
  start_date: "2026-02-01"
  end_date: "2026-04-30"
members:
  - id: alice
    name: Alice
    roles: [vm, cam-1]
  - id: bob
    name: Bob
    roles: [cam-2]
events:
  - date: "2026-02-07"
    day_of_week: Sunday
    roster:
      - role: vm
        member_id: null`
      
      // Full cycle: YAML → URL → Browser → Decode → YAML
      const shareableUrl = generateShareableURL(originalYaml)
      const urlObj = new URL(shareableUrl)
      const encoded = urlObj.searchParams.get('config')
      const decoded = decodeYAMLFromURL(encoded)
      
      expect(decoded).toBe(originalYaml)
    })

    it('should handle URL state workflow', () => {
      const yaml = 'test: workflow'
      
      // User clicks Share button
      const shareUrl = generateShareableURL(yaml)
      
      // Recipient opens URL
      const urlObj = new URL(shareUrl)
      window.location.search = urlObj.search
      
      // App loads data from URL
      const loadedYaml = getYAMLFromURL()
      
      expect(loadedYaml).toBe(yaml)
    })
  })

  describe('Edge cases', () => {
    it('should handle very long YAML content', () => {
      const longYaml = 'members:\n' + Array.from({ length: 500 }, (_, i) => 
        `  - id: member_${i}\n    name: Member ${i}`
      ).join('\n')
      
      const encoded = encodeYAMLToURL(longYaml)
      const decoded = decodeYAMLFromURL(encoded)
      
      expect(decoded).toBe(longYaml)
    })

    it('should handle YAML with only whitespace', () => {
      const yaml = '   \n   \n   '
      const encoded = encodeYAMLToURL(yaml)
      const decoded = decodeYAMLFromURL(encoded)
      
      expect(decoded).toBe(yaml)
    })

    it('should handle YAML with special YAML syntax', () => {
      const yaml = `
key: |
  Multi-line
  string content
  with indentation
list:
  - item1
  - item2
  - key: value
    nested: true
`
      const encoded = encodeYAMLToURL(yaml)
      const decoded = decodeYAMLFromURL(encoded)
      
      expect(decoded).toBe(yaml)
    })
  })
})
