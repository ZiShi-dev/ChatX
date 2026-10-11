type SceneKind = 'celestial-dragon' | 'sword-domain' | 'time-cicada';
const motionClass: Record<SceneKind, string> = {
  'celestial-dragon': 'celestial-dragon-body',
  'sword-domain': 'immortal-sword',
  'time-cicada': 'gu-cicada',
};
/** Local compressed drawings: no vector artwork or continuous network downloads. */
export default function CultivationScene({ kind }: { kind: SceneKind }) {
  return <div className={`cultivation-scene scene-${kind}`} aria-hidden="true">
    <img className={motionClass[kind]} src={`/assets/cultivation/${kind}-v1.webp`} alt="" decoding="async" draggable={false} />
  </div>;
}
