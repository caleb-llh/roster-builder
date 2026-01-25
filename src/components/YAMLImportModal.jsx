import { useState, useEffect } from 'react'
import yaml from 'js-yaml'
import CodeMirror from '@uiw/react-codemirror'
import { yaml as yamlLang } from '@codemirror/lang-yaml'
import { runAllValidators } from '../validators'

export default function YAMLImportModal({ onImport, onClose }) {
  const [yamlText, setYamlText] = useState('')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState(null)
  const [validationResult, setValidationResult] = useState(null)
  const [parsedData, setParsedData] = useState(null)

  // Validate YAML in real-time
  useEffect(() => {
    if (!yamlText.trim()) {
      setError(null)
      setValidationResult(null)
      setParsedData(null)
      return
    }

    const validateTimeout = setTimeout(() => {
      try {
        // Try to parse YAML
        const data = yaml.load(yamlText)
        setParsedData(data)
        
        // Run validators
        const validation = runAllValidators(data)
        setValidationResult(validation)
        
        if (!validation.isValid) {
          setError({ type: 'validation', errors: validation.errors })
        } else if (validation.hasWarnings) {
          setError({ type: 'warnings', warnings: validation.warnings })
        } else {
          setError(null)
        }
      } catch (err) {
        setParsedData(null)
        setValidationResult(null)
        setError({ type: 'parse', message: err.message })
      }
    }, 500) // Debounce validation by 500ms

    return () => clearTimeout(validateTimeout)
  }, [yamlText])

  const handleFileUpload = (e) => {
    const file = e.target.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        setYamlText(event.target.result)
      }
      reader.onerror = () => {
        setError({ type: 'load', message: 'Failed to read file' })
      }
      reader.readAsText(file)
    }
  }

  const handleImport = async () => {
    if (!yamlText.trim()) {
      setError({ type: 'empty', message: 'Please paste or upload YAML content' })
      return
    }

    if (validationResult && !validationResult.isValid) {
      // Don't allow import if there are validation errors
      return
    }

    setImporting(true)

    try {
      await onImport(yamlText)
    } catch (err) {
      setError({ type: 'import', message: err.message || 'Failed to import YAML' })
      setImporting(false)
    }
  }

  const handleLoadSample = async () => {
    setImporting(true)
    setError(null)
    
    try {
      // Use import.meta.env.BASE_URL to handle GitHub Pages subdirectory
      const basePath = import.meta.env.BASE_URL || '/'
      const response = await fetch(`${basePath}sample.yaml`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const text = await response.text()
      setYamlText(text)
      setError(null)
      setImporting(false)
    } catch (err) {
      console.error('Failed to load sample:', err)
      setError({ type: 'load', message: 'Failed to load sample file' })
      setImporting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Import Roster Data</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
            title="Close"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">📋 How to Import</h3>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>Paste your YAML content directly into the text area below</li>
              <li>Or upload a .yaml or .yml file from your computer</li>
              <li>Or load an anonymized sample to see the structure</li>
            </ul>
          </div>

          {/* File Upload */}
          <div className="flex gap-3">
            <label className="flex-1">
              <input
                type="file"
                accept=".yaml,.yml"
                onChange={handleFileUpload}
                className="hidden"
                id="yaml-file-upload"
              />
              <div className="px-4 py-3 bg-white border-2 border-dashed border-gray-300 rounded-lg text-center hover:border-blue-400 hover:bg-blue-50/50 transition-colors cursor-pointer">
                <span className="text-gray-700 font-medium">📁 Upload YAML File</span>
              </div>
            </label>
            
            <button
              onClick={handleLoadSample}
              disabled={importing}
              className="px-6 py-3 bg-purple-500 text-white font-medium rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              📄 Load Sample
            </button>
          </div>

          {/* Code Editor */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-semibold text-gray-700">
                YAML Content
              </label>
              {yamlText && (
                <button
                  onClick={() => setYamlText('')}
                  className="px-2 py-1 text-xs font-medium text-gray-600 hover:text-gray-900"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="border border-gray-300 rounded-lg overflow-hidden">
              <CodeMirror
                value={yamlText}
                onChange={(value) => setYamlText(value)}
                extensions={[yamlLang()]}
                placeholder="Paste your YAML content here..."
                height="400px"
                basicSetup={{
                  lineNumbers: true,
                  highlightActiveLineGutter: true,
                  highlightActiveLine: true,
                  foldGutter: true,
                  autocompletion: false,
                  tabSize: 2
                }}
                style={{
                  fontSize: '13px',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
                }}
              />
            </div>
            <div className="mt-2 text-xs text-gray-500">
              {yamlText.length > 0 && `${yamlText.length} characters`}
            </div>
          </div>

          {/* Validation Messages */}
          {error && error.type === 'parse' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <span className="text-red-600 font-bold">❌</span>
                <div className="flex-1">
                  <h4 className="font-semibold text-red-900 mb-1">YAML Syntax Error</h4>
                  <p className="text-sm text-red-700 font-mono">{error.message}</p>
                </div>
              </div>
            </div>
          )}
          
          {error && error.type === 'validation' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-h-60 overflow-y-auto">
              <div className="flex items-start gap-2">
                <span className="text-red-600 font-bold">❌</span>
                <div className="flex-1">
                  <h4 className="font-semibold text-red-900 mb-2">Validation Errors</h4>
                  <ul className="text-sm text-red-700 space-y-1 list-disc list-inside">
                    {error.errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                  <p className="text-xs text-red-600 mt-2 italic">Fix these errors before importing</p>
                </div>
              </div>
            </div>
          )}
          
          {error && error.type === 'warnings' && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 max-h-60 overflow-y-auto">
              <div className="flex items-start gap-2">
                <span className="text-yellow-600 font-bold">⚠️</span>
                <div className="flex-1">
                  <h4 className="font-semibold text-yellow-900 mb-2">Validation Warnings</h4>
                  <ul className="text-sm text-yellow-700 space-y-1 list-disc list-inside">
                    {error.warnings.map((warn, idx) => (
                      <li key={idx}>{warn}</li>
                    ))}
                  </ul>
                  <p className="text-xs text-yellow-600 mt-2 italic">These won't block import, but should be reviewed</p>
                </div>
              </div>
            </div>
          )}
          
          {!error && yamlText.trim() && parsedData && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <span className="text-green-600 font-bold">✓</span>
                <div className="flex-1">
                  <h4 className="font-semibold text-green-900 mb-1">Valid YAML</h4>
                  <p className="text-sm text-green-700">
                    {parsedData.members?.length || 0} members, {parsedData.events?.length || 0} events, {parsedData.roles?.length || 0} roles
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
          <button
            onClick={onClose}
            disabled={importing}
            className="px-6 py-2.5 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={importing || !yamlText.trim() || (validationResult && !validationResult.isValid)}
            className="px-8 py-2.5 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            title={validationResult && !validationResult.isValid ? 'Fix validation errors before importing' : ''}
          >
            {importing ? (
              <>
                <span className="animate-spin">⏳</span>
                <span>Importing...</span>
              </>
            ) : (
              <>
                <span>✓</span>
                <span>Import Data</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
