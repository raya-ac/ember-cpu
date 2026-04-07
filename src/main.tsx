import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { TetrisGame } from './games/Tetris.tsx'
import { DoomGame } from './games/Doom.tsx'
import { DoomRealGame } from './games/DoomReal.tsx'
import { useState, useEffect } from 'react'

function Router() {
  const [route, setRoute] = useState(window.location.hash || '#/')

  useEffect(() => {
    const handler = () => setRoute(window.location.hash || '#/')
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])

  if (route === '#/tetris') return <TetrisGame />
  if (route === '#/doom') return <DoomRealGame />
  if (route === '#/doom-old') return <DoomGame />
  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router />
  </StrictMode>,
)
