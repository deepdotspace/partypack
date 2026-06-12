/**
 * 404 — anything that isn't the landing, a game route, or a recap. Styled onto
 * the shared Backdrop so dead links still feel like the show.
 */
import { Link } from 'react-router-dom'
import { Backdrop } from '../shared/Backdrop'
import { Eyebrow } from '../shared/primitives'

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <Backdrop />
      <Eyebrow color="gold">Nothing on this channel</Eyebrow>
      <h1
        className="mt-2 font-display text-7xl uppercase text-stage"
        style={{ WebkitTextStroke: '3px #0d0921', paintOrder: 'stroke fill', textShadow: '5px 5px 0 rgba(13,9,33,0.85)' }}
      >
        404
      </h1>
      <p className="mt-3 max-w-sm font-body text-smoke">That page isn’t part of the show.</p>
      <Link
        to="/"
        className="mt-8 inline-flex items-center justify-center rounded-[1.25rem] bg-gold px-8 py-4 font-display text-xl uppercase tracking-wide text-velvet transition-transform active:scale-95"
        style={{ boxShadow: 'var(--glow-gold)' }}
      >
        Go home
      </Link>
    </div>
  )
}
