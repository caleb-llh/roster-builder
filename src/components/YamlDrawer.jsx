import { useState, useEffect, useRef } from 'react'
import yaml from 'js-yaml'
import CodeMirror from '@uiw/react-codemirror'
import { yaml as yamlLang } from '@codemirror/lang-yaml'

/**
 * Right-hand side drawer hosting an editable YAML pane with two-way binding to
 * the working roster document. It also doubles as the import surface:
 *
 * - When `data` is null (nothing loaded): the editor starts empty and valid
 *   YAML is committed via `onImport(text)` (a fresh session).
 * - When `data` exists: the editor mirrors it live. External edits (generation,
 *   pill edits, drag swaps, undo) refresh the text; valid edits are pushed via
 *   `onReplace(parsed)` and the roster updates in place. While the text is
 *   invalid, the error is shown and the last valid state is kept.
 */
function toYamlText(data) {
  if (!data) return ''
  const { warnings, ...clean } = data
  void warnings
  return yaml.dump(clean, { indent: 2, lineWidth: 120, noRefs: true, sortKeys: false })
}

export default function YamlDrawer({ open, onClose, data, onReplace, onImport }) {
  const [text, setText] = useState(() => toYamlText(data))
  const [errors, setErrors] = useState([])
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)

  // Normalized form of what we last synced/pushed — used to detect genuine
  // external changes and to avoid echoing our own pushes back into the editor.
  const syncedTextRef = useRef(text)

  // UI -> text: refresh from `data` when it changes externally.
  useEffect(() => {
    const next = toYamlText(data)
    if (next !== syncedTextRef.current) {
      syncedTextRef.current = next
      setText(next)
      setErrors([])
      setDirty(false)
    }
  }, [data])

  // text -> UI: debounced parse + validate + push.
  useEffect(() => {
    if (!dirty) return
    const id = setTimeout(async () => {
      if (!text.trim()) {
        setErrors([])
        return
      }
      let parsed
      try {
        parsed = yaml.load(text)
      } catch (err) {
        setErrors([`YAML syntax error: ${err.message}`])
        return
      }

      // Both onReplace (live edit) and onImport (fresh session) return the same
      // async { ok, errors } contract, so they are handled uniformly here.
      const commit = data ? onReplace : (p, raw) => onImport(raw)
      const result = await commit(parsed, text)
      if (result && !result.ok) {
        setErrors(result.errors)
      } else {
        setErrors([])
        if (data) syncedTextRef.current = toYamlText(parsed)
        setDirty(false)
      }
    }, 500)
    return () => clearTimeout(id)
  }, [text, dirty, data, onReplace, onImport])

  const handleEditorChange = (value) => {
    setText(value)
    setDirty(true)
  }

  const handleFileUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => handleEditorChange(ev.target.result)
    reader.onerror = () => setErrors(['Failed to read file'])
    reader.readAsText(file)
  }

  const handleLoadSample = async () => {
    setBusy(true)
    try {
      const basePath = import.meta.env.BASE_URL || '/'
      const response = await fetch(`${basePath}sample.yaml`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      handleEditorChange(await response.text())
    } catch {
      setErrors(['Failed to load sample file'])
    } finally {
      setBusy(false)
    }
  }

  const valid = errors.length === 0
  const status = !data && !text.trim()
    ? 'empty'
    : !valid
      ? 'invalid'
      : dirty
        ? 'editing…'
        : 'in sync'

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
      />

      {/* Drawer */}
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-xl transform flex-col bg-white shadow-2xl transition-transform duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
        role="dialog"
        aria-label="YAML editor"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-gray-900">YAML</h2>
            <span className={`text-xs font-medium ${valid ? 'text-gray-400' : 'text-red-500'}`}>
              ({status})
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-2xl leading-none text-gray-400 hover:text-gray-700"
            title="Close"
          >
            ×
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2">
          <label className="cursor-pointer rounded border border-dashed border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-blue-400 hover:bg-blue-50/50">
            <input type="file" accept=".yaml,.yml" onChange={handleFileUpload} className="hidden" />
            Upload file
          </label>
          <button
            onClick={handleLoadSample}
            disabled={busy}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Load sample
          </button>
          {text && (
            <button
              onClick={() => handleEditorChange('')}
              className="ml-auto px-2 py-1 text-xs font-medium text-gray-500 hover:text-gray-900"
            >
              Clear
            </button>
          )}
        </div>

        {/* Editor */}
        <div className="min-h-0 flex-1 overflow-hidden p-3">
          <div className="h-full overflow-hidden rounded border border-gray-300">
            <CodeMirror
              value={text}
              onChange={handleEditorChange}
              extensions={[yamlLang()]}
              placeholder="Paste YAML, upload a file, or load the sample to begin…"
              height="100%"
              style={{
                height: '100%',
                fontSize: '13px',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              }}
              basicSetup={{
                lineNumbers: true,
                highlightActiveLineGutter: true,
                highlightActiveLine: true,
                foldGutter: true,
                autocompletion: false,
                tabSize: 2,
              }}
            />
          </div>
        </div>

        {/* Validation footer */}
        {!valid && (
          <div className="max-h-48 overflow-y-auto border-t border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <ul className="list-inside list-disc space-y-1">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
            {data && (
              <p className="mt-1 text-xs italic text-red-600">
                The roster keeps its last valid state until the YAML is fixed.
              </p>
            )}
          </div>
        )}
      </aside>
    </>
  )
}
