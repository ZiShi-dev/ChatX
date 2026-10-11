import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import TypingIndicator from './TypingIndicator';

it('keeps the same status element while typing starts and stops, without idle animation', () => {
  const { rerender } = render(<TypingIndicator names={[]} />);
  const status = screen.getByRole('status');
  expect(status.className).toContain('is-idle');
  expect(status.querySelector('.typing-dots')).toBeNull();
  rerender(<TypingIndicator names={['Alice']} />);
  expect(screen.getByRole('status')).toBe(status);
  expect(status.textContent).toContain('Alice');
  expect(status.className).not.toContain('is-idle');
  rerender(<TypingIndicator names={[]} />);
  expect(screen.getByRole('status')).toBe(status);
  expect(status.textContent).toBe('');
});
