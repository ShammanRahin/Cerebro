import { useRef, useCallback, useEffect } from 'react'

/**
 * Detects step boundaries two ways:
 *   1. Automatic — pen-up + PAUSE_MS of inactivity → onStepReady('auto')
 *   2. Manual    — two-finger touch OR Enter key → onStepReady('manual')
 *
 * The callback is stored in a ref so attachToCanvas is stable (called once)
 * but always invokes the latest version of onStepReady.
 */
const PAUSE_MS = 1500

export function useStepBoundary(onStepReady) {
  const timerRef       = useRef(null)
  const hasStrokesRef  = useRef(false)
  // Always-fresh reference — the listener closures read this, never onStepReady directly
  const callbackRef    = useRef(onStepReady)
  useEffect(() => { callbackRef.current = onStepReady }, [onStepReady])

  const cancelTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const scheduleCheck = useCallback(() => {
    cancelTimer()
    if (!hasStrokesRef.current) return
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      callbackRef.current?.('auto')   // always calls the latest handler
    }, PAUSE_MS)
  }, [cancelTimer])

  const triggerNow = useCallback(() => {
    cancelTimer()
    if (!hasStrokesRef.current) return
    callbackRef.current?.('manual')
  }, [cancelTimer])

  // Stable — safe to call once from canvas useEffect
  const attachToCanvas = useCallback((fabricCanvas, canvasEl) => {
    if (!fabricCanvas || !canvasEl) return () => {}

    const onUp   = () => { hasStrokesRef.current = true; scheduleCheck() }
    const onDown = () => cancelTimer()

    fabricCanvas.on('mouse:up',   onUp)
    fabricCanvas.on('mouse:down', onDown)

    const onTouchStart = (e) => {
      if (e.touches && e.touches.length === 2) {
        e.preventDefault()
        hasStrokesRef.current = true
        callbackRef.current?.('manual')
      }
    }
    canvasEl.addEventListener('touchstart', onTouchStart, { passive: false })

    return () => {
      fabricCanvas.off('mouse:up',   onUp)
      fabricCanvas.off('mouse:down', onDown)
      canvasEl.removeEventListener('touchstart', onTouchStart)
      cancelTimer()
    }
  }, [scheduleCheck, cancelTimer]) // scheduleCheck/cancelTimer are stable

  const resetBoundary = useCallback(() => {
    cancelTimer()
    hasStrokesRef.current = false
  }, [cancelTimer])

  useEffect(() => () => cancelTimer(), [cancelTimer])

  return { attachToCanvas, triggerNow, resetBoundary }
}
