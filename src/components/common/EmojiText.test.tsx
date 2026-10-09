import { fireEvent, render } from '@testing-library/react';
import { expect, it } from 'vitest';
import EmojiText from './EmojiText';

it('preserves Unicode for copy and accessibility and falls back if an asset fails', () => {
  const { container } = render(<EmojiText text="مرحبا 😀👍🏽" />);
  expect(container.textContent).toBe('مرحبا 😀👍🏽');
  const images = container.querySelectorAll('img');
  expect(images.length).toBe(2);
  expect(images[0].getAttribute('src')).toBe('/assets/emoji/1f600.webp');
  fireEvent.error(images[0]);
  expect(container.textContent).toBe('مرحبا 😀👍🏽');
  expect(container.querySelectorAll('img').length).toBe(1);
});
