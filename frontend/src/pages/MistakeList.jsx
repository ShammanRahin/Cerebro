import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMistakes, resolveMistake, getWeakConcepts } from '../lib/api'
import MistakeTree from '../components/MistakeTree'

// Link to the notebook page where a mistake was made (falls back to notebook list)
function mistakeHref(m) {
  if (!m.notebook_id) return '/'
  return `/notebook/${m.notebook_id}?page=${m.page_number || 1}`
}

// Match the subjects returned by classify_subject() in step_checker.py
const SUBJECT_LABELS = {
  algebra:   'Algebra',
  calculus:  'Calculus',
  chemistry: 'Chemistry',
  biology:   'Biology',
  physics:   'Physics',
}

const SUBJECT_COLORS = {
  algebra:   'text-blue-400 bg-blue-400/10 border-blue-400/20',
  calculus:  'text-purple-400 bg-purple-400/10 border-purple-400/20',
  chemistry: 'text-green-400 bg-green-400/10 border-green-400/20',
  biology:   'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  physics:   'text-orange-400 bg-orange-400/10 border-orange-400/20',
}

const ERROR_COLORS = {
  arithmetic:  'bg-red-500/10 text-red-400',
  sign:        'bg-pink-500/10 text-pink-400',
  algebra:     'bg-blue-500/10 text-blue-400',
  conceptual:  'bg-amber-500/10 text-amber-400',
  procedural:  'bg-violet-500/10 text-violet-400',
}

function SubjectBadge({ subject }) {
  const cls = SUBJECT_COLORS[subject] ?? 'text-gray-400 bg-gray-400/10 border-gray-400/20'
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${cls}`}>
      {SUBJECT_LABELS[subject] ?? subject}
    </span>
  )
}

function ErrorBadge({ type }) {
  if (!type) return null
  const cls = ERROR_COLORS[type] ?? 'bg-gray-500/10 text-gray-400'
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>{type}</span>
  )
}

function WeakConcepts({ concepts }) {
  if (!concepts.length) return null
  const max = concepts[0].count

  return (
    <div className="card mb-6">
      <h2 className="text-sm font-semibold text-white mb-3">Weak concepts</h2>
      <div className="space-y-2">
        {concepts.map((c, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="text-xs text-gray-400 w-20 flex-shrink-0 truncate">
              {SUBJECT_LABELS[c.subject] ?? c.subject}
              {c.error_type ? ` / ${c.error_type}` : ''}
            </span>
            <div className="flex-1 bg-gray-700 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full rounded-full bg-cerebro-accent transition-all"
                style={{ width: `${(c.count / max) * 100}%` }}
              />
            </div>
            <span className="text-xs text-gray-500 w-5 text-right">{c.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function MistakeList() {
  const navigate = useNavigate()
  const [mistakes,    setMistakes]    = useState([])
  const [concepts,    setConcepts]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [filterSubject,  setFilterSubject]  = useState('')
  const [filterResolved, setFilterResolved] = useState('false')
  const [revealed,    setRevealed]    = useState({})   // id → bool
  const [view,        setView]        = useState('list')  // 'list' | 'tree'

  async function load() {
    setLoading(true)
    const params = {}
    if (filterSubject)  params.subject  = filterSubject
    if (filterResolved !== '') params.resolved = filterResolved === 'true'
    const [data, weak] = await Promise.all([
      getMistakes(params),
      getWeakConcepts(),
    ])
    setMistakes(data)
    setConcepts(weak)
    setLoading(false)
  }

  useEffect(() => { load() }, [filterSubject, filterResolved])

  async function handleResolve(id) {
    await resolveMistake(id)
    setMistakes(prev => prev.map(m => m.id === id ? { ...m, resolved: true } : m))
  }

  const toggleReveal = (id) =>
    setRevealed(prev => ({ ...prev, [id]: !prev[id] }))

  return (
    <div className={`${view === 'tree' ? 'max-w-6xl' : 'max-w-3xl'} mx-auto p-8 transition-all`}>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Mistakes</h1>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex items-center rounded-lg p-0.5 bg-cerebro-surface border border-cerebro-border">
            {[
              { k: 'list', label: 'List',  icon: '☰' },
              { k: 'tree', label: 'Tree',  icon: '🌳' },
            ].map(({ k, label, icon }) => (
              <button
                key={k}
                onClick={() => setView(k)}
                className={`text-xs px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
                  view === k ? 'bg-cerebro-accent text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                <span>{icon}</span> {label}
              </button>
            ))}
          </div>
          <span className="text-sm text-gray-500">{mistakes.length} entries</span>
        </div>
      </div>

      {view === 'tree' ? (
        <MistakeTree />
      ) : (
      <>
      {/* Weak concepts bar chart */}
      <WeakConcepts concepts={concepts} />

      {/* Filters */}
      <div className="flex gap-3 mb-5">
        <select
          className="bg-cerebro-surface border border-cerebro-border text-sm text-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-cerebro-accent"
          value={filterSubject}
          onChange={e => setFilterSubject(e.target.value)}
        >
          <option value="">All subjects</option>
          {Object.entries(SUBJECT_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        <select
          className="bg-cerebro-surface border border-cerebro-border text-sm text-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-cerebro-accent"
          value={filterResolved}
          onChange={e => setFilterResolved(e.target.value)}
        >
          <option value="false">Open only</option>
          <option value="">All status</option>
          <option value="true">Resolved</option>
        </select>
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : mistakes.length === 0 ? (
        <div className="card text-center py-16 text-gray-500">
          <p className="text-4xl mb-3">✅</p>
          <p className="font-medium text-white">No mistakes here</p>
          <p className="text-sm mt-1">Write something wrong in your notebook and Cerebro will catch it.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {mistakes.map(m => (
            <div key={m.id} className={`card transition-opacity ${m.resolved ? 'opacity-50' : ''}`}>
              {/* Header row */}
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <SubjectBadge subject={m.subject} />
                  <ErrorBadge type={m.error_type} />
                  <span className="text-xs text-gray-600">
                    {new Date(m.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {m.resolved ? (
                    <span className="badge-correct text-xs">resolved</span>
                  ) : (
                    <>
                      <button
                        className="badge-wrong text-xs cursor-pointer hover:opacity-80 transition-opacity"
                        title={m.notebook_id ? 'Open in notebook' : 'Go to notebooks'}
                        onClick={() => navigate(mistakeHref(m))}
                      >
                        open ↗
                      </button>
                      <button
                        className="btn-ghost text-xs py-1 px-2"
                        onClick={() => handleResolve(m.id)}
                      >
                        Resolve ✓
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* The wrong step */}
              <p className="text-sm text-white font-mono bg-gray-800/50 rounded px-2 py-1.5 mb-2">
                {m.recognized_text}
              </p>

              {/* Hint */}
              {m.misconception && (
                <p className="text-xs text-gray-400 italic mb-2">
                  💡 {m.misconception}
                </p>
              )}

              {/* Correct answer reveal */}
              {m.correct_answer && (
                <div>
                  <button
                    onClick={() => toggleReveal(m.id)}
                    className="text-xs text-cerebro-accent hover:opacity-70 transition-opacity font-medium"
                  >
                    {revealed[m.id] ? '▲ Hide answer' : '▼ See correct answer'}
                  </button>
                  {revealed[m.id] && (
                    <p className="mt-1 text-xs font-mono font-semibold px-2 py-1 rounded bg-cerebro-accent/10 text-cerebro-accent border border-cerebro-accent/20">
                      {m.correct_answer}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      </>
      )}
    </div>
  )
}
