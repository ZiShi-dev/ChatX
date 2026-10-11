import type { CSSProperties } from 'react';
import { useProfileMotion } from '../../hooks/useProfileMotion';
import { isBannerScene, profileEffect, type ProfileEffectId } from '../../lib/profileCosmetics';
import CultivationScene from './CultivationScene';
import AtmosphereArtwork from './AtmosphereArtwork';
import './ProfileCosmetics.css';

/** Animation is reserved for an open profile, never a scrolling chat/list. */
export default function ProfileEffect({ effect, color, placement = 'ambient' }: { effect?: ProfileEffectId; color: string; placement?: 'ambient' | 'banner' }) {
  const animate = useProfileMotion();
  const kind = profileEffect(effect);
  const cultivation = isBannerScene(kind);
  if (kind === 'none' || cultivation && placement !== 'banner') return null;
  return <span aria-hidden="true" className={`profile-effect effect-${kind}${placement === 'banner' ? ' is-banner' : ''}${animate ? ' is-animated' : ''}`} style={{ '--cosmetic-color': color } as CSSProperties}>
    {cultivation ? <CultivationScene kind={kind} /> : <AtmosphereArtwork kind={kind} color={color} />}
  </span>;
}
