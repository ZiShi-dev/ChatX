import { useId } from 'react';

/** Two local SVG layers fitted to the avatar, based on the user's hat references. */
export default function HatArtwork({ rain, layer }: { rain: boolean; layer: 'back' | 'front' }) {
  const clip = `hat-face-${useId().replace(/:/g, '')}`;
  const straw = rain ? '#252d65' : '#e9bd65';
  const cord = rain ? '#8893c6' : '#efcf7c';
  if (layer === 'back') return <svg className="avatar-artwork hat-back-artwork" viewBox="0 0 120 120" aria-hidden="true">
    <path d="M14 31Q60 49 106 31L102 39Q60 52 18 39Z" fill={rain ? '#11172f' : '#6e542e'} />
    {rain && <g className="hat-rain-back" stroke="#c9d6e9" strokeWidth=".6" opacity=".25">
      <path d="M6 37V54M112 44V69M9 78V93M115 85V103M29 107V117" />
    </g>}
  </svg>;
  return <svg className={`avatar-artwork hat-artwork${rain ? ' rainy-hat' : ''}`} viewBox="0 0 120 120" aria-hidden="true">
    <defs><clipPath id={clip}><circle cx="60" cy="66" r="46.8" /></clipPath></defs>
    <path clipPath={`url(#${clip})`} d="M10 31Q60 37 110 31V43Q60 49 10 43Z" fill="#151820" opacity=".22" />
    <g className="hat-cords" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 33C17 73 29 101 59 113M102 33C103 73 91 101 61 113" stroke="#191a21" strokeWidth="2" />
      <path d="M18 33C17 73 29 101 59 113M102 33C103 73 91 101 61 113" stroke={cord} strokeWidth="1.1" />
      <path d="M59 113C47 110 51 120 59 114C69 110 72 120 61 114M59 114L58 119M61 114L62 119" stroke="#161922" strokeWidth="2" />
      <path d="M59 113C47 110 51 120 59 114C69 110 72 120 61 114M59 114L58 119M61 114L62 119" stroke={cord} strokeWidth=".9" />
    </g>
    <g className="hat-crown">
      <path d="M3 33Q25 18 60 3Q93 16 117 33Q90 38 60 36Q25 38 3 33Z" fill={straw} stroke={rain ? '#f5f7ff' : '#151515'} strokeWidth={rain ? 1.6 : 1.2} strokeLinejoin="round" />
      <path d="M60 3L44 10Q60 14 76 10Z" fill="#090b12" />
      <path d={rain ? 'M55 12L46 35Q61 37 73 35L65 12Z' : 'M60 3L104 32L116 33Z'} fill={rain ? '#080b17' : '#b4853e'} opacity={rain ? 1 : .45} />
      <g fill="none" stroke={rain ? '#0d1126' : '#675025'} strokeWidth=".7" strokeLinecap="round">
        <path d="M20 27L33 25M35 21Q62 23 82 21M32 32L54 31M64 31L88 32M73 12L96 28M80 15L106 31M46 12L32 25M53 13L47 29" />
        <path d="M95 27L101 30M14 31L25 30M87 26L91 29" />
      </g>
      <path d="M7 31L45 10M13 30L25 24M33 20L39 16" fill="none" stroke="#fff4d6" strokeWidth={rain ? 1.5 : 1.1} opacity=".85" />
      <path d="M6 34Q60 41 113 34" fill="none" stroke={rain ? '#111529' : '#201a12'} strokeWidth="1.4" />
      {rain && <path d="M106 30L112 34L109 36L103 31" fill="#a8b2db" stroke="#edf2ff" strokeWidth=".6" />}
    </g>
    {rain && <g className="hat-rain-front" fill="none" stroke="#d9e4f8" strokeWidth=".45" opacity=".28">
      <path d="M24 44V61M43 57V75M66 40V57M91 66V82M31 86V102M101 95V112" />
    </g>}
  </svg>;
}
