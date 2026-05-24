import { useEffect, useState } from 'react'
import { getMistakes, resolveMistake } from '../lib/api'

const SUBJECT_LABELS = {
  math_algebra: 'Algebra',
  math_calculus: 'Calculus',
  chem_equation: 'Chem Eq.',
  chem_concept: 'Chem Concept',
  bio: 'Biology',
  physics: 'Physics',
  other: 'General',
}

const SUBJECTS = Object.keys(SUBJECT_LABELS)

export default function MistakeList() {
  const [mistakes, setMistakes] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterSubject, setFilterSubject] = useState('')
  const [filterResolved, setFilterResolved] = useState('')

  async function load() {
    setLoading(true)
    const params = {}
    if (filterSubject) params.subject = filterSubject
    if (filterResolved !== '') params.resolved = filterResolved === 'true'
    const data = await getMistakes(params)
    setMistakes(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [filterSubject, filterResolved])

  async function handleResolve(id) {
    await resolveMistake(id)
    setMistakes((prev) => prev.map((m) => m.id === id ? { ...m, resolved: true } : m))
  }

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">Mistakes</h1>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <select
          className="bg-cerebro-surface border border-cerebro-border text-sm text-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-cerebro-accent"
          value={filterSubject}
          onChange={(e) => setFilterSubject(e.target.value)}
        >
          <option value="">All subjects</option>
          {SUBJECTS.map((s) => (
            <option key={s} value={s}>{SUBJECT_LABELS[s]}</option>
          ))}
        </select>

        <select
          className="bg-cerebro-surface border border-cerebro-border text-sm text-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-cerebro-accent"
          value={filterResolved}
          onChange={(e) => setFilterResolved(e.target.value)}
        >
          <option value="">All status</option>
          <option value="false">Unresolved</option>
          <option value="true">Resolved</option>
        </select>
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : mistakes.length === 0 ? (
        <div className="card text-center py-16 text-gray-500">
          <p className="text-4xl mb-3">✅</p>
          <p className="font-medium text-white">No mistakes found</p>
          <p className="text-sm mt-1">Practice more to build your mistake graph.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {mistakes.map((m) => (
            <div key={m.id} className="card">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-cerebro-accent">
                      {SUBJECT_LABELS[m.subject] || m.subject}
                    </span>
                    {m.error_type && (
                      <>
                        <span className="text-gray-600">·</span>
                        <span className="text-xs text-gray-500">{m.error_type}</span>
                      </>
                    )}
                    <span className="text-gray-600">·</span>
                    <span className="text-xs text-gray-600">
                      {new Date(m.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-white truncate">{m.recognized_text}</p>
                  {m.misconception && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{m.misconception}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {m.resolved ? (
                    <span className="badge-correct">resolved</span>
                  ) : (
                    <>
                      <span className="badge-wrong">open</span>
                      <button
                        className="btn-ghost text-xs py-1 px-2"
                        onClick={() => handleResolve(m.id)}
                      >
                        Resolve
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
