/** Five carved skulls around the portrait. */
export default function SoulFireArtwork({ layer }: { layer: 'back' | 'front' }) {
  if (layer === 'back') return <svg className="avatar-artwork soul-fire-artwork soul-fire-back" viewBox="0 0 120 120" aria-hidden="true">
    <path d="M22 84Q60 112 98 84" fill="none" stroke="#14282f" strokeWidth="10" strokeLinecap="round" opacity=".28" />
  </svg>;
  return <svg className="avatar-artwork soul-fire-artwork soul-fire-front" viewBox="0 0 120 120" aria-hidden="true">
    <g fill="#5590a7" stroke="#14282f" strokeWidth=".9" strokeLinejoin="round">
      {[{ x: 14, y: 86, s: .65, r: -12 }, { x: 34, y: 89, s: .86, r: -8 }, { x: 86, y: 89, s: .86, r: 8 }, { x: 106, y: 86, s: .65, r: 12 }, { x: 60, y: 91, s: 1.08, r: 0 }].map(({ x, y, s, r }) => <g key={x} transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
        <path d="M-13 2C-17-9-12-18-3-19C1-21 10-18 14-19L10-15C17-9 16-2 13 4L10 6L9 14L5 14L4 17H-5L-6 14H-10L-10 7L-14 5Z" />
        <path d="M-12-4L-9-9M9-12L11-6M-8 3L-11 5M8 4L11 6" fill="none" stroke="#274e60" />
        <path d="M-11-1Q-6-4-3 0L-4 5Q-10 7-11-1ZM3 0Q7-4 11-1Q11 7 4 5Z" fill="#102b33" />
        <path className="soul-eye" d="M-9 0Q-7-2-5 1L-5 4Q-9 5-9 0ZM5 1Q8-2 9 0Q10 5 5 4Z" fill="#75f6ef" stroke="none" />
        <path d="M0 5L-3 10L3 10Z" fill="#14282f" stroke="none" />
        <path d="M-7 12V15M-3 12V17M1 12V17M5 12V15" fill="none" />
        <path d="M-6-15L-4-13L-5-10M5-14L3-12M-1-7L1-5" fill="none" stroke="#345e73" strokeWidth=".7" />
      </g>)}
    </g>
  </svg>;
}
