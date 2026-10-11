import type { CSSProperties } from 'react';
import { useProfileMotion } from '../../hooks/useProfileMotion';
import { isBannerScene, profileEffect, type ProfileEffectId } from '../../lib/profileCosmetics';
import CultivationScene from './CultivationScene';
import AtmosphereArtwork from './AtmosphereArtwork';
import './ProfileCosmetics.css';

/** Animation is reserved for an open profile, never a scrolling chat/list. */
export default function ProfileEffect({ effect, color }: { effect?: ProfileEffectId; color: string }) {
  const animate = useProfileMotion();
  const kind = profileEffect(effect);
  const cultivation = isBannerScene(kind);
  if (kind === 'none') return null;
  return <span aria-hidden="true" className={`profile-effect effect-${kind}${animate ? ' is-animated' : ''}`} style={{ '--cosmetic-color': color } as CSSProperties}>
    {cultivation ? <>
      <AtmosphereArtwork kind="aurora" color={color} />
      <CultivationScene kind={kind} />
    </> : <AtmosphereArtwork kind={kind} color={color} />}
  </span>;
}
