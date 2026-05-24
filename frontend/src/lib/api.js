import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// ── Mistakes ──────────────────────────────────────────────────────────────────
export const getMistakes = (params = {}) => api.get('/mistakes/', { params }).then(r => r.data)
export const getMistake = (id) => api.get(`/mistakes/${id}`).then(r => r.data)
export const resolveMistake = (id) => api.post(`/mistakes/${id}/resolve`).then(r => r.data)
export const getWeakConcepts = () => api.get('/mistakes/stats/weak-concepts').then(r => r.data)
export const getStatsBySubject = () => api.get('/mistakes/stats/by-subject').then(r => r.data)

// ── Practice ──────────────────────────────────────────────────────────────────
export const getProblems = (subject) => api.get('/practice/problems', { params: subject ? { subject } : {} }).then(r => r.data)
export const getRandomProblem = (subject) => api.get('/practice/problems/random', { params: subject ? { subject } : {} }).then(r => r.data)
export const getProblem = (id) => api.get(`/practice/problems/${id}`).then(r => r.data)
export const createSession = (problem_id) => api.post('/practice/sessions', { problem_id }).then(r => r.data)
export const completeSession = (session_id) => api.post(`/practice/sessions/${session_id}/complete`).then(r => r.data)
export const getSessionSteps = (session_id) => api.get(`/practice/sessions/${session_id}/steps`).then(r => r.data)
export const submitStep = (session_id, data) => api.post(`/practice/sessions/${session_id}/steps`, data).then(r => r.data)

// ── Notebooks ─────────────────────────────────────────────────────────────────
export const getNotebooks = () => api.get('/notebooks/').then(r => r.data)
export const createNotebook = (data) => api.post('/notebooks/', data).then(r => r.data)
export const getNotebook = (id) => api.get(`/notebooks/${id}`).then(r => r.data)
export const updateNotebook = (id, data) => api.patch(`/notebooks/${id}`, data).then(r => r.data)
export const deleteNotebook = (id) => api.delete(`/notebooks/${id}`).then(r => r.data)

export const listPages = (notebookId) => api.get(`/notebooks/${notebookId}/pages`).then(r => r.data)
export const getPage = (notebookId, pageNum) => api.get(`/notebooks/${notebookId}/pages/${pageNum}`).then(r => r.data)
export const savePage = (notebookId, pageNum, data) => api.put(`/notebooks/${notebookId}/pages/${pageNum}`, data).then(r => r.data)
export const addPage = (notebookId) => api.post(`/notebooks/${notebookId}/pages`).then(r => r.data)
export const deletePage = (notebookId, pageNum) => api.delete(`/notebooks/${notebookId}/pages/${pageNum}`).then(r => r.data)

// ── OCR ───────────────────────────────────────────────────────────────────────
export const ocrImage = (image_data) => api.post('/ocr/', { image_data }).then(r => r.data)

export default api
