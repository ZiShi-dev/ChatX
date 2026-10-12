import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import MessageBubble from './MessageBubble';
import type { Message } from '../../types/message';

afterEach(cleanup);
it('keeps the frame fitted to actual photo dimensions after receipt updates', () => {
  const message: Message = {
    id: 'portrait-test', conversationId: 'room', senderId: 'me', type: 'image',
    status: 'sent', createdAt: '2026-10-12T10:00:00.000Z',
    media: { state: 'cached', fileSize: 10, width: 800, height: 800, localPreviewUrl: 'data:image/png;base64,AA==' },
  };
  const { container, rerender } = render(<MessageBubble message={message} mine showAuthor={false} direct />);
  const photo = container.querySelector('img.media-preview') as HTMLImageElement;
  Object.defineProperties(photo, { naturalWidth: { value: 921 }, naturalHeight: { value: 2048 } });
  fireEvent.load(photo);
  const stack = container.querySelector('.bubble-stack') as HTMLElement;
  expect(parseFloat(stack.style.getPropertyValue('--media-inline-size'))).toBeCloseTo(336 * 921 / 2048 + 6);
  expect(photo.style.aspectRatio).toBe('921 / 2048');
  rerender(<MessageBubble message={{ ...message }} mine showAuthor={false} direct directSeen />);
  expect(parseFloat(stack.style.getPropertyValue('--media-inline-size'))).toBeCloseTo(336 * 921 / 2048 + 6);
  expect(container.querySelector('.status-mark.seen')).not.toBeNull();
});
