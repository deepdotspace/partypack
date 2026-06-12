/**
 * App — global providers + shell.
 *
 * Generouted renders this around all routes. Party Pack is fully anonymous and
 * every screen (landing, play, stage, recap) owns its own chrome on the shared
 * Backdrop — there is no nav bar, sign-in button, or scroll-locked shell.
 */

import { Suspense, type ReactNode } from 'react'
import { Outlet } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { DeepSpaceAuthProvider, useAuth } from 'deepspace'
import { RecordProvider, RecordScope } from 'deepspace'
import { ToastProvider } from '../components/ui'
import { APP_NAME, SCOPE_ID } from '../constants'
import { schemas } from '../schemas'
import { Loading } from '../shared/shells'

export default function App() {
  return (
    <ToastProvider>
      <MotionConfig reducedMotion="user">
        <DeepSpaceAuthProvider>
          <AuthBoot>
            {/* data-testid="app-root" is the canonical "app shell mounted" hook
                every test relies on. Don't rename without updating tests. */}
            <div data-testid="app-root" className="min-h-screen text-foreground">
              <Suspense fallback={<Loading />}>
                <Outlet />
              </Suspense>
            </div>
          </AuthBoot>
        </DeepSpaceAuthProvider>
      </MotionConfig>
    </ToastProvider>
  )
}

/**
 * Root error boundary (generouted maps a `Catch` export to the router's
 * ErrorBoundary). Chunk-load failures auto-reload in views.ts before reaching
 * here; this is the friendly face for anything else, styled in-world instead
 * of react-router's default stack-trace screen.
 */
export function Catch() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-velvet px-6 text-center">
      <p className="font-display text-4xl uppercase text-stage" style={{ textShadow: '4px 4px 0 rgba(13,9,33,0.8)' }}>
        Technical difficulties
      </p>
      <p className="max-w-sm font-body text-base text-smoke">
        The show hit a snag. A quick reload usually fixes it, and your seat is saved.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-xl bg-gold px-6 py-3 font-display text-lg uppercase text-velvet"
        >
          Reload
        </button>
        <a href="/" className="rounded-xl border-2 border-smoke/40 px-6 py-3 font-display text-lg uppercase text-stage">
          Go home
        </a>
      </div>
    </div>
  )
}

/** Waits for auth to resolve, then mounts the data layer. Distinct from the SDK's `AuthGate`. */
function AuthBoot({ children }: { children: ReactNode }) {
  const { isLoaded } = useAuth()

  if (!isLoaded) return <Loading />

  return (
    <RecordProvider allowAnonymous>
      <RecordScope roomId={SCOPE_ID} schemas={schemas} appId={APP_NAME}>
        {children}
      </RecordScope>
    </RecordProvider>
  )
}
