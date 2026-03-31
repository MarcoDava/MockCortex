import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

import { RouterProvider } from 'react-router-dom'
import { router } from './Routes/Routes.tsx'
import { ConvexProvider, ConvexReactClient } from 'convex/react'

// Ensure every browser has a persistent anonymous session ID
const existingSession =
  localStorage.getItem('mockcortex_session_id') ??
  localStorage.getItem('mockrot_session_id')

if (!existingSession) {
  localStorage.setItem('mockcortex_session_id', crypto.randomUUID())
} else {
  localStorage.setItem('mockcortex_session_id', existingSession)
}

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null

const app = <RouterProvider router={router} />

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {convex ? <ConvexProvider client={convex}>{app}</ConvexProvider> : app}
  </StrictMode>,
)
