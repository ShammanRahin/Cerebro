import { useRef, useCallback, useEffect } from 'react'

/**
 * Detects step boundaries two ways:
 *   1. Automatic — pen-up + PAUSE_MS of inactivity → onStepReady('auto')
 *   2. Manual    — two-finger touch on canvas → onStepReady('manual')
 *
 * Attach by calling attachToCanvas(fabricCanvas, canvasHTMLElement).
 */
const PAUSE_MS = 1500

export function useStepBoundary(onStepReady) {
  const timerRef = useRef(null)
  const hasStrokesRef = useRef(false)

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
      onStepReady('auto')
    }, PAUSE_MS)
  }, [cancelTimer, onStepReady])

  const triggerNow = useCallback(() => {
    cancelTimer()
    if (!hasStrokesRef.current) return
    onStepReady('manual')
  }, [cancelTimer, onStepReady])

  const attachToCanvas = useCallback((fabricCanvas, canvasEl) => {
    if (!fabricCanvas || !canvasEl) return () => {}

    // Pen-up → start timer
    const onUp = () => {
      hasStrokesRef.current = true
      scheduleCheck()
    }
    // Pen-down → cancel pending timer
    const onDown = () => cancelTimer()

    fabricCanvas.on('mouse:up', onUp)
    fabricCanvas.on('mouse:down', onDown)

    // Two-finger touch → immediate trigger
    const onTouchStart = (e) => {
      if (e.touches && e.touches.length === 2) {
        e.preventDefault()
        triggerNow()
      }
    }
    canvasEl.addEventListener('touchstart', onTouchStart, { passive: false })

    return () => {
      fabricCanvas.off('mouse:up', onUp)
      fabricCanvas.off('mouse:down', onDown)
      canvasEl.removeEventListener('touchstart', onTouchStart)
      cancelTimer()
    }
  }, [scheduleCheck, cancelTimer, triggerNow])

  const resetBoundary = useCallback(() => {
    cancelTimer()
    hasStrokesRef.current = false
  }, [cancelTimer])

  // Cleanup on unmount
  useEffect(() => () => cancelTimer(), [cancelTimer])

  return { attachToCanvas, triggerNow, resetBoundary }
}
