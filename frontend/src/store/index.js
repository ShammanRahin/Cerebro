import { create } from 'zustand'

export const useSettingsStore = create((set) => ({
  confidenceThreshold: 0.75,
  activeSubjects: ['math_algebra', 'math_calculus', 'chem_equation', 'chem_concept', 'bio', 'physics', 'other'],
  setConfidenceThreshold: (val) => set({ confidenceThreshold: val }),
  toggleSubject: (subject) =>
    set((s) => ({
      activeSubjects: s.activeSubjects.includes(subject)
        ? s.activeSubjects.filter((x) => x !== subject)
        : [...s.activeSubjects, subject],
    })),
}))

export const usePracticeStore = create((set) => ({
  currentProblem: null,
  currentSession: null,
  steps: [],
  setCurrentProblem: (problem) => set({ currentProblem: problem }),
  setCurrentSession: (session) => set({ currentSession: session }),
  addStep: (step) => set((s) => ({ steps: [...s.steps, step] })),
  clearSession: () => set({ currentProblem: null, currentSession: null, steps: [] }),
}))
