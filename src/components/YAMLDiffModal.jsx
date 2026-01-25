import { useMemo } from 'react'
import { exportToYAML } from '../utils/dataExport'

/**
 * Compare two YAML strings line by line and generate diff with context
 */
const generateDiff = (original, generated) => {
  const originalLines = original.split('\n')
  const generatedLines = generated.split('\n')
  
  const diff = []
  let i = 0
  let j = 0
  
  while (i < originalLines.length || j < generatedLines.length) {
    const origLine = originalLines[i] || ''
    const genLine = generatedLines[j] || ''
    
    if (origLine === genLine) {
      // Unchanged line
      diff.push({ type: 'unchanged', original: origLine, generated: genLine, origLineNum: i + 1, genLineNum: j + 1 })
      i++
      j++
    } else {
      // Find the next matching line to determine if it's changed, added, or removed
      let foundMatch = false
      
      // Look ahead a few lines to find matches
      for (let k = 1; k <= 3; k++) {
        if (originalLines[i + k] === genLine) {
          // Lines were removed from original
          for (let l = 0; l < k; l++) {
            diff.push({ type: 'removed', original: originalLines[i], origLineNum: i + 1 })
            i++
          }
          foundMatch = true
          break
        }
        if (generatedLines[j + k] === origLine) {
          // Lines were added to generated
          for (let l = 0; l < k; l++) {
            diff.push({ type: 'added', generated: generatedLines[j], genLineNum: j + 1 })
            j++
          }
          foundMatch = true
          break
        }
      }
      
      if (!foundMatch) {
        // Changed line (different content at same position)
        if (i < originalLines.length && j < generatedLines.length) {
          diff.push({ type: 'changed', original: origLine, generated: genLine, origLineNum: i + 1, genLineNum: j + 1 })
          i++
          j++
        } else if (i < originalLines.length) {
          diff.push({ type: 'removed', original: origLine, origLineNum: i + 1 })
          i++
        } else {
          diff.push({ type: 'added', generated: genLine, genLineNum: j + 1 })
          j++
        }
      }
    }
  }
  
  return diff
}

const DiffLine = ({ line }) => {
  if (line.type === 'unchanged') {
    return (
      <div className="flex">
        <div className="flex-1 flex">
          <span className="w-12 text-right pr-2 text-gray-400 select-none">{line.origLineNum}</span>
          <span className="flex-1 px-2 font-mono text-xs bg-white">{line.original || ' '}</span>
        </div>
        <div className="flex-1 flex border-l border-gray-200">
          <span className="w-12 text-right pr-2 text-gray-400 select-none">{line.genLineNum}</span>
          <span className="flex-1 px-2 font-mono text-xs bg-white">{line.generated || ' '}</span>
        </div>
      </div>
    )
  }
  
  if (line.type === 'removed') {
    return (
      <div className="flex">
        <div className="flex-1 flex bg-red-50">
          <span className="w-12 text-right pr-2 text-red-600 select-none">{line.origLineNum}</span>
          <span className="flex-1 px-2 font-mono text-xs text-red-900">
            <span className="text-red-600 font-bold">- </span>{line.original || ' '}
          </span>
        </div>
        <div className="flex-1 border-l border-gray-200 bg-gray-50">
          <span className="w-12 text-right pr-2 text-gray-300 select-none"></span>
        </div>
      </div>
    )
  }
  
  if (line.type === 'added') {
    return (
      <div className="flex">
        <div className="flex-1 bg-gray-50">
          <span className="w-12 text-right pr-2 text-gray-300 select-none"></span>
        </div>
        <div className="flex-1 flex border-l border-gray-200 bg-green-50">
          <span className="w-12 text-right pr-2 text-green-600 select-none">{line.genLineNum}</span>
          <span className="flex-1 px-2 font-mono text-xs text-green-900">
            <span className="text-green-600 font-bold">+ </span>{line.generated || ' '}
          </span>
        </div>
      </div>
    )
  }
  
  if (line.type === 'changed') {
    return (
      <div className="flex">
        <div className="flex-1 flex bg-yellow-50">
          <span className="w-12 text-right pr-2 text-yellow-700 select-none">{line.origLineNum}</span>
          <span className="flex-1 px-2 font-mono text-xs text-yellow-900">
            <span className="text-yellow-700 font-bold">~ </span>{line.original || ' '}
          </span>
        </div>
        <div className="flex-1 flex border-l border-gray-200 bg-yellow-50">
          <span className="w-12 text-right pr-2 text-yellow-700 select-none">{line.genLineNum}</span>
          <span className="flex-1 px-2 font-mono text-xs text-yellow-900">
            <span className="text-yellow-700 font-bold">~ </span>{line.generated || ' '}
          </span>
        </div>
      </div>
    )
  }
  
  return null
}

export default function YAMLDiffModal({ originalData, currentData, onClose }) {
  const { diff, stats } = useMemo(() => {
    const orig = exportToYAML(originalData)
    const gen = exportToYAML(currentData)
    const diffData = generateDiff(orig, gen)
    
    const stats = {
      added: diffData.filter(d => d.type === 'added').length,
      removed: diffData.filter(d => d.type === 'removed').length,
      changed: diffData.filter(d => d.type === 'changed').length,
      unchanged: diffData.filter(d => d.type === 'unchanged').length
    }
    
    return { diff: diffData, stats }
  }, [originalData, currentData])

  const hasChanges = stats.added > 0 || stats.removed > 0 || stats.changed > 0

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">YAML Comparison</h2>
              <p className="text-sm text-gray-600 mt-1">
                Original vs Generated Roster
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
              title="Close"
            >
              ×
            </button>
          </div>
          
          {/* Stats */}
          {hasChanges && (
            <div className="flex gap-4 mt-4 text-sm">
              {stats.added > 0 && (
                <span className="px-2 py-1 bg-green-100 text-green-700 rounded font-medium">
                  +{stats.added} added
                </span>
              )}
              {stats.changed > 0 && (
                <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded font-medium">
                  ~{stats.changed} changed
                </span>
              )}
              {stats.removed > 0 && (
                <span className="px-2 py-1 bg-red-100 text-red-700 rounded font-medium">
                  -{stats.removed} removed
                </span>
              )}
            </div>
          )}
        </div>

        {/* Diff Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Column Headers */}
          <div className="flex border-b border-gray-300 bg-gray-100 flex-shrink-0">
            <div className="flex-1 px-4 py-2 font-semibold text-sm text-gray-700 border-r border-gray-300">
              📄 Original
            </div>
            <div className="flex-1 px-4 py-2 font-semibold text-sm text-gray-700">
              ✨ Generated
            </div>
          </div>
          
          {/* Diff Lines */}
          <div className="flex-1 overflow-auto bg-white font-mono text-xs">
            {diff.map((line, idx) => (
              <DiffLine key={idx} line={line} />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between flex-shrink-0">
          <div className="text-sm text-gray-600">
            {hasChanges ? (
              <span>🔍 Review the changes made by roster generation</span>
            ) : (
              <span>✓ No changes detected</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
