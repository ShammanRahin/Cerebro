import { useEffect, useRef, useCallback, useState } from 'react'
import { fabric } from 'fabric'
import { getPage, savePage, addPage, listPages, createSession, getRandomProblem, ocrImage, submitStep } from '../lib/api'
import { useInkStrokes } from '../hooks/useInkStrokes'
import { useStepBoundary } from '../hooks/useStepBoundary'

// ── Constants ──────────────────────────────────────────────────────────────────
const TOOL = { PEN: 'pen', HIGHLIGHTER: 'highlighter', ERASER: 'eraser', SELECT: 'select' }

const PALETTE = [
  { label: 'Ink',     hex: '#1a1a2e' },
  { label: 'Red',     hex: '#dc2626' },
  { label: 'Blue',    hex: '#2563eb' },
  { label: 'Green',   hex: '#16a34a' },
  { label: 'Orange',  hex: '#ea580c' },
  { label: 'Purple',  hex: '#7c3aed' },
  { label: 'Pink',    hex: '#db2777' },
  { label: 'White',   hex: '#f8fafc' },
]

const SIZES = [
  { key: 'XS', pen: 1,  hi: 8  },
  { key: 'S',  pen: 2,  hi: 12 },
  { key: 'M',  pen: 4,  hi: 18 },
  { key: 'L',  pen: 8,  hi: 26 },
]

// ── Pressure-aware PencilBrush ─────────────────────────────────────────────────
function makePressureBrush(canvas, baseWidth, color) {
  const brush = new fabric.PencilBrush(canvas)
  brush.color = color
  brush.width = baseWidth
  return brush
}

