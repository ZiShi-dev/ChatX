import { expect, it } from 'vitest';
import { AdminApiError } from './adminApi';
import { fileTooLargeMessage, MESSAGE_TEXT_MAX, quietOutgoingError, textTooLongMessage, videoTooLargeMessage } from './messageLimits';
import { FILE_BYTES_MAX, VIDEO_BYTES_MAX } from './chatFile';

it('states text and media limits in Arabic', () => {
  expect(textTooLongMessage()).toContain('حرف');
  expect(textTooLongMessage(5000)).toContain('الرسالة');
  expect(videoTooLargeMessage(VIDEO_BYTES_MAX + 1)).toContain('8');
  expect(fileTooLargeMessage(FILE_BYTES_MAX + 1)).toContain('256');
});

it('keeps a dropped connection quiet so the send can retry', () => {
  expect(quietOutgoingError(new AdminApiError('offline', 0))).toBe(true);
  expect(quietOutgoingError(new AdminApiError('invalid_credentials', 401))).toBe(true);
  expect(quietOutgoingError(new AdminApiError('account_changed', 0))).toBe(true);
  expect(quietOutgoingError(new Error('file_too_large'))).toBe(false);
  expect(quietOutgoingError(new AdminApiError('invalid_upload', 400))).toBe(false);
});
