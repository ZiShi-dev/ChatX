import type { CSSProperties } from 'react';
import { useProfileMotion } from '../../hooks/useProfileMotion';
import { profileEffect, type ProfileEffectId } from '../../lib/profileCosmetics';
import './ProfileCosmetics.css';

/** Animation is reserved for an open profile, never a scrolling chat/list. */
export default function ProfileEffect({ effect, color }: { effect?: ProfileEffectId; color: string }) {
  const animate = useProfileMotion();
  const kind = profileEffect(effect);
  if (kind === 'none') return null;
  return <span aria-hidden="true" className={`profile-effect effect-${kind}${animate ? ' is-animated' : ''}`} style={{ '--cosmetic-color': color } as CSSProperties}>
    <i /><i /><i /><i /><i />
  </span>;
}
