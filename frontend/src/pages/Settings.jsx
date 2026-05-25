import { useSettingsStore } from '../store'

const ALL_SUBJECTS = [
  { key: 'math_algebra', label: 'Algebra' },
  { key: 'math_calculus', label: 'Calculus' },
  { key: 'chem_equation', label: 'Chemistry (equations)' },
  { key: 'chem_concept', label: 'Chemistry (concepts)' },
  { key: 'bio', label: 'Biology' },
  { key: 'physics', label: 'Physics' },
  { key: 'other', label: 'Other' },
]

export default function Settings() {
  const { confidenceThreshold, activeSubjects, setConfidenceThreshold, toggleSubject } = useSettingsStore()

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-8">Settings</h1>

      {/* Confidence threshold */}
      <div className="card mb-6">
        <h2 className="text-sm font-semibold text-white mb-1">Confidence threshold</h2>
        <p className="text-xs text-gray-500 mb-4">
          Steps with confidence below this value render as "needs review" (yellow) instead of "wrong" (red).
        </p>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={confidenceThreshold}
            onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
            className="flex-1 accent-cerebro-accent"
          />
          <span className="text-sm font-mono text-cerebro-accent w-10 text-right">
            {confidenceThreshold.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Subject toggles */}
      <div className="card mb-6">
        <h2 className="text-sm font-semibold text-white mb-1">Active subjects</h2>
        <p className="text-xs text-gray-500 mb-4">
          Disable subjects you don't want Cerebro to check.
        </p>
        <div className="space-y-3">
          {ALL_SUBJECTS.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-3 cursor-pointer group">
              <div
                onClick={() => toggleSubject(key)}
                className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
                  activeSubjects.includes(key) ? 'bg-cerebro-accent' : 'bg-cerebro-border'
                }`}
              >
                <div
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    activeSubjects.includes(key) ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </div>
              <span className="text-sm text-gray-300 group-hover:text-white transition-colors">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* OCR language */}
      <div className="card mb-6 opacity-60">
        <h2 className="text-sm font-semibold text-white mb-1">OCR language</h2>
        <p className="text-xs text-gray-500 mb-3">More languages coming soon.</p>
        <select disabled className="bg-cerebro-bg border border-cerebro-border text-sm text-gray-400 rounded-lg px-3 py-2 cursor-not-allowed">
          <option>English (default)</option>
          <option>Bengali (planned)</option>
        </select>
      </div>
    </div>
  )
}
