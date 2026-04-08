import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { Auth0Provider } from '@auth0/auth0-react'
import { ConvexReactClient } from 'convex/react'
import { ConvexProviderWithAuth0 } from 'convex/react-auth0'
import './index.css'
import { router } from './Routes/Routes.tsx'
import { ensureAnonymousSession } from './lib/session'

ensureAnonymousSession()

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined
const auth0Domain = import.meta.env.VITE_AUTH0_DOMAIN as string | undefined
const auth0ClientId = import.meta.env.VITE_AUTH0_CLIENT_ID as string | undefined
const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE as string | undefined

const convex = convexUrl ? new ConvexReactClient(convexUrl) : null

const missingConfig = !convex || !auth0Domain || !auth0ClientId

const authApp = missingConfig ? (
  <div className="min-h-screen flex items-center justify-center bg-[#09090b] text-white px-6">
    <div className="max-w-lg rounded-3xl border border-white/10 bg-black/50 p-8 text-center space-y-3">
      <h1 className="text-2xl font-bold">MockCortex auth setup is incomplete</h1>
      <p className="text-sm text-gray-400">
        Set <code>VITE_CONVEX_URL</code>, <code>VITE_AUTH0_DOMAIN</code>, and <code>VITE_AUTH0_CLIENT_ID</code>
        before running the app.
      </p>
    </div>
  </div>
) : (
  <Auth0Provider
    domain={auth0Domain!}
    clientId={auth0ClientId!}
    authorizationParams={{
      redirect_uri: window.location.origin,
      audience: auth0Audience,
    }}
    onRedirectCallback={(appState) => {
      const returnTo =
        typeof appState?.returnTo === 'string' && appState.returnTo.startsWith('/')
          ? appState.returnTo
          : window.location.pathname
      window.location.replace(returnTo)
    }}
    cacheLocation="localstorage"
  >
    <ConvexProviderWithAuth0 client={convex!}>
      <RouterProvider router={router} />
    </ConvexProviderWithAuth0>
  </Auth0Provider>
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>{authApp}</StrictMode>,
)
