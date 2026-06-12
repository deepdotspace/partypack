/**
 * World — the full-bleed colored stage behind a game. Jackbox's language: a
 * strong mid-saturation field with one big graphic motif, so white ContentCards
 * pop against it (quiplash2-vote / fibbage3-board / patentlystupid refs).
 *
 *   indigo-burst — Wisecrack. Deep indigo radial + faint sunburst rays that
 *                  drift in a slow rotation.
 *   gold-dots    — Baloney. Hot gold with a soft ink dot-grid that pans.
 *   blueprint    — Pitch. Drafting-table green with graph-paper grid lines
 *                  (heavier every 4th).
 *   midnight     — the hub's existing LATE NIGHT Backdrop, unchanged.
 *
 * `dim` overlays ~60% ink for Controllers (their world is the same show,
 * turned down so white cards and giant buttons stay the loudest thing).
 * prefers-reduced-motion → all drift is static.
 */
import { memo } from 'react'
import { Backdrop } from './Backdrop'

export type WorldKind = 'indigo-burst' | 'gold-dots' | 'blueprint' | 'midnight'

/**
 * Memoized: the world never changes during a game (kind/dim are stable), so
 * the 500ms socket-tick re-renders of the game tree skip this whole subtree.
 * Its drift animations are CSS keyframes, so re-renders couldn't restart them
 * anyway, but skipping the reconcile keeps tick renders cheap.
 */
export const World = memo(WorldImpl)

function WorldImpl({ kind, dim = false }: { kind: WorldKind; dim?: boolean }) {
  if (kind === 'midnight') {
    return (
      <>
        <Backdrop />
        {dim && <DimLayer />}
      </>
    )
  }
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {kind === 'indigo-burst' && <IndigoBurst />}
      {kind === 'gold-dots' && <GoldDots />}
      {kind === 'blueprint' && <Blueprint />}
      {/* Vignette — edges fall away so center-stage content owns the eye. */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(120% 90% at 50% 42%, transparent 58%, rgba(13, 9, 33, 0.2) 100%)' }}
      />
      {/* Controller scrim — a LIGHT wash so the phone reads a touch calmer than
          the TV while the world stays colorful (white ContentCards carry their
          own contrast; a heavy dark dim turned warm worlds muddy/brown on
          phones). Plain absolute (NOT negative-z): a negative-z child would
          paint UNDER the motif layers in this -z-10 container. */}
      {dim && <div className="absolute inset-0 bg-[rgba(8,8,20,0.14)]" />}
    </div>
  )
}

/** Midnight's dimmer — sits over the Backdrop sibling (same -z-10, later in
 *  DOM), mirroring ControllerShell's existing pattern. */
function DimLayer() {
  return <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-[rgba(6,6,14,0.58)]" />
}

/* ------------------------------------------------------------------ */
/* Motifs                                                              */
/* ------------------------------------------------------------------ */

function IndigoBurst() {
  return (
    <>
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(120% 100% at 50% 38%, #1B2FA8 0%, #16289A 45%, #101E66 100%)' }}
      />
      {/* Sunburst rays: STATIC by design. Animating a full-screen layer
          (even compositor-driven CSS transform) re-composites the whole
          viewport every frame, which measurably janks weak/software-rendered
          GPUs, and at the old 240s/rotation the drift was imperceptible.
          Backgrounds hold still; motion lives in the foreground moments. */}
      <div
        className="absolute left-1/2 top-1/2 h-[150vmax] w-[150vmax]"
        style={{
          transform: 'translate(-50%, -50%)',
          background:
            'repeating-conic-gradient(from 0deg, rgba(255,255,255,0.05) 0deg 7deg, transparent 7deg 16deg)',
        }}
      />
    </>
  )
}

function GoldDots() {
  return (
    <>
      {/* Bright, cheerful sunshine yellow (NOT the old amber, which read brown
          under the controller dim). Warm yellow keeps Baloney's magenta + cyan
          stamps popping (both contrast yellow), and it's the warm member of the
          set against Wisecrack's blue and Pitch's green. */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(130% 110% at 50% 36%, #FFEC86 0%, #FFE05A 55%, #FFD43E 100%)' }}
      />
      {/* Ink dot grid (two offset layers = honeycomb feel). STATIC by design:
          panning a full-screen layer re-composites the viewport every frame
          and measurably janks weak GPUs for a barely-visible drift. */}
      <div
        className="absolute -inset-[120px]"
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(0,0,0,0.06) 11px, transparent 12px), radial-gradient(circle, rgba(0,0,0,0.06) 11px, transparent 12px)',
          backgroundSize: '96px 96px, 96px 96px',
          backgroundPosition: '0 0, 48px 48px',
        }}
      />
    </>
  )
}

function Blueprint() {
  // Graph paper: fine line every 28px, a heavier line every 4th (112px).
  // Static by design — drafting tables don't drift.
  return (
    <>
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(120% 100% at 50% 35%, #2E4A40 0%, #294238 55%, #233B33 100%)' }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: [
            'repeating-linear-gradient(0deg, rgba(255,255,255,0.10) 0 1px, transparent 1px 28px)',
            'repeating-linear-gradient(90deg, rgba(255,255,255,0.10) 0 1px, transparent 1px 28px)',
            'repeating-linear-gradient(0deg, rgba(255,255,255,0.13) 0 2px, transparent 2px 112px)',
            'repeating-linear-gradient(90deg, rgba(255,255,255,0.13) 0 2px, transparent 2px 112px)',
          ].join(', '),
        }}
      />
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Poster thumbnails — the landing tints each poster with its world.   */
/* ------------------------------------------------------------------ */

/**
 * WorldThumb — a small, static, low-opacity slice of a world motif for the
 * landing posters (absolute fill; parent must be relative + overflow-hidden).
 */
export function WorldThumb({ kind, className = '' }: { kind: WorldKind; className?: string }) {
  const style: React.CSSProperties =
    kind === 'indigo-burst'
      ? {
          background:
            'repeating-conic-gradient(from 0deg at 50% 120%, rgba(255,255,255,0.07) 0deg 7deg, transparent 7deg 16deg), radial-gradient(140% 120% at 50% 120%, #1B2FA8 0%, #101E66 70%, transparent 100%)',
        }
      : kind === 'gold-dots'
        ? {
            backgroundImage:
              'radial-gradient(circle, rgba(0,0,0,0.08) 7px, transparent 8px), radial-gradient(circle, rgba(0,0,0,0.08) 7px, transparent 8px), radial-gradient(140% 120% at 50% 120%, #FFE15C 0%, #FBBF1F 70%, transparent 100%)',
            backgroundSize: '64px 64px, 64px 64px, 100% 100%',
            backgroundPosition: '0 0, 32px 32px, 0 0',
          }
        : kind === 'blueprint'
          ? {
              backgroundImage: [
                'repeating-linear-gradient(0deg, rgba(255,255,255,0.10) 0 1px, transparent 1px 22px)',
                'repeating-linear-gradient(90deg, rgba(255,255,255,0.10) 0 1px, transparent 1px 22px)',
                'radial-gradient(140% 120% at 50% 120%, #2E4A40 0%, #233B33 70%, transparent 100%)',
              ].join(', '),
            }
          : { background: 'radial-gradient(140% 120% at 50% 120%, #241544 0%, #15102b 70%, transparent 100%)' }
  return <div aria-hidden className={`pointer-events-none absolute inset-0 ${className}`} style={style} />
}
