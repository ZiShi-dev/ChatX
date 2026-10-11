import { useId } from 'react';
import type { BannerScene } from '../../lib/profileCosmetics';

const SWORDS = [[170, 130, -32], [230, 96, -18], [285, 79, -6], [355, 79, 6], [410, 96, 18], [470, 130, 32]] as const;
const MOTES = [[139, 60, 2], [209, 168, 1.5], [436, 49, 2], [490, 168, 1.5], [351, 198, 2], [80, 100, 1], [560, 90, 1], [300, 40, 1.2]] as const;
const PETALS = [[70, 36, -18], [150, 88, 14], [220, 24, -8], [290, 110, 22], [370, 42, -16], [450, 96, 8], [520, 28, -24], [580, 128, 6]] as const;
const EMBERS = [[90, 190, 2.2], [160, 210, 1.4], [230, 176, 1.8], [300, 204, 2.6], [370, 168, 1.3], [440, 198, 2], [510, 160, 1.6], [580, 188, 2.4]] as const;

/** Original cultivation artwork, drawn locally and animated with transform/opacity only. */
export default function CultivationScene({ kind }: { kind: BannerScene }) {
  const id = useId().replace(/:/g, '');
  const jade = `cultivation-jade-${id}`, gold = `cultivation-gold-${id}`, halo = `cultivation-halo-${id}`, smoke = `cultivation-smoke-${id}`;
  return <svg className={`cultivation-scene scene-${kind}`} viewBox="0 0 640 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id={`${id}-steel`}><stop stopColor="#306169" /><stop offset=".4" stopColor="#a8d8d4" /><stop offset=".49" stopColor="#f2fff7" /><stop offset=".56" stopColor="#82b5b4" /><stop offset="1" stopColor="#325661" /></linearGradient>
      <linearGradient id={`${id}-wing`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#d5e9d1" stopOpacity=".22" /><stop offset=".5" stopColor="#87bdb0" stopOpacity=".55" /><stop offset="1" stopColor="#243e44" stopOpacity=".8" /></linearGradient>
      <radialGradient id={`${id}-ember`}><stop stopColor="#fff7c9" /><stop offset=".22" stopColor="#ffd58a" /><stop offset=".55" stopColor="#df9955" stopOpacity=".45" /><stop offset="1" stopColor="#c47445" stopOpacity="0" /></radialGradient>
      <linearGradient id={jade} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f6e6b0" /><stop offset=".4" stopColor="#92dbbd" /><stop offset="1" stopColor="#1d6a72" /></linearGradient>
      <linearGradient id={gold} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#fff3cb" /><stop offset=".5" stopColor="#dab66b" /><stop offset="1" stopColor="#927041" /></linearGradient>
      <radialGradient id={halo}><stop stopColor={kind === 'heavenly-tribulation' ? '#d5baff' : '#beeecf'} stopOpacity=".45" /><stop offset="1" stopColor={kind === 'heavenly-tribulation' ? '#9070cc' : '#62beaa'} stopOpacity="0" /></radialGradient>
      <linearGradient id={smoke} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#d3eee2" stopOpacity="0" /><stop offset=".5" stopColor="#a6dccf" stopOpacity=".28" /><stop offset="1" stopColor="#62bea9" stopOpacity="0" /></linearGradient>
    </defs>
    <circle className="cultivation-halo" cx="320" cy="110" r="136" fill={`url(#${halo})`} />
    <g className="cultivation-aura" fill="none" stroke="#b7e3cc">
      <ellipse cx="320" cy="174" rx="176" ry="31" strokeWidth="8" opacity=".08" />
      <ellipse cx="320" cy="174" rx="176" ry="31" strokeWidth="1.5" opacity=".5" />
      <ellipse cx="320" cy="174" rx="142" ry="23" strokeWidth="1" opacity=".3" />
    </g>
    <g className="cultivation-smoke" fill={`url(#${smoke})`}>
      <path className="smoke-ribbon smoke-left" d="M-60 205C40 130 122 219 231 153S360 103 425 133C338 115 306 175 228 191S83 159-60 236Z" />
      <path className="smoke-ribbon smoke-right" d="M700 204C593 124 542 206 429 145S294 101 227 134C311 113 341 173 432 191S569 153 700 234Z" />
      <path className="smoke-ribbon smoke-high" d="M57 102C127 14 177 118 260 65S362 32 393 50C340 39 317 86 260 93S156 54 57 129Z" opacity=".7" />
    </g>
    {kind === 'celestial-dragon' && <g className="celestial-dragon-body">
      <path d="M116 164C169 62 214 187 281 130S382 38 448 89" fill="none" stroke="#0c373e" strokeWidth="25" strokeLinecap="round" />
      <path d="M116 164C169 62 214 187 281 130S382 38 448 89" fill="none" stroke={`url(#${jade})`} strokeWidth="16" strokeLinecap="round" />
      <path d="M116 164C169 62 214 187 281 130S382 38 448 89" fill="none" stroke="#d7e8b9" strokeWidth="3" opacity=".8" />
      <path d="M147 109L149 94L160 105M180 121L192 108L194 132M219 151L230 139L232 155M266 143L265 129L279 134M308 103L304 85L321 92M346 73L346 56L359 68M391 67L399 49L405 69M425 77L438 63L438 85" fill="#d9cf91" stroke="#46746a" strokeWidth="1.5" />
      <path d="M170 109L165 120M204 141L195 148M244 151L245 139M289 123L299 132M328 83L335 93M368 64L370 78M412 69L408 82" stroke="#327575" strokeWidth="2.5" />
      {[[153, 112, -15], [181, 123, 35], [213, 146, 20], [245, 147, -10], [279, 129, -40], [307, 104, -45], [338, 80, -25], [372, 67, 0], [407, 73, 20]].map(([x, y, r]) => <path key={x} d="M-7-4Q0 3 7-4M-6 0Q0 7 6 0M-5 4Q0 10 5 4" transform={`translate(${x} ${y}) rotate(${r})`} fill="none" stroke="#28595d" strokeWidth="1" opacity=".7" />)}
      <path d="M275 127L261 110L245 107M261 110L253 98M323 96L339 116L355 119M339 116L341 127" fill="none" stroke="#97c9a5" strokeWidth="5" strokeLinecap="round" />
      <g className="celestial-dragon-head">
        <path d="M432 73L448 66L462 71L464 81L485 85L489 99L478 110L457 108L445 98L432 91Z" fill={`url(#${jade})`} stroke="#163d43" strokeWidth="2" />
        <path d="M438 74L432 52L442 59L451 74M452 70L457 49L465 43L461 64" fill="none" stroke={`url(#${gold})`} strokeWidth="5" strokeLinecap="round" />
        <path d="M439 65L428 60L431 80L420 83L435 90L428 101L449 103" fill="#a4d4aa" />
        <path d="M454 83L465 82" stroke="#ffe6a2" strokeWidth="4" strokeLinecap="round" />
        <circle cx="461" cy="83" r="2" fill="#173138" />
        <path d="M468 101L486 98M475 105L477 113L481 104" fill="none" stroke="#f8e8be" strokeWidth="2" />
        <path className="dragon-whiskers" d="M484 92Q506 67 519 83T548 86M480 99Q504 116 516 102T547 107" fill="none" stroke="#e4d9a2" strokeWidth="1.5" strokeLinecap="round" />
      </g>
      <path d="M113 166L96 160L98 185L126 174Z" fill="#95b991" />
    </g>}
    {kind === 'sword-domain' && <>
      <g className="sword-seal" fill="none" stroke="#d7c795" opacity=".6">
        <circle cx="320" cy="118" r="83" strokeWidth="1" /><circle cx="320" cy="118" r="69" strokeDasharray="5 9" />
        <ellipse cx="320" cy="118" rx="83" ry="35" strokeWidth="1" />
      </g>
      {SWORDS.map(([x, y, rotation], index) => <g key={index} transform={`translate(${x} ${y}) rotate(${rotation})`}>
        <g className={`immortal-sword sword-${index}`}>
          <path d="M0-73L7-56L4 15H-4L-7-56Z" fill={`url(#${id}-steel)`} stroke="#639996" strokeWidth="1.2" />
          <path d="M-1-49L-2-42L1-35L-1-27L1-20" fill="none" stroke="#d9eecf" strokeWidth=".7" opacity=".7" />
          <path d="M0-70V15" stroke="#fff7d5" strokeWidth="1.4" />
          <path d="M-13 16L-16 22L0 19L16 22L13 16Z" fill={`url(#${gold})`} />
          <path d="M-3 19V41L0 46L3 41V19Z" fill="#355d62" stroke="#dbc892" />
          <path d="M0 46Q-9 58-3 66" fill="none" stroke="#9fd7bd" strokeWidth="2" />
          <path className="sword-tassel" d="M-3 63L-8 77M-3 63L-3 80M-3 63L2 77" fill="none" stroke="#79b7a0" strokeWidth="1.4" />
        </g>
      </g>)}
    </>}
    {kind === 'time-cicada' && <>
      <g className="time-seal" fill="none" stroke="#e1ce8c" opacity=".75">
        <circle cx="320" cy="112" r="80" strokeWidth="1" /><circle cx="320" cy="112" r="69" strokeDasharray="2 12" strokeWidth="3" />
        <path d="M320 28V40M320 184V196M236 112H248M392 112H404M260 52L269 61M371 163L380 172M260 172L269 163M371 61L380 52" strokeWidth="2" />
      </g>
      <g className="gu-cicada">
        <g className="cicada-wing wing-left"><path d="M313 94Q271 36 244 52Q248 111 310 137Z" fill={`url(#${id}-wing)`} stroke="#f0d591" strokeWidth="2" /><path d="M311 101L256 60M301 98L267 104M284 78L279 102M309 121L260 78" fill="none" stroke="#d5daac" strokeWidth="1" /></g>
        <g className="cicada-wing wing-right"><path d="M327 94Q369 36 396 52Q392 111 330 137Z" fill={`url(#${id}-wing)`} stroke="#f0d591" strokeWidth="2" /><path d="M329 101L384 60M339 98L373 104M356 78L361 102M331 121L380 78" fill="none" stroke="#d5daac" strokeWidth="1" /></g>
        <path d="M310 88Q320 75 330 88L329 135L320 158L311 135Z" fill={`url(#${gold})`} stroke="#725f3c" strokeWidth="2" />
        <path d="M313 105H327M312 116H328M313 127H327M315 138H325" stroke="#7e865d" strokeWidth="2" />
        <path d="M314 88L307 73M326 88L333 73M313 109L302 117M327 109L338 117" stroke="#eee0ad" strokeWidth="2" strokeLinecap="round" />
        <circle cx="315" cy="92" r="2.5" fill="#1f4b46" /><circle cx="325" cy="92" r="2.5" fill="#1f4b46" />
      </g>
    </>}
    {kind === 'jade-lotus' && <g className="jade-lotus">
      <ellipse cx="320" cy="170" rx="92" ry="14" fill={`url(#${halo})`} />
      {[-65, -42, -22, 0, 22, 42, 65].map((angle, index) => <g key={angle} transform={`rotate(${angle} 320 158)`}>
        <g className={`lotus-petal petal-${index}`}>
          <path d="M320 163C275 134 290 75 320 42C350 75 365 134 320 163Z" fill={`url(#${jade})`} fillOpacity=".7" stroke="#e6dfac" strokeWidth="1.5" />
          <path d="M320 155Q306 108 320 57" fill="none" stroke="#f2e7bc" strokeWidth="1" opacity=".7" />
          <path d="M313 131Q298 117 303 98M315 114Q303 98 310 82M324 139Q340 119 336 99" fill="none" stroke="#235c62" strokeWidth=".8" opacity=".4" />
        </g>
      </g>)}
      <path d="M255 157Q282 126 320 163Q358 126 385 157Q348 187 320 175Q292 187 255 157Z" fill={`url(#${jade})`} stroke="#d7e6c4" />
      <g className="lotus-pearl"><circle cx="320" cy="137" r="22" fill={`url(#${halo})`} /><circle cx="320" cy="137" r="7" fill={`url(#${gold})`} /></g>
    </g>}
    {kind === 'heavenly-tribulation' && <g className="heavenly-tribulation">
      <g className="storm-clouds" fill="none" stroke="#c3b4ed" strokeLinecap="round">
        <path d="M79 68Q133 27 174 54T257 44M383 44Q430 27 466 53T561 65" strokeWidth="18" opacity=".09" />
        <path d="M79 68Q133 27 174 54T257 44M383 44Q430 27 466 53T561 65" strokeWidth="2" opacity=".4" />
      </g>
      <g className="tribulation-core"><circle cx="320" cy="108" r="52" fill={`url(#${halo})`} /><circle cx="320" cy="108" r="29" fill="none" stroke="#dac6ff" strokeWidth="2" opacity=".6" /><circle cx="320" cy="108" r="10" fill="#ddd1ff" opacity=".65" /></g>
      {['M177 58L159 93L180 89L165 131L193 109L189 148', 'M320 37L300 73L324 66L312 112L340 83L330 139', 'M464 58L444 94L467 87L447 128L480 112L471 150'].map((d, index) => <g className={`tribulation-bolt bolt-${index}`} key={d} fill="none" strokeLinejoin="round">
        <path d={d} stroke="#987cdd" strokeWidth="9" opacity=".13" /><path d={d} stroke="#e7d9ff" strokeWidth="1.8" opacity=".8" />
        <path d={['M159 93L143 101L147 118M189 148L201 163', 'M324 66L348 68L355 83M312 112L295 128L300 141', 'M467 87L485 92L491 107M447 128L432 142'][index]} stroke="#e7d9ff" strokeWidth=".8" opacity=".65" />
      </g>)}
      <g className="storm-orbit" fill="none" stroke="#cbb9ef" opacity=".45"><ellipse cx="320" cy="172" rx="118" ry="20" /><ellipse cx="320" cy="172" rx="90" ry="12" /></g>
    </g>}
    {kind === 'jade-petals' && <g className="jade-petals">
      {PETALS.map(([x, y, rotation], index) => <g key={index} transform={`translate(${x} ${y}) rotate(${rotation})`}>
        <g className={`drift-petal petal-${index}`}>
          <path d="M0 0C6-14 16-8 11 4C7 12 1 9-2 3C-8-5-5-12 0 0Z" fill={`url(#${jade})`} stroke="#e6dfac" strokeWidth="1" />
          <path d="M1-1C4-8 8-4 6 2" fill="none" stroke="#f4ebc4" strokeWidth="1" />
          <path d="M1 1Q5 3 7 7M2 0Q8-2 11-5" fill="none" stroke="#31696a" strokeWidth=".5" opacity=".6" />
        </g>
      </g>)}
    </g>}
    {kind === 'spirit-embers' && <g className="spirit-embers" fill="#f6e0a4">
      {EMBERS.map(([cx, cy, r], index) => <g key={index} className={`ember ember-${index}`}><circle cx={cx} cy={cy} r={r * 5} fill={`url(#${id}-ember)`} /><path d={`M${cx} ${cy + r}q${-r} ${-r * 2} 0 ${-r * 4}q${r * 2} ${r * 3} 0 ${r * 4}Z`} fill="#fff3bf" /></g>)}
    </g>}
    <g className="spirit-particles" fill="#e9dba8">
      {MOTES.map(([cx, cy, r], index) => <circle key={index} className={`spirit-mote mote-${index}`} cx={cx} cy={cy} r={r} />)}
    </g>
  </svg>;
}
