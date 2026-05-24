import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Notebooks from './pages/Notebooks'
import NotebookPage from './pages/NotebookPage'
import Practice from './pages/Practice'
import Dashboard from './pages/Dashboard'
import MistakeList from './pages/MistakeList'
import Settings from './pages/Settings'

export default function App() {
  return (
    <Routes>
      {/* Full-screen notebook editor — no sidebar */}
      <Route path="/notebook/:id" element={<NotebookPage />} />

      {/* Sidebar layout */}
      <Route path="/" element={<Layout />}>
        <Route index element={<Notebooks />} />
        <Route path="practice" element={<Practice />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="mistakes" element={<MistakeList />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
