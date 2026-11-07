import './HomeStressBar.css';
import type { HomeStressMode } from './homeStress';

const SEGMENTS: { id: HomeStressMode; label: string }[] = [
  { id: 'demo', label: 'Demo' },
  { id: 'worst', label: 'Worst case' },
  { id: 'empty', label: 'Empty' },
  { id: 'one', label: 'One' },
  { id: 'many', label: '80' },
];

export default function HomeStressBar({ mode, onChoose }: { mode: HomeStressMode; onChoose: (mode: HomeStressMode) => void }) {
  if (!import.meta.env.DEV) return null;
  return (
    <div className="home-stress" role="group" aria-label="Demo data">
      {SEGMENTS.map((segment) => (
        <button key={segment.id} type="button" aria-pressed={mode === segment.id} onClick={() => onChoose(segment.id)}>
          {segment.label}
        </button>
      ))}
    </div>
  );
}
