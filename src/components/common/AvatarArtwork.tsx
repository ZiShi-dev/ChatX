import type { AvatarDecoration } from '../../lib/profileCosmetics';
import DragonArtwork from './DragonArtwork';
import HatArtwork from './HatArtwork';
import SoulFireArtwork from './SoulFireArtwork';

/** Original local vector artwork; no downloads, filters, or external animation runtime. */
export default function AvatarArtwork({ kind, layer = 'front' }: { kind: AvatarDecoration; layer?: 'back' | 'front' }) {
  if (kind === 'hat' || kind === 'hat-rain') return <HatArtwork rain={kind === 'hat-rain'} layer={layer} />;
  if (kind === 'soul-fire') return <SoulFireArtwork layer={layer} />;
  if (kind === 'dragon') return <DragonArtwork layer={layer} />;
  if (layer === 'back') return null;
  if (kind === 'prism') return <svg className="avatar-artwork prism-artwork" viewBox="0 0 120 120" aria-hidden="true">
    <path d="M60 3L109 31V89L60 117L11 89V31Z" fill="none" stroke="var(--cosmetic-color)" strokeWidth="3" strokeLinejoin="round" />
    <path d="M11 31L60 3L109 31M11 89L60 117L109 89" fill="none" stroke="#c9eee4" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M58 2L60 8L62 2M108 87L102 89L108 91M12 29L18 31L12 33" fill="none" stroke="#f4f1cc" strokeWidth="2" />
  </svg>;
  return null;
}
