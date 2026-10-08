import { initials } from '../../lib/conversation';

type AvatarProps = {
  name: string;
  color: string;
  size?: number;
  slot?: string;
  src?: string;
};

export default function Avatar({ name, color, size = 44, slot, src }: AvatarProps) {
  return (
    <span
      slot={slot}
      className="avatar"
      style={{ width: size, height: size, background: src ? '#24312c' : color, fontSize: size <= 18 ? 8 : size < 36 ? 12 : 15 }}
      aria-hidden="true"
    >
      {src ? <img src={src} alt="" loading="lazy" decoding="async" /> : initials(name)}
    </span>
  );
}
