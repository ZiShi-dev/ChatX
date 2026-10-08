export type SkeletonKind = 'home' | 'chat' | 'notices' | 'saved' | 'members' | 'people' | 'group' | 'account' | 'profile' | 'settings' | 'media';

function Row() {
  return (
    <div className="skeleton-row">
      <span className="skeleton-avatar" />
      <span className="skeleton-copy">
        <span className="skeleton-line" />
        <span className="skeleton-line short" />
      </span>
    </div>
  );
}

function Rows({ count }: { count: number }) {
  return Array.from({ length: count }, (_, index) => <Row key={index} />);
}

function Chips() {
  return (
    <div className="skeleton-chips">
      <span className="skeleton-chip" />
      <span className="skeleton-chip short" />
      <span className="skeleton-chip" />
    </div>
  );
}

function Hero() {
  return (
    <>
      <span className="skeleton-banner" />
      <span className="skeleton-avatar xl" />
      <span className="skeleton-line center" />
      <span className="skeleton-line short center" />
    </>
  );
}

export default function PageSkeleton({ kind }: { kind: SkeletonKind }) {
  return (
    <div className={`skeleton-list is-${kind}`} role="status" aria-label="جارٍ التحميل">
      {kind === 'home' && (
        <>
          <Chips />
          <Rows count={6} />
        </>
      )}
      {kind === 'chat' && (
        <>
          <span className="skeleton-bubble" />
          <span className="skeleton-bubble mine short" />
          <span className="skeleton-bubble short" />
          <span className="skeleton-bubble mine" />
          <span className="skeleton-bubble" />
        </>
      )}
      {kind === 'notices' && (
        <>
          <Chips />
          <Rows count={5} />
        </>
      )}
      {kind === 'saved' && (
        <>
          <span className="skeleton-line short" />
          <span className="skeleton-card" />
          <span className="skeleton-card" />
          <span className="skeleton-card short" />
        </>
      )}
      {kind === 'members' && (
        <>
          <span className="skeleton-search" />
          <Rows count={5} />
        </>
      )}
      {kind === 'people' && (
        <>
          <Chips />
          <span className="skeleton-search" />
          <Rows count={5} />
        </>
      )}
      {kind === 'group' && (
        <>
          <Hero />
          <Chips />
          <Rows count={4} />
        </>
      )}
      {(kind === 'account' || kind === 'profile') && (
        <>
          <Hero />
          <span className="skeleton-line" />
          <span className="skeleton-line" />
        </>
      )}
      {kind === 'settings' && (
        <>
          <span className="skeleton-line short" />
          <span className="skeleton-card" />
          <span className="skeleton-card" />
          <span className="skeleton-card short" />
        </>
      )}
      {kind === 'media' && (
        <>
          <span className="skeleton-banner short" />
          <div className="skeleton-grid">
            {Array.from({ length: 6 }, (_, index) => <span key={index} className="skeleton-tile" />)}
          </div>
        </>
      )}
    </div>
  );
}
