import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getNotebook } from '../lib/api'
import CanvasEditor from '../components/CanvasEditor'

export default function NotebookPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [notebook, setNotebook] = useState(null)

  useEffect(() => {
    getNotebook(Number(id)).then(setNotebook).catch(() => navigate('/'))
  }, [id, navigate])

  if (!notebook) {
    return (
      <div className="flex items-center justify-center h-screen bg-cerebro-bg text-gray-500">
        Loading notebook…
      </div>
    )
  }

  return (
    <CanvasEditor
      notebookId={notebook.id}
      notebookName={notebook.name}
      onBack={() => navigate('/')}
    />
  )
}
