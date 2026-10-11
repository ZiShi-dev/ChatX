import type { CSSProperties } from 'react';

// Matching curve topology lets CSS interpolate the flame contour, not just rotate it.
function Flame({ x, y, scale = 1, delay = 0 }: { x: number; y: number; scale?: number; delay?: number }) {
  return <g transform={`translate(${x} ${y}) scale(${scale})`} style={{ '--flame-delay': `${delay}s` } as CSSProperties}>
    <path className="soul-flame soul-fire-contour" d="M10 40C-2 35 0 26 5 21C9 16 3 10 8 3C6 14 17 16 13 23C20 19 14 13 18 9C23 20 21 26 16 31C14 35 16 38 10 40Z" fill="#37cacc" />
    <g transform="translate(3 10) scale(.65 .75)"><path className="soul-flame soul-fire-contour soul-fire-core" d="M10 40C-2 35 0 26 5 21C9 16 3 10 8 3C6 14 17 16 13 23C20 19 14 13 18 9C23 20 21 26 16 31C14 35 16 38 10 40Z" fill="#b8fff0" /></g>
  </g>;
}

/** Two local SVG layers: fire behind the portrait, five carved skulls in front. */
export default function SoulFireArtwork({ layer }: { layer: 'back' | 'front' }) {
  return <svg className={`avatar-artwork soul-fire-artwork soul-fire-${layer}`} viewBox="0 0 120 120" aria-hidden="true">
    {layer === 'back' ? <>
      <path d="M14 41C2 55 7 85 23 95Q60 114 97 95C115 81 117 56 105 41C107 58 99 63 99 71C96 67 99 61 94 57C94 76 80 83 60 84C40 83 24 76 25 58C18 65 24 69 20 75C12 63 18 54 14 41Z" fill="#59e1de" opacity=".8" />
      {[false, true].map(right => <g key={String(right)} transform={right ? 'translate(120 0) scale(-1 1)' : undefined}>
        <Flame x={0} y={29} scale={.65} delay={right ? -.8 : -.2} />
        <Flame x={-2} y={48} scale={.85} delay={right ? -1.7 : -.9} />
        <Flame x={8} y={64} scale={.7} delay={right ? -.4 : -1.4} />
      </g>)}
    </> : <>
      <g fill="#5590a7" stroke="#14282f" strokeWidth=".9" strokeLinejoin="round">
        {[{ x: 14, y: 86, s: .65, r: -12 }, { x: 34, y: 89, s: .86, r: -8 }, { x: 86, y: 89, s: .86, r: 8 }, { x: 106, y: 86, s: .65, r: 12 }, { x: 60, y: 91, s: 1.08, r: 0 }].map(({ x, y, s, r }, index) => <g key={x} transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
          <path d="M-13 2C-17-9-12-18-3-19C1-21 10-18 14-19L10-15C17-9 16-2 13 4L10 6L9 14L5 14L4 17H-5L-6 14H-10L-10 7L-14 5Z" />
          <path d="M-12-4L-9-9M9-12L11-6M-8 3L-11 5M8 4L11 6" fill="none" stroke="#274e60" />
          <path d="M-11-1Q-6-4-3 0L-4 5Q-10 7-11-1ZM3 0Q7-4 11-1Q11 7 4 5Z" fill="#102b33" />
          <path className="soul-eye" d="M-9 0Q-7-2-5 1L-5 4Q-9 5-9 0ZM5 1Q8-2 9 0Q10 5 5 4Z" fill="#75f6ef" stroke="none" />
          <path d="M0 5L-3 10L3 10Z" fill="#14282f" stroke="none" />
          <path d="M-7 12V15M-3 12V17M1 12V17M5 12V15" fill="none" />
          <path d="M-6-15L-4-13L-5-10M5-14L3-12M-1-7L1-5" fill="none" stroke="#345e73" strokeWidth=".7" />
          {index === 4 && <g stroke="none"><Flame x={-8} y={-42} scale={.8} delay={-.6} /></g>}
        </g>)}
      </g>
      <Flame x={34} y={62} scale={.6} delay={-1.2} />
      <Flame x={77} y={62} scale={.6} delay={-.1} />
      {[{ x: 12, y: 46 }, { x: 103, y: 54 }, { x: 45, y: 59 }].map(({ x, y }, i) => <path key={x} className="soul-fire-ember" style={{ '--flame-delay': `${-i * .9}s` } as CSSProperties} d={`M${x} ${y}q-2-3 1-6q4 3 1 6Z`} fill="#affff0" />)}
    </>}
  </svg>;
}
