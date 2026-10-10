import { initials } from '../../lib/conversation';
import type { CSSProperties } from 'react';
import { avatarDecoration, type AvatarDecoration } from '../../lib/profileCosmetics';
import './ProfileCosmetics.css';

type AvatarProps = {
  name: string;
  color: string;
  size?: number;
  slot?: string;
  src?: string;
  decoration?: AvatarDecoration;
  animate?: boolean;
};

export default function Avatar({ name, color, size = 44, slot, src, decoration, animate = false }: AvatarProps) {
  const kind = avatarDecoration(decoration);
  const face = (
    <span
      slot={kind === 'none' ? slot : undefined}
      className="avatar"
      style={{ width: size, height: size, background: src ? '#24312c' : color, fontSize: size <= 18 ? 8 : size < 36 ? 12 : 15 }}
      aria-hidden="true"
    >
      {src ? <img src={src} alt="" loading="lazy" decoding="async" /> : initials(name)}
    </span>
  );
  if (kind === 'none') return face;
  return <span slot={slot} className={`avatar-frame decoration-${kind}${animate ? ' is-animated' : ''}`} style={{ width: size, height: size, '--cosmetic-color': color } as CSSProperties} aria-hidden="true">{face}</span>;
}
