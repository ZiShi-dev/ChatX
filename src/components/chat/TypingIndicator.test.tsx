import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import TypingIndicator from './TypingIndicator';

it('shows avatar, dots and name beside the composer when someone types', () => {
  const { container, rerender } = render(
    <TypingIndicator
      names={['Alice']}
      typists={[{ displayName: 'Alice', color: '#3d9b84' }]}
    />,
  );
  expect(screen.getByRole('status').getAttribute('aria-label')).toBe('Alice يكتب…');
  expect(screen.getByText('Alice')).toBeTruthy();
  expect(container.querySelector('.typing-dots')).toBeTruthy();
  rerender(<TypingIndicator names={[]} />);
  expect(screen.queryByRole('status')).toBeNull();
});
