import { useId } from 'react';

/** Cowboy hat drawn like the bamboo hat. The stored decoration id stays `dragon`. */
export default function DragonArtwork({ layer }: { layer: 'back' | 'front' }) {
  const clip = `cowboy-${useId().replace(/:/g, '')}`;
  if (layer === 'back') return <svg className="avatar-artwork cowboy-hat-back" viewBox="0 0 120 120" aria-hidden="true">
    <path d="M14 30Q60 48 106 30L100 40Q60 52 20 40Z" fill="#6e542e" />
  </svg>;
  return <svg className="avatar-artwork cowboy-hat-front" viewBox="0 0 120 120" aria-hidden="true">
    <defs><clipPath id={clip}><circle cx="60" cy="66" r="46.8" /></clipPath></defs>
    <path clipPath={`url(#${clip})`} d="M6 34Q60 46 114 34V46Q60 56 6 46Z" fill="#151820" opacity=".22" />
    <g className="cowboy-cords" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M24 42C23 76 34 101 59 113M96 42C97 76 86 101 61 113" stroke="#191a21" strokeWidth="2" />
      <path d="M24 42C23 76 34 101 59 113M96 42C97 76 86 101 61 113" stroke="#efcf7c" strokeWidth="1.1" />
      <path d="M59 113C47 110 51 120 59 114C69 110 72 120 61 114M59 114L58 119M61 114L62 119" stroke="#161922" strokeWidth="2" />
      <path d="M59 113C47 110 51 120 59 114C69 110 72 120 61 114M59 114L58 119M61 114L62 119" stroke="#efcf7c" strokeWidth=".9" />
    </g>
    <g className="cowboy-crown">
      <path d="M2 26Q16 40 32 44Q60 54 88 44Q104 40 118 26Q98 42 60 40Q22 42 2 26Z" fill="#e9bd65" stroke="#151515" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M42 38L46 16Q52 6 57 16Q60 24 63 16Q68 6 74 16L78 38Q60 42 42 38Z" fill="#e9bd65" stroke="#151515" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M52 16Q60 26 68 16L65 20Q60 26 55 20Z" fill="#b4853e" />
      <path d="M46 32H74" stroke="#201a12" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M46 32H74" stroke="#8d6230" strokeWidth="1.2" strokeLinecap="round" />
      <g fill="none" stroke="#675025" strokeWidth=".7" strokeLinecap="round">
        <path d="M14 32Q36 46 56 44M64 44Q86 46 106 32M50 14L54 30M66 14L62 30M58 18L60 30" />
      </g>
      <path d="M8 28L26 24M14 32L22 27" fill="none" stroke="#fff4d6" strokeWidth="1.1" opacity=".85" />
    </g>
  </svg>;
}
