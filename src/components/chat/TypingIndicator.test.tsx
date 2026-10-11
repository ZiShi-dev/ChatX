import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import TypingIndicator from './TypingIndicator';

it('shows a tiny avatar and dots, without the name, when someone types', () => {
  const { container, rerender } = render(
    <TypingIndicator
      names={['Alice']}
      typists={[{ id: 'alice', displayName: 'Alice', color: '#3d9b84' }]}
    />,
  );
  expect(screen.getByRole('status').getAttribute('aria-label')).toBe('Alice يكتب…');
  expect(screen.queryByText('Alice')).toBeNull();
  const face = container.querySelector('.avatar');
  expect(face).toBeTruthy();
  expect((face as HTMLElement).style.width).toBe('18px');
  expect(container.querySelector('.typing-dots')).toBeTruthy();
  rerender(<TypingIndicator names={[]} />);
  expect(screen.queryByRole('status')).toBeNull();
});
