import { useId } from 'react';

type SceneKind = 'celestial-dragon' | 'sword-domain' | 'time-cicada';
const SWORDS = [[170, 130, -32], [230, 96, -18], [285, 79, -6], [355, 79, 6], [410, 96, 18], [470, 130, 32]] as const;

/** Original cultivation artwork, drawn locally and animated with transform/opacity only. */
export default function CultivationScene({ kind }: { kind: SceneKind }) {
  const id = useId().replace(/:/g, '');
  const jade = `cultivation-jade-${id}`, gold = `cultivation-gold-${id}`, halo = `cultivation-halo-${id}`;
  return <svg className={`cultivation-scene scene-${kind}`} viewBox="0 0 640 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id={jade} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f6e6b0" /><stop offset=".4" stopColor="#92dbbd" /><stop offset="1" stopColor="#1d6a72" /></linearGradient>
      <linearGradient id={gold} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#fff3cb" /><stop offset=".5" stopColor="#dab66b" /><stop offset="1" stopColor="#927041" /></linearGradient>
      <radialGradient id={halo}><stop stopColor="#beeecf" stopOpacity=".45" /><stop offset="1" stopColor="#62beaa" stopOpacity="0" /></radialGradient>
    </defs>
    <rect width="640" height="240" fill="#071a21" opacity=".58" />
    <circle className="cultivation-halo" cx="320" cy="106" r="136" fill={`url(#${halo})`} />
    <path d="M0 224L64 178L87 193L158 122L216 179L267 162L308 206L356 167L407 189L485 134L554 191L596 164L640 204V240H0Z" fill="#143a40" opacity=".8" />
    <path d="M0 242L95 200L151 214L204 188L260 231L361 203L415 227L481 190L552 214L640 189V240Z" fill="#0a242e" />
    <g className="cultivation-mist" fill="none" stroke="#a4d5c6" strokeWidth="2" opacity=".3">
      <path d="M40 177Q77 153 128 175T216 171M417 181Q461 157 506 175T613 176M106 211Q159 190 209 204T292 201M326 215Q365 201 403 212T516 208" />
    </g>
    {kind === 'celestial-dragon' && <g className="celestial-dragon-body">
      <path d="M116 164C169 62 214 187 281 130S382 38 448 89" fill="none" stroke="#0c373e" strokeWidth="25" strokeLinecap="round" />
      <path d="M116 164C169 62 214 187 281 130S382 38 448 89" fill="none" stroke={`url(#${jade})`} strokeWidth="16" strokeLinecap="round" />
      <path d="M116 164C169 62 214 187 281 130S382 38 448 89" fill="none" stroke="#d7e8b9" strokeWidth="3" opacity=".8" />
      <path d="M147 109L149 94L160 105M180 121L192 108L194 132M219 151L230 139L232 155M266 143L265 129L279 134M308 103L304 85L321 92M346 73L346 56L359 68M391 67L399 49L405 69M425 77L438 63L438 85" fill="#d9cf91" stroke="#46746a" strokeWidth="1.5" />
      <path d="M170 109L165 120M204 141L195 148M244 151L245 139M289 123L299 132M328 83L335 93M368 64L370 78M412 69L408 82" stroke="#327575" strokeWidth="2.5" />
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
        <path d="M320 35L392 159H248ZM320 201L248 77H392Z" strokeWidth="1" />
      </g>
      {SWORDS.map(([x, y, rotation], index) => <g key={index} transform={`translate(${x} ${y}) rotate(${rotation})`}>
        <g className={`immortal-sword sword-${index}`}>
          <path d="M0-73L7-56L4 15H-4L-7-56Z" fill="#dcefea" stroke="#639996" strokeWidth="1.2" />
          <path d="M0-70V15" stroke="#fff7d5" strokeWidth="1.4" />
          <path d="M-13 16L-16 22L0 19L16 22L13 16Z" fill={`url(#${gold})`} />
          <path d="M-3 19V41L0 46L3 41V19Z" fill="#355d62" stroke="#dbc892" />
          <path d="M0 46Q-9 58-3 66" fill="none" stroke="#9fd7bd" strokeWidth="2" />
        </g>
      </g>)}
    </>}
    {kind === 'time-cicada' && <>
      <g className="time-seal" fill="none" stroke="#e1ce8c" opacity=".75">
        <circle cx="320" cy="112" r="80" strokeWidth="1" /><circle cx="320" cy="112" r="69" strokeDasharray="2 12" strokeWidth="3" />
        <path d="M320 28V40M320 184V196M236 112H248M392 112H404M260 52L269 61M371 163L380 172M260 172L269 163M371 61L380 52" strokeWidth="2" />
      </g>
      <g className="gu-cicada">
        <g className="cicada-wing wing-left"><path d="M313 94Q271 36 244 52Q248 111 310 137Z" fill="#6da994" fillOpacity=".8" stroke="#f0d591" strokeWidth="2" /><path d="M311 101L256 60M301 98L267 104M284 78L279 102M309 121L260 78" fill="none" stroke="#d5daac" strokeWidth="1" /></g>
        <g className="cicada-wing wing-right"><path d="M327 94Q369 36 396 52Q392 111 330 137Z" fill="#6da994" fillOpacity=".8" stroke="#f0d591" strokeWidth="2" /><path d="M329 101L384 60M339 98L373 104M356 78L361 102M331 121L380 78" fill="none" stroke="#d5daac" strokeWidth="1" /></g>
        <path d="M310 88Q320 75 330 88L329 135L320 158L311 135Z" fill={`url(#${gold})`} stroke="#725f3c" strokeWidth="2" />
        <path d="M313 105H327M312 116H328M313 127H327M315 138H325" stroke="#7e865d" strokeWidth="2" />
        <path d="M314 88L307 73M326 88L333 73M313 109L302 117M327 109L338 117" stroke="#eee0ad" strokeWidth="2" strokeLinecap="round" />
        <circle cx="315" cy="92" r="2.5" fill="#1f4b46" /><circle cx="325" cy="92" r="2.5" fill="#1f4b46" />
      </g>
    </>}
    <g className="spirit-particles" fill="#e9dba8">
      <circle cx="139" cy="60" r="2" /><circle cx="209" cy="168" r="1.5" /><circle cx="436" cy="49" r="2" /><circle cx="490" cy="168" r="1.5" /><circle cx="351" cy="198" r="2" />
    </g>
  </svg>;
}
