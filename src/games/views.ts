/**
 * VIEWS — the client-side dispatch table: game id → lazy Stage / Play view.
 * The route reads `state.game` (or a valid `?g=` on a fresh room) and mounts
 * the matching pair. Total over GameId by construction.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { GameId } from './registry'
import type { GameViewProps } from './roomApi'

type ViewModule = { default: ComponentType<GameViewProps> }

/**
 * lazy() that survives deploys. Chunk filenames are content-hashed, so a tab
 * opened before a deploy asks for chunks that no longer exist and dynamic
 * import throws "Failed to fetch dynamically imported module". One full
 * reload fetches the new index.html with the new chunk graph. The
 * sessionStorage guard stops a reload loop if the failure is real (offline);
 * in that case the error surfaces to the route's Catch boundary.
 */
function lazyWithRetry(load: () => Promise<ViewModule>): LazyExoticComponent<ComponentType<GameViewProps>> {
  return lazy(async () => {
    try {
      const mod = await load()
      sessionStorage.removeItem('partypack.chunk-reload')
      return mod
    } catch (err) {
      if (!sessionStorage.getItem('partypack.chunk-reload')) {
        sessionStorage.setItem('partypack.chunk-reload', '1')
        window.location.reload()
        return new Promise<never>(() => {}) // page is reloading; never settle
      }
      throw err
    }
  })
}

export interface GameViews {
  Stage: LazyExoticComponent<ComponentType<GameViewProps>>
  Play: LazyExoticComponent<ComponentType<GameViewProps>>
}

export const VIEWS: Record<GameId, GameViews> = {
  wisecrack: {
    Stage: lazyWithRetry(() => import('./wisecrack/Stage')),
    Play: lazyWithRetry(() => import('./wisecrack/Play')),
  },
  baloney: {
    Stage: lazyWithRetry(() => import('./baloney/Stage')),
    Play: lazyWithRetry(() => import('./baloney/Play')),
  },
  pitch: {
    Stage: lazyWithRetry(() => import('./pitch/Stage')),
    Play: lazyWithRetry(() => import('./pitch/Play')),
  },
}

/**
 * Warm every game chunk while the visitor reads the landing page, so the
 * HOST/JOIN tap never waits on (or races a deploy of) a network fetch.
 * Failures are ignored — the lazyWithRetry path still covers mount time.
 */
export function prefetchGameChunks(): void {
  const loads = [
    () => import('./wisecrack/Stage'), () => import('./wisecrack/Play'),
    () => import('./baloney/Stage'), () => import('./baloney/Play'),
    () => import('./pitch/Stage'), () => import('./pitch/Play'),
  ]
  const go = () => loads.forEach((l) => void l().catch(() => {}))
  if ('requestIdleCallback' in window) window.requestIdleCallback(go, { timeout: 4000 })
  else setTimeout(go, 1500)
}
