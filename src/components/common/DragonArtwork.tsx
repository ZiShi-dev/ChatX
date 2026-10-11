import { useId } from 'react';

/** Local layered illustration: the portrait sits inside the dragon's coil. */
export default function DragonArtwork({ layer }: { layer: 'back' | 'front' }) {
  const jade = `jade-${useId().replace(/:/g, '')}`;
  return <svg className={`avatar-artwork jade-dragon-${layer}`} viewBox="0 0 120 120" aria-hidden="true">
    <defs><linearGradient id={jade} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#97d8b5" /><stop offset=".38" stopColor="#4da797" /><stop offset=".72" stopColor="#347a79" /><stop offset="1" stopColor="#193e50" /></linearGradient></defs>
    {layer === 'back' ? <g className="jade-dragon-coil">
      <path d="M97 30C87 10 65 3 44 9C17 16 3 40 7 68C11 96 37 114 67 109C88 106 103 90 105 72" fill="none" stroke="#142f37" strokeWidth="13" strokeLinecap="round" />
      <path d="M97 30C87 10 65 3 44 9C17 16 3 40 7 68C11 96 37 114 67 109C88 106 103 90 105 72" fill="none" stroke={`url(#${jade})`} strokeWidth="9" strokeLinecap="round" />
      <path d="M91 26C76 7 54 8 36 17C13 29 8 52 14 76C21 98 44 108 66 103" fill="none" stroke="#a8dfb6" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M17 27L11 17L25 20M35 13L35 3L44 9M54 6L61 0L65 8M75 11L87 5L86 17M7 45L0 40L4 55M9 77L2 84L14 88M25 100L21 111L33 106M50 109L54 119L61 110M83 103L94 109L91 96" fill="#d0dca5" stroke="#244d4f" strokeWidth="1" strokeLinejoin="round" />
      {[{ x: 30, y: 20, r: -30 }, { x: 46, y: 13, r: -12 }, { x: 64, y: 13, r: 10 }, { x: 80, y: 20, r: 30 }, { x: 15, y: 37, r: -70 }, { x: 11, y: 55, r: -90 }, { x: 15, y: 74, r: -115 }, { x: 26, y: 91, r: -140 }, { x: 43, y: 102, r: -160 }, { x: 64, y: 106, r: 180 }, { x: 84, y: 98, r: 145 }].map(({ x, y, r }) => <path key={x + ':' + y} d="M-4-2Q0 3 4-2M-3 1Q0 5 3 1" transform={`translate(${x} ${y}) rotate(${r})`} fill="none" stroke="#173e45" strokeWidth=".8" opacity=".8" />)}
    </g> : <>
      <g className="jade-dragon-tail">
        <path d="M100 73C113 79 116 98 101 105C92 110 80 106 79 99C84 104 94 103 97 98C101 91 94 88 95 80Z" fill="#4bada0" stroke="#183942" strokeWidth="1.5" />
        <path d="M102 91Q110 88 113 95L108 97L111 102L103 101L104 107L98 104" fill="#bfd9a0" stroke="#244d4f" strokeWidth="1" />
        <path d="M99 81Q106 88 103 96" fill="none" stroke="#9be0b8" strokeWidth="2" />
      </g>
      <path d="M19 79Q26 74 30 80L32 85L40 84L38 88L42 90L35 93L27 87L22 86Z" fill="#4f9e90" stroke="#193c43" strokeWidth="1.2" />
      <path d="M34 87L38 83M37 89L42 87M34 91L39 94" stroke="#f2dfac" strokeWidth="1.4" strokeLinecap="round" />
      <g className="jade-dragon-head">
        <path className="jade-dragon-mane" d="M91 21L83 18L87 27L79 28L86 34L80 41L90 41L86 49L99 45L102 50L107 41L104 29Z" fill="#c1dba5" stroke="#244b4c" strokeWidth="1.1" strokeLinejoin="round" />
        <path d="M91 26C87 20 90 15 86 11L91 12L96 21M101 24C101 15 107 16 107 8L111 10L109 18L105 27" fill="#e5c78d" stroke="#514b39" strokeWidth="1.1" strokeLinejoin="round" />
        <path d="M92 23C99 20 106 23 108 29L107 33L116 36L116 42L111 46L103 45L99 49L91 43L88 33Z" fill={`url(#${jade})`} stroke="#173841" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M92 27Q99 22 105 27L101 32L94 31Z" fill="#94d2ac" />
        <path d="M96 28L103 27L100 31L96 31Z" fill="#ffe0a0" stroke="#16313a" strokeWidth=".8" />
        <path d="M100 27L99 31" stroke="#172e36" strokeWidth="1.1" />
        <path d="M106 35Q111 33 115 37L111 39L105 38Z" fill="#97ceb0" />
        <path d="M112 36L114 37" stroke="#173841" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M101 40Q107 44 114 41L111 45L106 46Z" fill="#163039" />
        <path d="M104 41L106 44L108 42M110 42L112 44L113 42" fill="#f1e8c6" />
        <path d="M92 35L95 37L93 40M96 42L99 44" fill="none" stroke="#24615c" strokeWidth="1" />
        <path className="jade-dragon-whiskers" d="M108 39C118 44 116 51 108 55M104 43C109 53 101 58 98 52" fill="none" stroke="#e3d4a0" strokeWidth="1" strokeLinecap="round" />
      </g>
      <path className="jade-dragon-breath" d="M109 49C115 53 110 58 116 60C113 61 111 58 109 59C105 57 112 54 109 49Z" fill="#88e5cf" opacity=".8" />
    </>}
  </svg>;
}