// ── CanvasEditor ───────────────────────────────────────────────────────────────
export default function CanvasEditor({ notebookId, notebookName, onBack }) {
  const containerRef = useRef(null)
  const canvasElRef  = useRef(null)
  const fabricRef    = useRef(null)
  const historyRef   = useRef([])
  const historyIdxRef = useRef(-1)
  const pressureRef  = useRef(0.5)
  const isSavingRef  = useRef(false)
  const isDirtyRef   = useRef(false)

  const [tool,        setTool]        = useState(TOOL.PEN)
  const [color,       setColor]       = useState(PALETTE[0].hex)
  const [sizeKey,     setSizeKey]     = useState('S')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages,  setTotalPages]  = useState(1)
  const [saving,      setSaving]      = useState(false)
  const [saved,       setSaved]       = useState(false)
  const [showPages,   setShowPages]   = useState(false)
  const [pageThumbs,  setPageThumbs]  = useState([])
  const [paperStyle,  setPaperStyle]  = useState('dots')
  const [darkCanvas,  setDarkCanvas]  = useState(false)
  const [editingName, setEditingName] = useState(false)

  // ── Phase 2/3: auto-verification state ───────────────────────────────────
  const [sessionId,   setSessionId]   = useState(null)
  const [stepIndex,   setStepIndex]   = useState(0)
  const [stepHistory, setStepHistory] = useState([])
  const [showSteps,   setShowSteps]   = useState(false)
  const [checking,    setChecking]    = useState(false)  // OCR+verify in flight
  const [toast,       setToast]       = useState(null)   // auto-dismiss verdict

  const { attach: attachInk, getStrokes, clearStrokes } = useInkStrokes()

  // Fully automatic: snapshot → OCR → verify → toast (no user interaction)
  const handleStepReady = useCallback(async (_trigger) => {
    const canvas = fabricRef.current
    if (!canvas || checking) return
    const strokes = getStrokes()
    if (strokes.length === 0) return

    const dataUrl = canvas.toDataURL({ format: 'png', quality: 0.92, multiplier: 1.5 })
    setChecking(true)
    setToast(null)

    try {
      // 1. OCR
      let text = ''
      try {
        const { text: t } = await ocrImage(dataUrl)
        text = t ?? ''
      } catch { /* OCR failed — skip silently */ }

      if (!text.trim()) return   // blank canvas, nothing to verify

      // 2. Backend verification (SymPy / Claude)
      if (!sessionId) return
      const step = await submitStep(sessionId, {
        session_id:      sessionId,
        step_index:      stepIndex,
        recognized_text: text,
        strokes_json:    strokes.length ? JSON.stringify(strokes) : null,
      })

      // 3. Record result + clear stroke buffer
      setStepHistory(prev => [...prev, step])
      setStepIndex(i => i + 1)
      clearStrokes()
      resetBoundary()

      // 4. Show toast for 3.5 s then auto-dismiss
      setToast(step)
      setTimeout(() => setToast(null), 3500)

    } catch (err) {
      console.error('Auto-check failed:', err)
    } finally {
      setChecking(false)
    }
  }, [checking, getStrokes, sessionId, stepIndex, clearStrokes])

  const { attachToCanvas: attachBoundary, triggerNow, resetBoundary } = useStepBoundary(handleStepReady)
  // eslint-disable-next-line react-hooks/exhaustive-deps — resetBoundary stable ref

  // ── Canvas init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current
    if (!container || !canvasElRef.current) return

    const canvas = new fabric.Canvas(canvasElRef.current, {
      isDrawingMode: true,
      backgroundColor: '#fefefe',
      selection: false,
      enableRetinaScaling: true,
    })

    // Sizing
    const resize = () => {
      canvas.setWidth(container.clientWidth)
      canvas.setHeight(container.clientHeight)
      canvas.renderAll()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(container)

    // Palm rejection — block touch, allow pen + mouse
    const upper = canvas.upperCanvasEl
    const blockTouch = (e) => {
      if (e.pointerType === 'touch') {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    upper.style.touchAction = 'none'
    upper.addEventListener('pointerdown', blockTouch, { capture: true, passive: false })
    upper.addEventListener('pointermove', blockTouch, { capture: true, passive: false })

    // Track pointer pressure
    const trackPressure = (e) => {
      if (e.pointerType === 'pen' && e.pressure > 0) {
        pressureRef.current = e.pressure
        // Live-update brush width
        const fc = fabricRef.current
        if (fc && fc.freeDrawingBrush && fc.isDrawingMode) {
          const base = SIZES.find(s => s.key === sizeKey)?.pen ?? 2
          fc.freeDrawingBrush.width = Math.max(0.5, base * e.pressure * 2.2)
        }
      }
    }
    upper.addEventListener('pointermove', trackPressure)

    // History on path creation
    const markDirty = () => { isDirtyRef.current = true }
    canvas.on('path:created', () => { pushHistory(); markDirty() })
    canvas.on('object:modified', () => { pushHistory(); markDirty() })

    fabricRef.current = canvas

    // Attach Phase 2 hooks
    const detachInk      = attachInk(canvas)
    const detachBoundary = attachBoundary(canvas, upper)

    return () => {
      ro.disconnect()
      upper.removeEventListener('pointerdown', blockTouch, { capture: true })
      upper.removeEventListener('pointermove', blockTouch, { capture: true })
      upper.removeEventListener('pointermove', trackPressure)
      canvas.off('path:created', pushHistory)
      canvas.off('object:modified', pushHistory)
      detachInk()
      detachBoundary()
      canvas.dispose()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Push state to undo history
  const pushHistory = useCallback(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    const state = JSON.stringify(canvas.toJSON())
    const h = historyRef.current
    const idx = historyIdxRef.current
    historyRef.current = h.slice(0, idx + 1).concat(state)
    historyIdxRef.current = historyRef.current.length - 1
  }, [])

  // ── Bootstrap a practice session (needed for step submission) ────────────
  useEffect(() => {
    async function startSession() {
      try {
        const problem = await getRandomProblem()
        const session = await createSession(problem.id)
        setSessionId(session.id)
      } catch {
        // no problems seeded — session stays null, submit still works via direct API
      }
    }
    startSession()
  }, [notebookId])

  // ── Tool / color / size → brush ───────────────────────────────────────────
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    if (tool === TOOL.SELECT) {
      canvas.isDrawingMode = false
      canvas.selection = true
      return
    }
    canvas.isDrawingMode = true
    canvas.selection = false

    const sz = SIZES.find(s => s.key === sizeKey) ?? SIZES[1]

    if (tool === TOOL.ERASER) {
      // White pen eraser (works on white canvas)
      const bg = darkCanvas ? '#1e1e2e' : '#fefefe'
      const brush = new fabric.PencilBrush(canvas)
      brush.color = bg
      brush.width = sz.hi
      brush.strokeLineCap = 'round'
      canvas.freeDrawingBrush = brush
      return
    }

    const brush = makePressureBrush(
      canvas,
      tool === TOOL.HIGHLIGHTER ? sz.hi : sz.pen,
      tool === TOOL.HIGHLIGHTER ? color + '55' : color,
    )
    brush.strokeLineCap = 'round'
    brush.strokeLineJoin = 'round'
    if (tool === TOOL.HIGHLIGHTER) brush.decimate = 2
    canvas.freeDrawingBrush = brush
  }, [tool, color, sizeKey, darkCanvas])

  // Canvas background color
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    canvas.backgroundColor = darkCanvas ? '#1e1e2e' : '#fefefe'
    canvas.renderAll()
  }, [darkCanvas])

  // ── Page loading ─────────────────────────────────────────────────────────
  useEffect(() => {
    loadPage(currentPage)
  }, [currentPage, notebookId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    listPages(notebookId).then(pages => {
      setTotalPages(pages.length || 1)
      setPageThumbs(pages)
    })
  }, [notebookId])

  const loadPage = async (num) => {
    const canvas = fabricRef.current
    if (!canvas) return
    try {
      const page = await getPage(notebookId, num)
      if (page.canvas_json) {
        canvas.loadFromJSON(page.canvas_json, () => {
          canvas.renderAll()
        })
        historyRef.current = [page.canvas_json]
        historyIdxRef.current = 0
      } else {
        canvas.clear()
        canvas.backgroundColor = darkCanvas ? '#1e1e2e' : '#fefefe'
        canvas.renderAll()
        historyRef.current = []
        historyIdxRef.current = -1
      }
    } catch {
      canvas.clear()
      canvas.backgroundColor = darkCanvas ? '#1e1e2e' : '#fefefe'
      canvas.renderAll()
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const save = useCallback(async (silent = false) => {
    const canvas = fabricRef.current
    if (!canvas || isSavingRef.current) return
    isSavingRef.current = true
    if (!silent) setSaving(true)
    try {
      const json = JSON.stringify(canvas.toJSON(['id']))
      const thumb = canvas.toDataURL({ format: 'png', quality: 0.4, multiplier: 0.15 })
      await savePage(notebookId, currentPage, { canvas_json: json, thumbnail_data: thumb })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      // Refresh thumbnails
      listPages(notebookId).then(pages => {
        setTotalPages(pages.length)
        setPageThumbs(pages)
      })
    } finally {
      isSavingRef.current = false
      if (!silent) setSaving(false)
    }
  }, [notebookId, currentPage])

  // Auto-save every 60s only when dirty
  useEffect(() => {
    const t = setInterval(() => {
      if (isDirtyRef.current) {
        isDirtyRef.current = false
        save(true)
      }
    }, 60000)
    return () => clearInterval(t)
  }, [save])

  // ── Undo / Redo ───────────────────────────────────────────────────────────
  const undo = useCallback(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    const idx = historyIdxRef.current
    if (idx <= 0) {
      canvas.clear()
      canvas.backgroundColor = darkCanvas ? '#1e1e2e' : '#fefefe'
      canvas.renderAll()
      historyIdxRef.current = -1
      return
    }
    historyIdxRef.current = idx - 1
    canvas.loadFromJSON(historyRef.current[historyIdxRef.current], () => canvas.renderAll())
  }, [darkCanvas])

  const redo = useCallback(() => {
    const canvas = fabricRef.current
    const h = historyRef.current
    const idx = historyIdxRef.current
    if (!canvas || idx >= h.length - 1) return
    historyIdxRef.current = idx + 1
    canvas.loadFromJSON(h[historyIdxRef.current], () => canvas.renderAll())
  }, [])

  const clearCanvas = useCallback(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    canvas.clear()
    canvas.backgroundColor = darkCanvas ? '#1e1e2e' : '#fefefe'
    canvas.renderAll()
    pushHistory()
  }, [darkCanvas, pushHistory])

  // ── Page nav ──────────────────────────────────────────────────────────────
  const goToPage = async (num) => {
    if (num === currentPage) return
    await save(true)
    setCurrentPage(num)
  }

  const addNewPage = async () => {
    await save(true)
    const page = await addPage(notebookId)
    setTotalPages(t => t + 1)
    setCurrentPage(page.page_number)
    listPages(notebookId).then(pages => setPageThumbs(pages))
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); redo() }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save() }
      if (e.key === 'p') setTool(TOOL.PEN)
      if (e.key === 'h') setTool(TOOL.HIGHLIGHTER)
      if (e.key === 'e') setTool(TOOL.ERASER)
      if (e.key === 'v') setTool(TOOL.SELECT)
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) triggerNow()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo, save])

  // ── Export as PNG ─────────────────────────────────────────────────────────
  const exportPng = () => {
    const canvas = fabricRef.current
    if (!canvas) return
    const url = canvas.toDataURL({ format: 'png', quality: 1, multiplier: 2 })
    const a = document.createElement('a')
    a.href = url
    a.download = `${notebookName || 'notebook'}-page${currentPage}.png`
    a.click()
  }

  // ── Paper pattern class ───────────────────────────────────────────────────
  const paperClass = {
    dots:  'canvas-paper-dots',
    lines: 'canvas-paper-lines',
    plain: '',
  }[paperStyle]

  return (
    <div className={`flex flex-col h-screen select-none ${darkCanvas ? 'bg-gray-900' : 'bg-gray-100'}`}>

      {/* ── Top toolbar ──────────────────────────────────────────────────── */}
      <div className={`flex items-center gap-2 px-3 py-2 border-b ${darkCanvas ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} shadow-sm z-20 flex-shrink-0`}>

        {/* Back + name */}
        <button
          className={`flex items-center gap-1.5 text-sm font-medium px-2 py-1.5 rounded-lg transition-colors ${darkCanvas ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
          onClick={async () => { await save(true); onBack() }}
        >
          ← Notebooks
        </button>
        <div className={`w-px h-5 ${darkCanvas ? 'bg-gray-700' : 'bg-gray-200'}`} />
        <span className={`text-sm font-semibold ${darkCanvas ? 'text-white' : 'text-gray-800'} min-w-0 truncate max-w-32`}>
          {notebookName}
        </span>

        <div className="flex-1" />

        {/* Drawing tools */}
        <div className={`flex items-center rounded-xl p-1 gap-0.5 ${darkCanvas ? 'bg-gray-700' : 'bg-gray-100'}`}>
          {[
            { t: TOOL.PEN,         icon: '✒️', label: 'Pen (P)' },
            { t: TOOL.HIGHLIGHTER, icon: '🖊', label: 'Highlight (H)' },
            { t: TOOL.ERASER,      icon: '⬜', label: 'Eraser (E)' },
            { t: TOOL.SELECT,      icon: '↖', label: 'Select (V)' },
          ].map(({ t, icon, label }) => (
            <button
              key={t}
              title={label}
              onClick={() => setTool(t)}
              className={`w-8 h-8 rounded-lg text-base flex items-center justify-center transition-colors ${
                tool === t
                  ? 'bg-cerebro-accent text-white shadow-sm'
                  : darkCanvas ? 'text-gray-300 hover:bg-gray-600' : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              {icon}
            </button>
          ))}
        </div>

        <div className={`w-px h-5 ${darkCanvas ? 'bg-gray-700' : 'bg-gray-200'}`} />

        {/* Color palette */}
        <div className="flex items-center gap-1.5">
          {PALETTE.map(({ hex, label }) => (
            <button
              key={hex}
              title={label}
              onClick={() => { setColor(hex); if (tool !== TOOL.PEN && tool !== TOOL.HIGHLIGHTER) setTool(TOOL.PEN) }}
              className={`w-5 h-5 rounded-full transition-transform ${color === hex ? 'scale-125 ring-2 ring-cerebro-accent ring-offset-1' : 'hover:scale-110'} ${
                hex === '#f8fafc' ? 'border border-gray-300' : ''
              }`}
              style={{ background: hex }}
            />
          ))}
        </div>

        <div className={`w-px h-5 ${darkCanvas ? 'bg-gray-700' : 'bg-gray-200'}`} />

        {/* Sizes */}
        <div className={`flex items-center rounded-xl p-1 gap-0.5 ${darkCanvas ? 'bg-gray-700' : 'bg-gray-100'}`}>
          {SIZES.map(({ key, pen }) => (
            <button
              key={key}
              title={`Size ${key}`}
              onClick={() => setSizeKey(key)}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                sizeKey === key
                  ? 'bg-cerebro-accent shadow-sm'
                  : darkCanvas ? 'hover:bg-gray-600' : 'hover:bg-gray-200'
              }`}
            >
              <div
                className={`rounded-full ${sizeKey === key ? 'bg-white' : darkCanvas ? 'bg-gray-300' : 'bg-gray-600'}`}
                style={{ width: pen * 2.5 + 1, height: pen * 2.5 + 1 }}
              />
            </button>
          ))}
        </div>

        <div className={`w-px h-5 ${darkCanvas ? 'bg-gray-700' : 'bg-gray-200'}`} />

        {/* Undo / Redo / Clear */}
        <button title="Undo (Ctrl+Z)" onClick={undo}
          className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-colors ${darkCanvas ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}>
          ↩
        </button>
        <button title="Redo (Ctrl+Y)" onClick={redo}
          className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-colors ${darkCanvas ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}>
          ↪
        </button>
        <button title="Clear page" onClick={clearCanvas}
          className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-colors text-red-400 ${darkCanvas ? 'hover:bg-gray-700' : 'hover:bg-red-50'}`}>
          🗑
        </button>

        <div className={`w-px h-5 ${darkCanvas ? 'bg-gray-700' : 'bg-gray-200'}`} />

        {/* Paper style */}
        <select
          value={paperStyle}
          onChange={e => setPaperStyle(e.target.value)}
          className={`text-xs rounded-lg px-2 py-1.5 border transition-colors focus:outline-none ${
            darkCanvas ? 'bg-gray-700 border-gray-600 text-gray-300' : 'bg-gray-100 border-gray-200 text-gray-600'
          }`}
        >
          <option value="dots">Dot grid</option>
          <option value="lines">Lined</option>
          <option value="plain">Plain</option>
        </select>

        {/* Dark mode */}
        <button
          title="Toggle dark canvas"
          onClick={() => setDarkCanvas(v => !v)}
          className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-colors ${darkCanvas ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
        >
          {darkCanvas ? '☀' : '🌙'}
        </button>

        {/* Export */}
        <button title="Export as PNG" onClick={exportPng}
          className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-colors ${darkCanvas ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}>
          ↓
        </button>

        {/* Check step — manual trigger */}
        <button
          title="Check step (Enter / two-finger tap)"
          onClick={triggerNow}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors ${
            darkCanvas
              ? 'border-cerebro-accent/40 text-cerebro-accent hover:bg-cerebro-accent/10'
              : 'border-cerebro-accent/40 text-cerebro-accent hover:bg-cerebro-accent/10'
          }`}
        >
          ✦ Check step
        </button>

        {/* Save */}
        <button
          title="Save (Ctrl+S)"
          onClick={() => save(false)}
          disabled={saving}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
            saved ? 'bg-green-500/20 text-green-500' : 'btn-primary'
          }`}
        >
          {saving ? 'Saving…' : saved ? '✓ Saved' : '↑ Save'}
        </button>

        {/* Steps history toggle */}
        <button
          onClick={() => setShowSteps(v => !v)}
          title="Step history"
          className={`relative w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-colors ${
            showSteps ? 'bg-cerebro-accent text-white' : darkCanvas ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          ✓
          {stepHistory.length > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-cerebro-accent text-white text-[9px] flex items-center justify-center font-bold">
              {stepHistory.length}
            </span>
          )}
        </button>

        {/* Pages toggle */}
        <button
          onClick={() => setShowPages(v => !v)}
          className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-colors ${
            showPages ? 'bg-cerebro-accent text-white' : darkCanvas ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
          }`}
          title="Pages panel"
        >
          ☰
        </button>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Pages sidebar */}
        {showPages && (
          <div className={`w-36 flex-shrink-0 flex flex-col border-r overflow-y-auto ${darkCanvas ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <div className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide ${darkCanvas ? 'text-gray-400' : 'text-gray-500'}`}>
              Pages
            </div>
            {pageThumbs.map((p) => (
              <button
                key={p.page_number}
                onClick={() => goToPage(p.page_number)}
                className={`flex flex-col items-center gap-1 p-2 mx-2 mb-1 rounded-lg transition-colors ${
                  p.page_number === currentPage
                    ? 'bg-cerebro-accent/20 ring-1 ring-cerebro-accent'
                    : darkCanvas ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
                }`}
              >
                <div className={`w-full aspect-[3/4] rounded border ${darkCanvas ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'} overflow-hidden flex items-center justify-center`}>
                  {p.thumbnail_data
                    ? <img src={p.thumbnail_data} alt="" className="w-full h-full object-contain" />
                    : <span className="text-gray-400 text-xs">Empty</span>
                  }
                </div>
                <span className={`text-xs ${p.page_number === currentPage ? 'text-cerebro-accent font-semibold' : darkCanvas ? 'text-gray-400' : 'text-gray-500'}`}>
                  {p.page_number}
                </span>
              </button>
            ))}
            <button
              onClick={addNewPage}
              className={`mx-2 mb-2 mt-1 py-2 rounded-lg text-xs font-medium border-2 border-dashed transition-colors ${
                darkCanvas ? 'border-gray-600 text-gray-400 hover:border-gray-500 hover:bg-gray-700' : 'border-gray-300 text-gray-400 hover:border-cerebro-accent hover:text-cerebro-accent'
              }`}
            >
              + Add page
            </button>
          </div>
        )}

        {/* Canvas container */}
        <div
          ref={containerRef}
          className={`flex-1 relative overflow-hidden ${paperClass}`}
          style={{ background: darkCanvas ? '#1e1e2e' : '#fefefe' }}
        >
          <canvas ref={canvasElRef} className="absolute inset-0" />

          {/* Checking spinner — shows while OCR+verify is running */}
          {checking && (
            <div className={`absolute bottom-16 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium shadow-lg pointer-events-none z-20 ${
              darkCanvas ? 'bg-gray-800/90 text-gray-300 border border-gray-700' : 'bg-white/90 text-gray-600 border border-gray-200'
            } backdrop-blur`}>
              <span className="w-2 h-2 rounded-full bg-cerebro-accent animate-pulse" />
              Checking your work…
            </div>
          )}

          {/* Auto-dismiss verdict toast */}
          {toast && !checking && (() => {
            const cfg = {
              correct:      { bg: 'bg-green-500/15 border-green-500/30', icon: '✓', text: 'text-green-400', label: 'Correct' },
              wrong:        { bg: 'bg-red-500/15 border-red-500/30',     icon: '✗', text: 'text-red-400',   label: 'Wrong'   },
              needs_review: { bg: 'bg-amber-500/15 border-amber-500/30', icon: '~', text: 'text-amber-400', label: 'Review'  },
            }[toast.verdict] ?? { bg: 'bg-gray-500/15 border-gray-500/30', icon: '?', text: 'text-gray-400', label: 'Unknown' }
            return (
              <div className={`absolute bottom-16 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 px-5 py-3 rounded-2xl border shadow-xl pointer-events-none z-20 backdrop-blur min-w-48 max-w-xs text-center ${cfg.bg}`}>
                <div className="flex items-center gap-2">
                  <span className={`text-lg font-bold ${cfg.text}`}>{cfg.icon}</span>
                  <span className={`text-sm font-semibold ${cfg.text}`}>{cfg.label}</span>
                  {toast.confidence != null && (
                    <span className={`text-xs opacity-70 ${cfg.text}`}>{Math.round(toast.confidence * 100)}%</span>
                  )}
                </div>
                <p className={`text-xs font-mono truncate max-w-full ${darkCanvas ? 'text-gray-300' : 'text-gray-600'}`}>
                  {toast.recognized_text}
                </p>
                {toast.hint && (
                  <p className={`text-xs italic ${darkCanvas ? 'text-gray-400' : 'text-gray-500'}`}>
                    💡 {toast.hint}
                  </p>
                )}
              </div>
            )
          })()}

          {/* Verdict dots — one per submitted step, top-right corner */}
          {stepHistory.length > 0 && (
            <div className="absolute top-3 right-3 flex flex-col gap-1 pointer-events-none">
              {stepHistory.slice(-8).map((s, i) => {
                const col = s.verdict === 'correct' ? 'bg-green-500' : s.verdict === 'wrong' ? 'bg-red-500' : 'bg-amber-500'
                return <div key={i} className={`w-2.5 h-2.5 rounded-full ${col} shadow`} title={s.verdict} />
              })}
            </div>
          )}

          {/* Page indicator */}
          <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 px-3 py-1.5 rounded-full text-xs font-medium shadow-lg ${
            darkCanvas ? 'bg-gray-800/80 text-gray-300 backdrop-blur' : 'bg-white/80 text-gray-600 backdrop-blur border border-gray-200'
          }`}>
            <button
              onClick={() => currentPage > 1 && goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="disabled:opacity-30 hover:text-cerebro-accent transition-colors"
            >
              ‹
            </button>
            <span>Page {currentPage} / {totalPages}</span>
            <button
              onClick={() => currentPage < totalPages ? goToPage(currentPage + 1) : addNewPage()}
              className="hover:text-cerebro-accent transition-colors"
            >
              {currentPage === totalPages ? '+' : '›'}
            </button>
          </div>
        </div>

        {/* Step history side panel */}
        {showSteps && (
          <div className={`w-64 flex-shrink-0 flex flex-col border-l overflow-y-auto ${darkCanvas ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <div className={`px-3 py-3 border-b flex items-center justify-between ${darkCanvas ? 'border-gray-700' : 'border-gray-100'}`}>
              <span className={`text-xs font-semibold uppercase tracking-wide ${darkCanvas ? 'text-gray-400' : 'text-gray-500'}`}>
                Steps ({stepHistory.length})
              </span>
              <button onClick={triggerNow} className="text-xs text-cerebro-accent hover:underline">
                + Check now
              </button>
            </div>
            {stepHistory.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                <p className={`text-xs ${darkCanvas ? 'text-gray-500' : 'text-gray-400'}`}>
                  Write a step and pause — it checks automatically.
                  Or press Enter / tap two fingers.
                </p>
              </div>
            ) : (
              <div className="flex-1 p-2 space-y-2">
                {stepHistory.map((step, i) => {
                  const dot = step.verdict === 'correct' ? 'bg-green-500' : step.verdict === 'wrong' ? 'bg-red-500' : 'bg-amber-500'
                  const label = step.verdict === 'correct' ? 'text-green-500' : step.verdict === 'wrong' ? 'text-red-400' : 'text-amber-400'
                  return (
                    <div key={step.id ?? i} className={`rounded-lg p-2.5 border ${darkCanvas ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-100'}`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                        <span className={`text-xs font-medium capitalize ${label}`}>{step.verdict.replace('_', ' ')}</span>
                        <span className={`ml-auto text-xs ${darkCanvas ? 'text-gray-500' : 'text-gray-400'}`}>#{i + 1}</span>
                      </div>
                      <p className={`text-xs leading-relaxed ${darkCanvas ? 'text-gray-300' : 'text-gray-700'}`}>
                        {step.recognized_text}
                      </p>
                      {step.hint && (
                        <p className={`text-xs mt-1.5 italic ${darkCanvas ? 'text-gray-400' : 'text-gray-500'}`}>
                          💡 {step.hint}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
