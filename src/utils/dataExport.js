import yaml from 'js-yaml'

/**
 * Export current roster data to YAML format
 */
export function exportToYAML(data) {
  if (!data) {
    throw new Error('No data to export')
  }

  try {
    const yamlString = yaml.dump(data, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
      sortKeys: false
    })
    
    return yamlString
  } catch (err) {
    throw new Error(`Failed to convert data to YAML: ${err.message}`)
  }
}

/**
 * Download YAML content as a file
 */
export function downloadYAML(yamlContent, filename = 'roster-data.yaml') {
  const blob = new Blob([yamlContent], { type: 'text/yaml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Copy YAML content to clipboard
 */
export async function copyYAMLToClipboard(yamlContent) {
  try {
    await navigator.clipboard.writeText(yamlContent)
    return true
  } catch (err) {
    throw new Error(`Failed to copy to clipboard: ${err.message}`)
  }
}

/**
 * Save data to localStorage
 */
export function saveToLocalStorage(data, key = 'rosterData') {
  try {
    localStorage.setItem(key, JSON.stringify(data))
    localStorage.setItem(`${key}_timestamp`, new Date().toISOString())
    return true
  } catch (err) {
    console.error('Failed to save to localStorage:', err)
    return false
  }
}

/**
 * Load data from localStorage
 */
export function loadFromLocalStorage(key = 'rosterData') {
  try {
    const data = localStorage.getItem(key)
    const timestamp = localStorage.getItem(`${key}_timestamp`)
    
    if (data) {
      return {
        data: JSON.parse(data),
        timestamp: timestamp ? new Date(timestamp) : null
      }
    }
    return null
  } catch (err) {
    console.error('Failed to load from localStorage:', err)
    return null
  }
}

/**
 * Clear data from localStorage
 */
export function clearLocalStorage(key = 'rosterData') {
  try {
    localStorage.removeItem(key)
    localStorage.removeItem(`${key}_timestamp`)
    return true
  } catch (err) {
    console.error('Failed to clear localStorage:', err)
    return false
  }
}
