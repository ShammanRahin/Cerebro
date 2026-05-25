import { useEffect, useRef, useState } from 'react'
import { getMistakeGraph, backfillEmbeddings } from '../lib/api'

// Subject → glow color (matches MistakeList palette)
const SUBJECT_COLORS = {
  algebra:   '#60a5fa',
  calculus:  '#c084fc',
  chemistry: '#4ade80',
  biology:   '#34d399',
  physics:   '#fb923c',
}
const DEFAULT_COLOR = '#9ca3af'
const colorFor = (s) => SUBJECT_COLORS[s] ?? DEFAULT_COLOR

export default function MistakeTree() {
  const wrapRef   = useRef(null)
  const canvasRef = useRef(null)
  const simRef    = useRef(null)      // mutable simulation state, never triggers re-render
  const rafRef    = useRef(0)

  const [loading,     setLoading]     = useState(true)
  const [empty,       setEmpty]       = useState(false)
  const [threshold,   setThreshold]   = useState(0.5)
  const [hover,       setHover]       = useState(null)   // { node, x, y }
  const [counts,      setCounts]      = useState({ nodes: 0, edges: 0 })
  const [backfilling, setBackfilling] = useState(false)

  // ── Load graph data ──────────────────────────────────────────────────────
  const loadGraph = () => {
    setLoading(true)
    setEmpty(false)
    return getMistakeGraph(0.35).then(({ nodes, edges }) => {
      if (!nodes.length) { setEmpty(true); setLoading(false); simRef.current = null; return }

      const W = wrapRef.current?.clientWidth  || 800
      const H = wrapRef.current?.clientHeight || 600

      // degree → node radius
      const degree = {}
      edges.forEach(e => {
        degree[e.source] = (degree[e.source] || 0) + 1
        degree[e.target] = (degree[e.target] || 0) + 1
      })

      const simNodes = nodes.map((n, i) => {
        const a = (i / nodes.length) * Math.PI * 2
        const r = 80 + Math.random() * 140
        return {
          ...n,
          x: W / 2 + Math.cos(a) * r,
          y: H / 2 + Math.sin(a) * r,
          vx: 0, vy: 0,
          deg: degree[n.id] || 0,
          radius: 6 + Math.min(14, (degree[n.id] || 0) * 1.6),
          fixed: false,
        }
      })

      simRef.current = {
        nodes: simNodes,
        edges,
        byId: Object.fromEntries(simNodes.map(n => [n.id, n])),
        dragging: null,
        pulse: 0,
      }
      setCounts({ nodes: nodes.length, edges: edges.length })
      setLoading(false)
    }).catch(() => { setEmpty(true); setLoading(false) })
  }

  useEffect(() => { loadGraph() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const handleBackfill = async () => {
    setBackfilling(true)
    try {
      await backfillEmbeddings()
      await loadGraph()
    } finally {
      setBackfilling(false)
    }
  }

  // ── Force simulation + render loop ───────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    const wrap   = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d')

    const fit = () => {
      const dpr = window.devicePixelRatio || 1
      const w = wrap.clientWidth, h = wrap.clientHeight
      canvas.width  = w * dpr
      canvas.height = h * dpr
      canvas.style.width  = w + 'px'
      canvas.style.height = h + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(wrap)

    const tick = () => {
      const sim = simRef.current
      const w = wrap.clientWidth, h = wrap.clientHeight
      ctx.clearRect(0, 0, w, h)

      if (sim) {
        const { nodes, edges, byId } = sim
        sim.pulse += 0.04

        // Physics — only while above visible threshold edges count, but always settle
        const REPULSE = 1400
        const CENTER  = 0.012
        const DAMP    = 0.86

        for (let i = 0; i < nodes.length; i++) {
          const a = nodes[i]
          if (a.fixed) continue
          // centering
          a.vx += (w / 2 - a.x) * CENTER
          a.vy += (h / 2 - a.y) * CENTER
          // repulsion
          for (let j = 0; j < nodes.length; j++) {
            if (i === j) continue
            const b = nodes[j]
            let dx = a.x - b.x, dy = a.y - b.y
            let d2 = dx * dx + dy * dy
            if (d2 < 0.01) { d2 = 0.01; dx = Math.random(); dy = Math.random() }
            const f = REPULSE / d2
            const d = Math.sqrt(d2)
            a.vx += (dx / d) * f
            a.vy += (dy / d) * f
          }
        }
        // spring attraction along edges (only edges >= threshold pull)
        for (const e of edges) {
          if (e.weight < threshold) continue
          const a = byId[e.source], b = byId[e.target]
          if (!a || !b) continue
          const dx = b.x - a.x, dy = b.y - a.y
          const d = Math.sqrt(dx * dx + dy * dy) || 1
          const ideal = 60 + (1 - e.weight) * 160
          const f = (d - ideal) * 0.02 * e.weight
          const fx = (dx / d) * f, fy = (dy / d) * f
          if (!a.fixed) { a.vx += fx; a.vy += fy }
          if (!b.fixed) { b.vx -= fx; b.vy -= fy }
        }
        // integrate
        for (const n of nodes) {
          if (n.fixed) continue
          n.vx *= DAMP; n.vy *= DAMP
          n.x += n.vx * 0.18; n.y += n.vy * 0.18
          n.x = Math.max(20, Math.min(w - 20, n.x))
          n.y = Math.max(20, Math.min(h - 20, n.y))
        }

        // ── draw edges ──
        for (const e of edges) {
          if (e.weight < threshold) continue
          const a = byId[e.source], b = byId[e.target]
          if (!a || !b) continue
          const alpha = Math.min(0.55, (e.weight - 0.3) * 0.9)
          const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y)
          grad.addColorStop(0, colorFor(a.subject))
          grad.addColorStop(1, colorFor(b.subject))
          ctx.strokeStyle = grad
          ctx.globalAlpha = alpha
          ctx.lineWidth = 0.5 + e.weight * 2.5
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.stroke()
        }
        ctx.globalAlpha = 1

        // ── draw nodes ──
        for (const n of nodes) {
          const col = colorFor(n.subject)
          const pr  = 1 + Math.sin(sim.pulse + n.x * 0.01) * 0.12
          const r   = n.radius * (n.resolved ? 0.7 : 1)
          // glow
          ctx.shadowColor = col
          ctx.shadowBlur  = (hover?.node?.id === n.id ? 26 : 14) * pr
          ctx.beginPath()
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
          ctx.fillStyle = n.resolved ? 'rgba(120,120,140,0.5)' : col
          ctx.fill()
          ctx.shadowBlur = 0
          // ring
          ctx.lineWidth = 1.5
          ctx.strokeStyle = 'rgba(255,255,255,0.65)'
          ctx.stroke()
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect() }
  }, [threshold, hover])

  // ── Mouse interaction (hover + drag) ─────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const pos = (e) => {
      const rect = canvas.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }
    const pick = (x, y) => {
      const sim = simRef.current
      if (!sim) return null
      let best = null, bd = 1e9
      for (const n of sim.nodes) {
        const d = (n.x - x) ** 2 + (n.y - y) ** 2
        if (d < bd && d < (n.radius + 8) ** 2) { bd = d; best = n }
      }
      return best
    }

    const onMove = (e) => {
      const { x, y } = pos(e)
      const sim = simRef.current
      if (sim?.dragging) {
        sim.dragging.x = x; sim.dragging.y = y
        sim.dragging.vx = 0; sim.dragging.vy = 0
        return
      }
      const n = pick(x, y)
      setHover(n ? { node: n, x, y } : null)
      canvas.style.cursor = n ? 'grab' : 'default'
    }
    const onDown = (e) => {
      const { x, y } = pos(e)
      const n = pick(x, y)
      if (n && simRef.current) {
        n.fixed = true
        simRef.current.dragging = n
        canvas.style.cursor = 'grabbing'
      }
    }
    const onUp = () => {
      const sim = simRef.current
      if (sim?.dragging) { sim.dragging.fixed = false; sim.dragging = null }
      canvas.style.cursor = 'default'
    }

    canvas.addEventListener('mousemove', onMove)
    canvas.addEventListener('mousedown', onDown)
    window.addEventListener('mouseup', onUp)
    return () => {
      canvas.removeEventListener('mousemove', onMove)
      canvas.removeEventListener('mousedown', onDown)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  return (
    <div className="relative w-full" style={{ height: '70vh' }}>
      {/* Controls */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-3 bg-cerebro-surface/80 backdrop-blur border border-cerebro-border rounded-lg px-3 py-2">
        <span className="text-xs text-gray-400">Similarity ≥</span>
        <input
          type="range" min="0.35" max="0.9" step="0.05"
          value={threshold}
          onChange={e => setThreshold(parseFloat(e.target.value))}
          className="w-28 accent-cerebro-accent"
        />
        <span className="text-xs font-mono text-cerebro-accent w-8">{threshold.toFixed(2)}</span>
        <span className="text-xs text-gray-600">·</span>
        <span className="text-xs text-gray-500">{counts.nodes} nodes · {counts.edges} links</span>
        <span className="text-xs text-gray-600">·</span>
        <button
          onClick={handleBackfill}
          disabled={backfilling}
          title="Embed past mistakes that were saved without a vector so they appear in the tree"
          className="text-xs text-cerebro-accent hover:opacity-70 transition-opacity disabled:opacity-40"
        >
          {backfilling ? 'Syncing…' : '↻ Sync past mistakes'}
        </button>
      </div>

      {/* Legend */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1 bg-cerebro-surface/80 backdrop-blur border border-cerebro-border rounded-lg px-3 py-2">
        {Object.entries(SUBJECT_COLORS).map(([s, c]) => (
          <div key={s} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: c, boxShadow: `0 0 6px ${c}` }} />
            <span className="text-xs text-gray-400 capitalize">{s}</span>
          </div>
        ))}
      </div>

      <div ref={wrapRef} className="w-full h-full rounded-xl overflow-hidden border border-cerebro-border"
           style={{ background: 'radial-gradient(circle at 50% 40%, #1a1a2e 0%, #0f0f1a 100%)' }}>
        <canvas ref={canvasRef} className="block" />
      </div>

      {/* States */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
          Building mistake tree…
        </div>
      )}
      {empty && !loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-gray-500">
          <p className="text-4xl mb-3">🌱</p>
          <p className="font-medium text-white">No embedded mistakes yet</p>
          <p className="text-sm mt-1">Make a few mistakes in your notebook — they'll grow into a tree here.</p>
        </div>
      )}

      {/* Hover tooltip */}
      {hover && (
        <div
          className="absolute z-20 pointer-events-none max-w-xs bg-gray-900/95 border border-cerebro-border rounded-lg px-3 py-2 shadow-xl"
          style={{
            left: Math.min(hover.x + 14, (wrapRef.current?.clientWidth || 800) - 260),
            top:  Math.min(hover.y + 14, (wrapRef.current?.clientHeight || 600) - 120),
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full" style={{ background: colorFor(hover.node.subject) }} />
            <span className="text-xs font-medium capitalize" style={{ color: colorFor(hover.node.subject) }}>
              {hover.node.subject}
            </span>
            {hover.node.error_type && (
              <span className="text-xs text-gray-500">· {hover.node.error_type}</span>
            )}
            {hover.node.resolved && <span className="text-xs text-green-500">· resolved</span>}
          </div>
          <p className="text-xs text-white font-mono break-words">{hover.node.text}</p>
          {hover.node.hint && (
            <p className="text-xs text-gray-400 italic mt-1">💡 {hover.node.hint}</p>
          )}
          {hover.node.correct_answer && (
            <p className="text-xs text-cerebro-accent font-mono mt-1">✓ {hover.node.correct_answer}</p>
          )}
        </div>
      )}
    </div>
  )
}
