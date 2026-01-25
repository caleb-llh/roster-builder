import LZString from 'lz-string'

const URL_PARAM = 'config'

/**
 * Compress and encode YAML data for URL sharing
 */
export function encodeYAMLToURL(yamlText) {
  try {
    // Compress using LZ-String with Base64 encoding for URL safety
    const compressed = LZString.compressToEncodedURIComponent(yamlText)
    return compressed
  } catch (error) {
    console.error('Failed to encode YAML to URL:', error)
    return null
  }
}

/**
 * Decode and decompress YAML data from URL
 */
export function decodeYAMLFromURL(encoded) {
  try {
    // Decompress from Base64
    const decompressed = LZString.decompressFromEncodedURIComponent(encoded)
    return decompressed
  } catch (error) {
    console.error('Failed to decode YAML from URL:', error)
    return null
  }
}

/**
 * Update the browser URL with compressed YAML data
 */
export function updateURLWithYAML(yamlText) {
  const encoded = encodeYAMLToURL(yamlText)
  if (encoded) {
    const url = new URL(window.location.href)
    url.searchParams.set(URL_PARAM, encoded)
    // Update URL without triggering page reload
    window.history.replaceState({}, '', url)
  }
}

/**
 * Get YAML data from current URL
 */
export function getYAMLFromURL() {
  const urlParams = new URLSearchParams(window.location.search)
  const encoded = urlParams.get(URL_PARAM)
  
  if (encoded) {
    return decodeYAMLFromURL(encoded)
  }
  
  return null
}

/**
 * Clear YAML data from URL
 */
export function clearYAMLFromURL() {
  const url = new URL(window.location.href)
  url.searchParams.delete(URL_PARAM)
  window.history.replaceState({}, '', url)
}

/**
 * Generate a shareable URL with the current YAML data
 */
export function generateShareableURL(yamlText) {
  const encoded = encodeYAMLToURL(yamlText)
  if (encoded) {
    const url = new URL(window.location.origin + window.location.pathname)
    url.searchParams.set(URL_PARAM, encoded)
    return url.toString()
  }
  return window.location.origin
}
