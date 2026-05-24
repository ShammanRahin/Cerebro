import { useRef, useCallback } from 'react'

/**
 * Captures raw {x, y, t} stroke data from a Fabric.js canvas.
 * Each "stroke" is one continuous pen-down → pen-up gesture.
 * This data is stored for the Mistake Graph (Phase 5) and sent
 * alongside the OCR'd text when a step is submitted.
 */
export function useInkStrokes() {
  const currentRef = useRef([])      // points in the current in-progress stroke
  const allStrokesRef = useRef([])   // all completed strokes since last clear

  const attach = useCallback((canvas) => {
    if (!canvas) return () => {}

    const onDown = (opt) => {
      currentRef.current = []
      const p = canvas.getPointer(opt.e)
      const pressure = opt.e?.pressure ?? 0.5
      currentRef.current.push({ x: Math.round(p.x), y: Math.round(p.y), t: Date.now(), p: pressure })
    }

    const onMove = (opt) => {
      if (!canvas.isDrawingMode || currentRef.current.length === 0) return
      const p = canvas.getPointer(opt.e)
      const pressure = opt.e?.pressure ?? 0.5
      currentRef.current.push({ x: Math.round(p.x), y: Math.round(p.y), t: Date.now(), p: pressure })
    }

    const onUp = () => {
      if (currentRef.current.length > 1) {
        allStrokesRef.current = [...allStrokesRef.current, { points: [...currentRef.current] }]
      }
      currentRef.current = []
    }

    canvas.on('mouse:down', onDown)
    canvas.on('mouse:move', onMove)
    canvas.on('mouse:up', onUp)

    return () => {
      canvas.off('mouse:down', onDown)
      canvas.off('mouse:move', onMove)
      canvas.off('mouse:up', onUp)
    }
  }, [])

  const getStrokes = useCallback(() => allStrokesRef.current, [])
  const clearStrokes = useCallback(() => { allStrokesRef.current = [] }, [])

  return { attach, getStrokes, clearStrokes }
}
