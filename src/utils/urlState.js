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
    console.log('[URL Decode] Attempting to decompress:', { 
      length: encoded.length,
      preview: encoded.substring(0, 30) + '...'
    })
    
    // Decompress from Base64
    const decompressed = LZString.decompressFromEncodedURIComponent(encoded)
    
    if (!decompressed) {
      console.error('[URL Decode] Decompression returned null/undefined')
      return null
    }
    
    console.log('[URL Decode] Successfully decompressed:', {
      length: decompressed.length,
      preview: decompressed.substring(0, 100) + '...'
    })
    
    return decompressed
  } catch (error) {
    console.error('[URL Decode] Failed to decode YAML from URL:', error)
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
  try {
    const urlParams = new URLSearchParams(window.location.search)
    const encoded = urlParams.get(URL_PARAM)
    
    console.log('[URL Parse] Checking for config parameter:', {
      hasParam: !!encoded,
      url: window.location.href,
      search: window.location.search
    })
    
    if (encoded) {
      console.log('[URL Parse] Found config parameter, decoding...')
      return decodeYAMLFromURL(encoded)
    }
    
    console.log('[URL Parse] No config parameter found')
    return null
  } catch (error) {
    console.error('[URL Parse] Error parsing URL:', error)
    return null
  }
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
