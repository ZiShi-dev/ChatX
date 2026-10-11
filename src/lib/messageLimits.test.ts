import { expect, it } from 'vitest';
import { fileTooLargeMessage, MESSAGE_TEXT_MAX, textTooLongMessage, videoTooLargeMessage } from './messageLimits';
import { FILE_BYTES_MAX, VIDEO_BYTES_MAX } from './chatFile';

it('states text and media limits in Arabic', () => {
  expect(textTooLongMessage()).toContain('حرف');
  expect(textTooLongMessage(5000)).toContain('الرسالة');
  expect(videoTooLargeMessage(VIDEO_BYTES_MAX + 1)).toContain('8');
  expect(fileTooLargeMessage(FILE_BYTES_MAX + 1)).toContain('256');
});
