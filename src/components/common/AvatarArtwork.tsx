import type { AvatarDecoration } from '../../lib/profileCosmetics';
import HatArtwork from './HatArtwork';
import SoulFireArtwork from './SoulFireArtwork';

/** Original local vector artwork; no downloads, filters, or external animation runtime. */
export default function AvatarArtwork({ kind, layer = 'front' }: { kind: AvatarDecoration; layer?: 'back' | 'front' }) {
  if (kind === 'hat' || kind === 'hat-rain') return <HatArtwork rain={kind === 'hat-rain'} layer={layer} />;
  if (kind === 'soul-fire') return <SoulFireArtwork layer={layer} />;
  if (layer === 'back') return null;
  if (kind === 'prism') return <svg className="avatar-artwork prism-artwork" viewBox="0 0 120 120" aria-hidden="true">
    <path d="M60 3L109 31V89L60 117L11 89V31Z" fill="none" stroke="var(--cosmetic-color)" strokeWidth="3" strokeLinejoin="round" />
    <path d="M11 31L60 3L109 31M11 89L60 117L109 89" fill="none" stroke="#c9eee4" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M58 2L60 8L62 2M108 87L102 89L108 91M12 29L18 31L12 33" fill="none" stroke="#f4f1cc" strokeWidth="2" />
  </svg>;
  if (kind === 'dragon') return <svg className="avatar-artwork dragon-artwork" viewBox="0 0 120 120" aria-hidden="true">
    <g className="dragon-body">
      <path d="M99 29C74-1 28 5 12 41C-2 75 17 108 48 111C27 105 14 84 16 66" fill="none" stroke="#123d43" strokeWidth="11" strokeLinecap="round" />
      <path d="M99 29C74-1 28 5 12 41C-2 75 17 108 48 111C27 105 14 84 16 66" fill="none" stroke="#65cabb" strokeWidth="6" strokeLinecap="round" />
      <path d="M20 30L14 18L30 22M37 14L37 3L48 10M58 9L67 0L69 12M79 16L90 8L89 24M8 48L0 46L6 58M9 84L2 92L17 96" fill="#b4edce" stroke="#225c60" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M18 31L26 35M31 20L38 25M47 14L51 20M66 15L64 20M81 21L76 25M12 49L18 52M10 66L16 66M17 91L23 86" stroke="#246a67" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M89 24L95 10L100 23L112 19L109 29L117 34L109 45L99 48L91 38Z" fill="#388e84" stroke="#123d43" strokeWidth="2" strokeLinejoin="round" />
      <path d="M94 20L90 8L97 15M105 24L114 13L111 25" fill="#edcf83" stroke="#735c36" strokeWidth="1.3" />
      <path d="M103 34L111 34L108 39L102 40Z" fill="#91d7bd" />
      <path d="M98 29L104 28" stroke="#fff2b2" strokeWidth="3" strokeLinecap="round" />
      <circle cx="102" cy="28" r="1.4" fill="#142d31" />
      <path d="M109 42Q116 45 115 51M99 46L102 52" stroke="#edd290" strokeWidth="1.5" fill="none" />
    </g>
    <path className="dragon-spark" d="M111 54L115 49L118 56L114 62Z" fill="#f5cc70" />
    <path className="dragon-spark spark-far" d="M8 72L11 68L14 74L10 78Z" fill="#f5cc70" opacity=".7" />
  </svg>;
  return null;
}
