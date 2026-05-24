import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getNotebooks, createNotebook, deleteNotebook } from '../lib/api'

const COVER_COLORS = [
  '#6c63ff', '#ef4444', '#f59e0b', '#22c55e',
  '#06b6d4', '#ec4899', '#8b5cf6', '#64748b',
]

function NotebookCard({ notebook, onOpen, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="group relative flex flex-col cursor-pointer" onClick={() => onOpen(notebook.id)}>
      {/* Cover */}
      <div
        className="w-full aspect-[3/4] rounded-2xl shadow-lg transition-transform group-hover:-translate-y-1 group-hover:shadow-xl flex flex-col justify-end p-4"
        style={{ background: `linear-gradient(135deg, ${notebook.cover_color}dd, ${notebook.cover_color}88)` }}
      >
        {/* Binding lines */}
        <div className="absolute left-0 top-0 bottom-0 w-8 rounded-l-2xl flex flex-col justify-center gap-3 px-1.5"
          style={{ background: 'rgba(0,0,0,0.15)' }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-0.5 rounded-full bg-white/30" />
          ))}
        </div>
        <div className="ml-6">
          <p className="text-white font-semibold text-sm leading-tight line-clamp-2">{notebook.name}</p>
          <p className="text-white/60 text-xs mt-1">{notebook.page_count} {notebook.page_count === 1 ? 'page' : 'pages'}</p>
        </div>
      </div>

      {/* Context menu button */}
      <button
        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/20 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs hover:bg-black/40"
        onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v) }}
      >
        ⋯
      </button>

      {menuOpen && (
        <div className="absolute top-10 right-2 bg-cerebro-surface border border-cerebro-border rounded-lg shadow-xl z-10 py-1 min-w-32"
          onClick={e => e.stopPropagation()}>
          <button
            className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-cerebro-border"
            onClick={() => { setMenuOpen(false); onDelete(notebook.id) }}
          >
            Delete
          </button>
        </div>
      )}

      <p className="mt-2 text-xs text-gray-500 text-center">
        {new Date(notebook.updated_at).toLocaleDateString()}
      </p>
    </div>
  )
}

export default function Notebooks() {
  const navigate = useNavigate()
  const [notebooks, setNotebooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(COVER_COLORS[0])

  useEffect(() => {
    getNotebooks().then(setNotebooks).finally(() => setLoading(false))
  }, [])

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    const nb = await createNotebook({ name: newName.trim(), cover_color: newColor })
    setNotebooks(prev => [nb, ...prev])
    setShowNew(false)
    setNewName('')
    navigate(`/notebook/${nb.id}`)
    setCreating(false)
  }

  async function handleDelete(id) {
    await deleteNotebook(id)
    setNotebooks(prev => prev.filter(n => n.id !== id))
  }

  return (
    <div className="min-h-full p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">My Notebooks</h1>
            <p className="text-gray-500 text-sm mt-1">Draw, write, and let Cerebro verify your work</p>
          </div>
          <button className="btn-primary flex items-center gap-2" onClick={() => setShowNew(true)}>
            <span className="text-lg leading-none">+</span> New notebook
          </button>
        </div>

        {/* New notebook modal */}
        {showNew && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowNew(false)}>
            <div className="bg-cerebro-surface border border-cerebro-border rounded-2xl p-6 w-96 shadow-2xl" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-semibold text-white mb-4">New notebook</h2>
              <input
                autoFocus
                className="w-full bg-cerebro-bg border border-cerebro-border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-cerebro-accent mb-4"
                placeholder="Notebook name…"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
              />
              <div className="flex gap-2 mb-5">
                {COVER_COLORS.map(c => (
                  <button
                    key={c}
                    className={`w-8 h-8 rounded-full transition-transform ${newColor === c ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-cerebro-surface' : ''}`}
                    style={{ background: c }}
                    onClick={() => setNewColor(c)}
                  />
                ))}
              </div>
              <div className="flex gap-3">
                <button className="flex-1 btn-primary" onClick={handleCreate} disabled={creating || !newName.trim()}>
                  {creating ? 'Creating…' : 'Create'}
                </button>
                <button className="flex-1 btn-ghost border border-cerebro-border" onClick={() => setShowNew(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-gray-500 text-sm">Loading…</p>
        ) : notebooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="w-24 h-32 rounded-2xl bg-cerebro-surface border-2 border-dashed border-cerebro-border mb-6 flex items-center justify-center">
              <span className="text-3xl">📓</span>
            </div>
            <p className="text-white font-semibold text-lg">No notebooks yet</p>
            <p className="text-gray-500 text-sm mt-1 mb-6">Create your first notebook to start writing</p>
            <button className="btn-primary" onClick={() => setShowNew(true)}>Create notebook</button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
            {notebooks.map(nb => (
              <NotebookCard
                key={nb.id}
                notebook={nb}
                onOpen={id => navigate(`/notebook/${id}`)}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
