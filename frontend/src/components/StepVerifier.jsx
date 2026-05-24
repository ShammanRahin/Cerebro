import { useState, useEffect } from 'react'
import { ocrImage, submitStep } from '../lib/api'

const VERDICT = {
  correct:      { dot: 'bg-green-500',  ring: 'ring-green-500/30',  bg: 'bg-green-500/10',  text: 'text-green-400',  label: '✓ Correct'      },
  wrong:        { dot: 'bg-red-500',    ring: 'ring-red-500/30',    bg: 'bg-red-500/10',    text: 'text-red-400',    label: '✗ Wrong'        },
  needs_review: { dot: 'bg-amber-500',  ring: 'ring-amber-500/30',  bg: 'bg-amber-500/10',  text: 'text-amber-400',  label: '~ Needs review' },
}

/**
 * StepVerifier — floats over the canvas after a step boundary fires.
 *
 * Flow:
 *  1. Mount → immediately call backend /api/ocr (Claude Haiku vision)
 *  2. Show canvas snapshot + editable OCR text
 *  3. "Submit step" → POST to practice session → show verdict
 */
export default function StepVerifier({
  sessionId,
  stepIndex,
  imageDataUrl,
  strokes,
  darkCanvas,
  onDismiss,
  onSubmitted,
}) {
  const [ocrText,    setOcrText]    = useState('')
  const [ocrConf,    setOcrConf]    = useState(null)
  const [ocrBusy,    setOcrBusy]    = useState(true)
  const [ocrError,   setOcrError]   = useState(null)
  const [editText,   setEditText]   = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [verdict,    setVerdict]    = useState(null)

  // Fire OCR as soon as the panel mounts
  useEffect(() => {
    let cancelled = false
    setOcrBusy(true)
    setOcrError(null)

    ocrImage(imageDataUrl)
      .then(({ text, confidence }) => {
        if (cancelled) return
        setOcrText(text)
        setEditText(text)
        setOcrConf(confidence)
      })
      .catch((err) => {
        if (cancelled) return
        const msg = err?.response?.data?.detail ?? 'OCR failed'
        setOcrError(msg)
        setOcrText('')
        setEditText('')
      })
      .finally(() => { if (!cancelled) setOcrBusy(false) })

    return () => { cancelled = true }
  }, [imageDataUrl])

  async function handleSubmit() {
    if (!editText.trim()) return
    setSubmitting(true)
    try {
      const step = await submitStep(sessionId, {
        session_id:      sessionId,
        step_index:      stepIndex,
        recognized_text: editText.trim(),
        strokes_json:    strokes ? JSON.stringify(strokes) : null,
      })
      setVerdict(step)
      onSubmitted?.(step)
    } catch {
      // keep panel open so user can retry
    } finally {
      setSubmitting(false)
    }
  }

  const vs = verdict ? (VERDICT[verdict.verdict] ?? VERDICT.needs_review) : null

  const surface = darkCanvas
    ? 'bg-gray-900/96 border-gray-700 text-white'
    : 'bg-white/96 border-gray-200 text-gray-900'

  const muted = darkCanvas ? 'text-gray-400' : 'text-gray-500'
  const inputCls = darkCanvas
    ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-600 focus:border-cerebro-accent'
    : 'bg-gray-50 border-gray-200 text-gray-800 placeholder-gray-400 focus:border-cerebro-accent'

  return (
    <div className="absolute inset-0 flex items-end justify-center pb-16 pointer-events-none z-30">
      <div className={`pointer-events-auto w-full max-w-md mx-4 rounded-2xl border shadow-2xl backdrop-blur-md ${surface}`}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className={`flex items-center justify-between px-4 py-3 border-b ${darkCanvas ? 'border-gray-700' : 'border-gray-100'}`}>
          <div className="flex items-center gap-2">
            {ocrBusy
              ? <span className="w-2 h-2 rounded-full bg-cerebro-accent animate-pulse" />
              : verdict
                ? <span className={`w-2 h-2 rounded-full ${vs.dot}`} />
                : <span className="w-2 h-2 rounded-full bg-green-400" />
            }
            <span className="text-sm font-semibold">
              {ocrBusy ? 'Reading your work…' : verdict ? 'Result' : 'Step ready'}
            </span>
          </div>
          <button
            onClick={onDismiss}
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs transition-colors ${darkCanvas ? 'text-gray-500 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-100'}`}
          >
            ✕
          </button>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="px-4 py-3 space-y-3">

          {/* Canvas snapshot */}
          <div className={`rounded-xl overflow-hidden border ${darkCanvas ? 'border-gray-700' : 'border-gray-100'}`}
            style={{ background: darkCanvas ? '#1e1e2e' : '#fefefe' }}>
            <img
              src={imageDataUrl}
              alt="your work"
              className="w-full max-h-32 object-contain"
            />
          </div>

          {/* ── OCR result + edit ──────────────────────────────────────── */}
          {!verdict && (
            <>
              {/* Confidence bar */}
              {ocrConf !== null && !ocrBusy && (
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${muted}`}>Confidence</span>
                  <div className="flex-1 h-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${ocrConf > 0.7 ? 'bg-green-500' : ocrConf > 0.4 ? 'bg-amber-400' : 'bg-red-500'}`}
                      style={{ width: `${Math.round(ocrConf * 100)}%` }}
                    />
                  </div>
                  <span className={`text-xs font-medium tabular-nums ${muted}`}>
                    {Math.round(ocrConf * 100)}%
                  </span>
                </div>
              )}

              {/* Error state */}
              {ocrError && (
                <div className="text-xs text-amber-400 bg-amber-500/10 rounded-lg px-3 py-2">
                  ⚠ {ocrError}. Type your step manually below.
                </div>
              )}

              {/* Editable text */}
              <div>
                <label className={`block text-xs mb-1.5 ${muted}`}>
                  {ocrBusy ? 'Reading…' : 'Recognised text — edit if needed'}
                </label>
                <textarea
                  rows={2}
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
                    e.stopPropagation() // don't trigger canvas shortcuts
                  }}
                  placeholder={ocrBusy ? '' : 'What did you write? (e.g. x^2 + 2x = 8)'}
                  disabled={ocrBusy}
                  className={`w-full text-sm rounded-xl px-3 py-2.5 border resize-none focus:outline-none transition-colors ${inputCls}`}
                />
                <p className={`text-[11px] mt-1 ${muted}`}>
                  Press Enter to submit · Shift+Enter for newline
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={handleSubmit}
                  disabled={submitting || ocrBusy || !editText.trim()}
                  className="flex-1 btn-primary text-sm py-2"
                >
                  {submitting ? 'Checking…' : 'Submit step →'}
                </button>
                <button
                  onClick={onDismiss}
                  className={`px-4 py-2 rounded-lg text-sm transition-colors ${darkCanvas ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'}`}
                >
                  Skip
                </button>
              </div>
            </>
          )}

          {/* ── Verdict ────────────────────────────────────────────────── */}
          {verdict && vs && (
            <div className={`rounded-xl ring-1 px-4 py-3 ${vs.bg} ${vs.ring}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2.5 h-2.5 rounded-full ${vs.dot} flex-shrink-0`} />
                <span className={`text-sm font-bold ${vs.text}`}>{vs.label}</span>
                {verdict.confidence != null && (
                  <span className={`ml-auto text-xs ${muted}`}>
                    {Math.round(verdict.confidence * 100)}% conf
                  </span>
                )}
              </div>

              {/* The recognised step text */}
              <p className={`text-xs mt-1 font-mono ${darkCanvas ? 'text-gray-300' : 'text-gray-700'}`}>
                {verdict.recognized_text}
              </p>

              {/* Hint from AI */}
              {verdict.hint && (
                <div className={`mt-2 pt-2 border-t text-xs ${darkCanvas ? 'border-gray-700 text-gray-300' : 'border-gray-200 text-gray-600'}`}>
                  💡 <span className="italic">{verdict.hint}</span>
                </div>
              )}

              <button
                onClick={onDismiss}
                className="mt-3 w-full btn-primary text-xs py-1.5"
              >
                Continue writing
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
