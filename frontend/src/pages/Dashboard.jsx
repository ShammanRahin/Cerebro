import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts'
import { getWeakConcepts, getStatsBySubject, getMistakes } from '../lib/api'

// Open the notebook page where a mistake was made (falls back to the notebook list)
function mistakeHref(m) {
  if (!m.notebook_id) return '/'
  return `/notebook/${m.notebook_id}?page=${m.page_number || 1}`
}

const SUBJECT_LABELS = {
  math_algebra: 'Algebra',
  math_calculus: 'Calculus',
  chem_equation: 'Chem Eq.',
  chem_concept: 'Chem Concept',
  bio: 'Biology',
  physics: 'Physics',
  other: 'Other',
}

const COLORS = ['#6c63ff', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#a3a3a3']

function StatCard({ label, value, sub }) {
  return (
    <div className="card">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-3xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [weakConcepts, setWeakConcepts] = useState([])
  const [subjectStats, setSubjectStats] = useState([])
  const [recentMistakes, setRecentMistakes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getWeakConcepts(), getStatsBySubject(), getMistakes({ limit: 10 })])
      .then(([wc, ss, rm]) => {
        setWeakConcepts(wc.slice(0, 5))
        setSubjectStats(ss)
        setRecentMistakes(rm)
      })
      .finally(() => setLoading(false))
  }, [])

  const totalMistakes = subjectStats.reduce((s, r) => s + r.total, 0)
  const totalUnresolved = subjectStats.reduce((s, r) => s + r.unresolved, 0)

  const barData = subjectStats.map((r) => ({
    name: SUBJECT_LABELS[r.subject] || r.subject,
    total: r.total,
    unresolved: r.unresolved,
  }))

  const pieData = weakConcepts.map((w) => ({
    name: `${SUBJECT_LABELS[w.subject] || w.subject} · ${w.error_type || 'unknown'}`,
    value: w.count,
  }))

  if (loading) {
    return (
      <div className="p-8 text-gray-500 text-sm">Loading dashboard…</div>
    )
  }

  if (totalMistakes === 0) {
    return (
      <div className="max-w-3xl mx-auto p-8">
        <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
        <div className="card text-center py-16 text-gray-500">
          <p className="text-4xl mb-3">📈</p>
          <p className="font-medium text-white">No data yet</p>
          <p className="text-sm mt-1">Complete some practice problems to see your analytics here.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard label="Total mistakes" value={totalMistakes} />
        <StatCard label="Unresolved" value={totalUnresolved} sub="needs attention" />
        <StatCard label="Resolved" value={totalMistakes - totalUnresolved} sub="great work" />
      </div>

      <div className="grid grid-cols-2 gap-6 mb-8">
        {/* Error by subject bar chart */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wide">Mistakes by subject</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} />
              <Tooltip
                contentStyle={{ background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 8 }}
                labelStyle={{ color: '#e5e7eb' }}
              />
              <Bar dataKey="total" fill="#6c63ff" radius={[4, 4, 0, 0]} name="Total" />
              <Bar dataKey="unresolved" fill="#ef4444" radius={[4, 4, 0, 0]} name="Unresolved" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Weak concepts pie */}
        {pieData.length > 0 && (
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wide">Top weak concepts</h2>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value">
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 8 }}
                  labelStyle={{ color: '#e5e7eb' }}
                />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Recent mistakes */}
      {recentMistakes.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wide">Recent mistakes</h2>
          <div className="space-y-3">
            {recentMistakes.map((m) => (
              <div key={m.id} className="flex items-center gap-3 py-2 border-b border-cerebro-border last:border-0">
                <span className="text-xs text-gray-500 w-20 flex-shrink-0">
                  {SUBJECT_LABELS[m.subject] || m.subject}
                </span>
                <p className="flex-1 text-sm text-gray-300 truncate">{m.recognized_text}</p>
                {m.resolved ? (
                  <span className="badge-correct">resolved</span>
                ) : (
                  <button
                    onClick={() => navigate(mistakeHref(m))}
                    title={m.notebook_id ? 'Open in notebook' : 'Go to notebooks'}
                    className="badge-wrong cursor-pointer hover:opacity-80 transition-opacity"
                  >
                    open ↗
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
