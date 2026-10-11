import { useId } from 'react';

/** Transparent local atmosphere; the user's banner stays visible. */
export default function AtmosphereArtwork({ kind, color }: { kind: 'aurora' | 'stars' | 'meteors'; color: string }) {
  const id = `atmosphere-${useId().replace(/:/g, '')}`;
  return <svg className={`atmosphere-artwork atmosphere-${kind}`} viewBox="0 0 640 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id={`${id}-veil`} x1="0" y1="0" x2="0" y2="1"><stop stopColor={color} stopOpacity="0" /><stop offset=".45" stopColor={color} stopOpacity=".24" /><stop offset=".7" stopColor="#94ded0" stopOpacity=".14" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient>
      <linearGradient id={`${id}-trail`}><stop stopColor={color} stopOpacity="0" /><stop offset=".65" stopColor={color} stopOpacity=".4" /><stop offset="1" stopColor="#f2fcf6" /></linearGradient>
      <radialGradient id={`${id}-glow`}><stop stopColor="#f3fff5" stopOpacity=".65" /><stop offset=".25" stopColor={color} stopOpacity=".2" /><stop offset="1" stopColor={color} stopOpacity="0" /></radialGradient>
    </defs>
    {kind === 'aurora' ? [0, 1, 2].map(i => <g key={i} className={`atmosphere-veil veil-${i}`} transform={`translate(${i * 30 - 30} ${i * 12})`}>
      <path d="M-40 106C40 10 108 186 205 57S369 145 444 50S570 81 680 20L680 175C570 233 522 153 449 188S306 173 215 198S71 180-40 240Z" fill={`url(#${id}-veil)`} />
      <path d="M-40 106C40 10 108 186 205 57S369 145 444 50S570 81 680 20" fill="none" stroke={color} strokeWidth="1" opacity=".18" />
    </g>) : <>
      {[[72, 48], [190, 162], [282, 39], [390, 89], [535, 44], [575, 183], [325, 202], [120, 116], [450, 170], [226, 80], [48, 204], [610, 98]].map(([x, y], i) => <g key={i} className={`atmosphere-star star-${i % 3}`}>
        <circle cx={x} cy={y} r={i % 3 === 0 ? 10 : 5} fill={`url(#${id}-glow)`} />
        <circle cx={x} cy={y} r={i % 3 === 0 ? 1.4 : .7} fill="#e8f7ed" />
        {i % 3 === 0 && <path d={`M${x - 3} ${y}h6M${x} ${y - 3}v6`} stroke="#d4f2e1" strokeWidth=".5" opacity=".6" />}
      </g>)}
      {kind === 'meteors' && [[45, 32], [300, 78], [465, 20]].map(([x, y], i) => <g key={i} transform={`translate(${x} ${y}) rotate(28)`}>
        <g className={`atmosphere-meteor meteor-${i}`}><path d="M-85 0Q-40-2 0 0" stroke={`url(#${id}-trail)`} strokeWidth="2" fill="none" /><circle r="2" fill="#f5ffef" /><circle r="8" fill={`url(#${id}-glow)`} /></g>
      </g>)}
    </>}
  </svg>;
}
