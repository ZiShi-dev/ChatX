/** Two local SVG layers: fire behind the portrait, five carved skulls in front. */
export default function SoulFireArtwork({ layer }: { layer: 'back' | 'front' }) {
  return <svg className={`avatar-artwork soul-fire-artwork soul-fire-${layer}`} viewBox="0 0 120 120" aria-hidden="true">
    {layer === 'back' ? <>
      <path d="M14 41C2 55 7 85 23 95Q60 114 97 95C115 81 117 56 105 41C107 58 99 63 99 71C96 67 99 61 94 57C94 76 80 83 60 84C40 83 24 76 25 58C18 65 24 69 20 75C12 63 18 54 14 41Z" fill="#59e1de" opacity=".8" />
      {[false, true].map(right => <g key={String(right)} transform={right ? 'translate(125 0) scale(-1 1)' : 'translate(-5 0)'}>
        <path className="soul-flame flame-outer" d="M20 94C4 83 5 73 9 64C13 55 6 51 12 43C17 39 13 34 18 30C15 43 24 47 19 58C14 68 21 69 19 77C25 75 25 66 29 65C27 82 35 87 35 96Z" fill="#47d5d5" />
        <path className="soul-flame flame-inner" d="M22 94C13 83 12 79 15 70C19 64 16 57 20 53C18 65 26 69 23 77C21 83 29 84 30 94Z" fill="#a9f5eb" />
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
          {index === 4 && <path className="soul-flame flame-crown" d="M-3-10C-10-15-6-19-8-24C-11-30-6-33-8-37C1-33-4-27 1-24C8-28 2-33 7-36C5-28 12-26 7-20L3-17L1-10L-1-14Z" fill="#8bf4e7" stroke="#3aa9b2" strokeWidth=".7" />}
        </g>)}
      </g>
      <path className="soul-flame flame-wisp" d="M39 88C32 81 41 79 38 72C37 69 40 67 42 65C39 73 49 76 43 83L44 89Z" fill="#61e9e0" />
      <path className="soul-flame flame-wisp wisp-right" d="M82 90C88 82 77 79 81 73C84 68 79 65 79 61C75 69 73 73 78 79C74 83 78 88 82 90Z" fill="#84f4e8" />
    </>}
  </svg>;
}
