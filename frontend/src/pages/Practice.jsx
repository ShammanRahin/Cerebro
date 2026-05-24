import { useEffect, useState } from 'react'
import { getRandomProblem, createSession, getSessionSteps, submitStep, completeSession } from '../lib/api'
import { usePracticeStore } from '../store'

const SUBJECT_LABELS = {
  math_algebra: 'Algebra',
  math_calculus: 'Calculus',
  chem_equation: 'Chemistry',
  chem_concept: 'Chemistry (Concept)',
  bio: 'Biology',
  physics: 'Physics',
  other: 'General',
}

const SUBJECT_COLORS = {
  math_algebra: 'text-violet-400',
  math_calculus: 'text-blue-400',
  chem_equation: 'text-emerald-400',
  chem_concept: 'text-teal-400',
  bio: 'text-green-400',
  physics: 'text-amber-400',
  other: 'text-gray-400',
}

function VerdictBadge({ verdict }) {
  if (verdict === 'correct') return <span className="badge-correct">● Correct</span>
  if (verdict === 'wrong') return <span className="badge-wrong">● Wrong</span>
  return <span className="badge-review">● Needs Review</span>
}

export default function Practice() {
  const { currentProblem, currentSession, steps, setCurrentProblem, setCurrentSession, addStep, clearSession } =
    usePracticeStore()

  const [stepText, setStepText] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingProblem, setLoadingProblem] = useState(false)
  const [completed, setCompleted] = useState(false)

  async function loadNewProblem() {
    setLoadingProblem(true)
    clearSession()
    setCompleted(false)
    try {
      const problem = await getRandomProblem()
      setCurrentProblem(problem)
      const session = await createSession(problem.id)
      setCurrentSession(session)
    } catch {
      // no problems seeded yet
    } finally {
      setLoadingProblem(false)
    }
  }

  useEffect(() => {
    loadNewProblem()
  }, [])

  async function handleSubmitStep() {
    if (!stepText.trim() || !currentSession) return
    setLoading(true)
    try {
      const step = await submitStep(currentSession.id, {
        session_id: currentSession.id,
        step_index: steps.length,
        recognized_text: stepText.trim(),
      })
      addStep(step)
      setStepText('')
    } finally {
      setLoading(false)
    }
  }

  async function handleComplete() {
    if (!currentSession) return
    await completeSession(currentSession.id)
    setCompleted(true)
  }

  return (
    <div className="max-w-3xl mx-auto p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Practice</h1>
        <button className="btn-ghost" onClick={loadNewProblem} disabled={loadingProblem}>
          {loadingProblem ? 'Loading…' : 'New problem →'}
        </button>
      </div>

      {/* Problem card */}
      {currentProblem ? (
        <div className="card mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className={`text-xs font-semibold uppercase tracking-wide ${SUBJECT_COLORS[currentProblem.subject]}`}>
              {SUBJECT_LABELS[currentProblem.subject]}
            </span>
            <span className="text-xs text-gray-600">·</span>
            <span className="text-xs text-gray-500 capitalize">{currentProblem.difficulty}</span>
          </div>
          <p className="text-white text-lg leading-relaxed">{currentProblem.statement}</p>
        </div>
      ) : (
        <div className="card mb-6 text-center py-12 text-gray-500">
          {loadingProblem ? 'Loading problem…' : 'No problems found. Run the seed script first.'}
        </div>
      )}

      {/* Canvas placeholder — Phase 2 will replace this with Fabric.js */}
      <div className="card mb-6 border-dashed border-2 border-cerebro-border bg-cerebro-bg flex flex-col items-center justify-center h-48 text-gray-600 select-none">
        <p className="text-sm">Stylus canvas · Phase 2</p>
        <p className="text-xs mt-1">Fabric.js + Google ML Kit OCR coming next</p>
      </div>

      {/* Step input (Phase 1 text mode) */}
      {currentProblem && !completed && (
        <div className="card mb-6">
          <label className="block text-xs text-gray-500 mb-2 uppercase tracking-wide">
            Type your step
          </label>
          <div className="flex gap-3">
            <input
              className="flex-1 bg-cerebro-bg border border-cerebro-border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-cerebro-accent"
              placeholder="e.g. x = (11 - 3) / 2 = 4"
              value={stepText}
              onChange={(e) => setStepText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmitStep()}
            />
            <button className="btn-primary" onClick={handleSubmitStep} disabled={loading || !stepText.trim()}>
              {loading ? '…' : 'Submit'}
            </button>
          </div>
        </div>
      )}

      {/* Step history */}
      {steps.length > 0 && (
        <div className="card mb-6">
          <h2 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wide">Step history</h2>
          <div className="space-y-3">
            {steps.map((step, i) => (
              <div key={step.id} className="flex items-start gap-3">
                <span className="text-xs text-gray-600 mt-0.5 w-5 text-right">{i + 1}</span>
                <div className="flex-1">
                  <p className="text-sm text-white">{step.recognized_text}</p>
                  {step.hint && (
                    <p className="text-xs text-amber-400 mt-1">Hint: {step.hint}</p>
                  )}
                </div>
                <VerdictBadge verdict={step.verdict} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Complete / celebration */}
      {completed ? (
        <div className="card text-center py-8">
          <p className="text-2xl mb-2">🎉</p>
          <p className="text-white font-semibold">Problem complete!</p>
          <p className="text-sm text-gray-500 mt-1">{steps.length} steps submitted</p>
          <button className="btn-primary mt-4" onClick={loadNewProblem}>
            Next problem
          </button>
        </div>
      ) : (
        currentProblem && steps.length > 0 && (
          <button className="btn-ghost w-full text-center" onClick={handleComplete}>
            Mark complete
          </button>
        )
      )}
    </div>
  )
}
