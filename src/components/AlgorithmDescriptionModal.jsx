export default function AlgorithmDescriptionModal({ description, onContinue, onClose }) {
  // Parse the description to extract sections
  const lines = description.split('\n')
  const introLine = lines[0]
  const sections = []
  let currentSection = null
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    
    if (line.startsWith('✓') || line.startsWith('⚖️') || line.startsWith('👥')) {
      if (currentSection) sections.push(currentSection)
      const [icon, ...titleParts] = line.split(' ')
      currentSection = {
        icon: icon,
        title: titleParts.join(' ').replace(':', ''),
        items: []
      }
    } else if (line.startsWith('•') && currentSection) {
      currentSection.items.push(line.substring(1).trim())
    }
  }
  if (currentSection) sections.push(currentSection)

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] sm:max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center justify-between">
            <div className="flex-1 mr-2">
              <h2 className="text-lg sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
                <span className="text-2xl sm:text-3xl">🤖</span>
                <span className="leading-tight">How the Roster Generator Works</span>
              </h2>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">{introLine}</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 hover:bg-white/60 rounded-full w-10 h-10 flex items-center justify-center transition-all touch-manipulation flex-shrink-0"
            >
              <span className="text-3xl leading-none">×</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5">
          <div className="space-y-4 sm:space-y-5">
            {sections.map((section, idx) => (
              <div key={idx} className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-lg sm:rounded-xl p-4 sm:p-5 border border-gray-200/60 shadow-sm">
                <div className="flex items-start gap-2 sm:gap-3">
                  <span className="text-xl sm:text-2xl flex-shrink-0">{section.icon}</span>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 text-base sm:text-lg mb-2 sm:mb-3">{section.title}</h3>
                    <ul className="space-y-2 sm:space-y-2.5">
                      {section.items.map((item, itemIdx) => (
                        <li key={itemIdx} className="flex items-start gap-2 sm:gap-2.5 text-gray-700">
                          <span className="text-blue-500 font-bold mt-0.5 flex-shrink-0">•</span>
                          <span className="text-xs sm:text-sm leading-relaxed">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}

            {/* How it works summary */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg sm:rounded-xl p-4 sm:p-5 border border-blue-200/60">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2 text-sm sm:text-base">
                <span className="text-lg sm:text-xl">💡</span>
                What happens next:
              </h3>
              <ul className="space-y-2 text-xs sm:text-sm text-gray-700">
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 font-bold mt-0.5 flex-shrink-0">1.</span>
                  <span>The system will find the best match for each open slot</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 font-bold mt-0.5 flex-shrink-0">2.</span>
                  <span>All rules will be strictly followed</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 font-bold mt-0.5 flex-shrink-0">3.</span>
                  <span>Goals will be optimized as best as possible</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 font-bold mt-0.5 flex-shrink-0">4.</span>
                  <span>You'll see the results and can undo if needed</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 bg-gray-50/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <p className="text-xs text-gray-500 text-center sm:text-left">You can always undo after generation</p>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-colors touch-manipulation min-h-[44px]"
            >
              Cancel
            </button>
            <button
              onClick={onContinue}
              className="flex-1 sm:flex-none px-4 sm:px-6 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg shadow-md hover:shadow-lg hover:from-blue-600 hover:to-blue-700 active:scale-95 transition-all flex items-center justify-center gap-2 touch-manipulation min-h-[44px]"
            >
              <span>Continue & Generate</span>
              <span>→</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
