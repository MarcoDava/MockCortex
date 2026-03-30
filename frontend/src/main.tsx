import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

import { RouterProvider } from 'react-router-dom'
import { router } from './Routes/Routes.tsx'
import { ConvexProvider, ConvexReactClient } from 'convex/react'

// Ensure every browser has a persistent anonymous session ID
if (!localStorage.getItem('mockrot_session_id')) {
  localStorage.setItem('mockrot_session_id', crypto.randomUUID())
}

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null

const app = <RouterProvider router={router} />

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {convex ? <ConvexProvider client={convex}>{app}</ConvexProvider> : app}
  </StrictMode>,
)
