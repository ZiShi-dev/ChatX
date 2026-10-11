import type { CSSProperties } from 'react';
import { useProfileMotion } from '../../hooks/useProfileMotion';
import { profileEffect, type ProfileEffectId } from '../../lib/profileCosmetics';
import CultivationScene from './CultivationScene';
import './ProfileCosmetics.css';

/** Animation is reserved for an open profile, never a scrolling chat/list. */
export default function ProfileEffect({ effect, color, placement = 'ambient' }: { effect?: ProfileEffectId; color: string; placement?: 'ambient' | 'banner' }) {
  const animate = useProfileMotion();
  const kind = profileEffect(effect);
  const cultivation = kind === 'celestial-dragon' || kind === 'sword-domain' || kind === 'time-cicada';
  if (kind === 'none' || cultivation && placement !== 'banner') return null;
  return <span aria-hidden="true" className={`profile-effect effect-${kind}${placement === 'banner' ? ' is-banner' : ''}${animate ? ' is-animated' : ''}`} style={{ '--cosmetic-color': color } as CSSProperties}>
    {cultivation ? <CultivationScene kind={kind} /> : <><i /><i /><i /><i /><i /></>}
  </span>;
}
