import { describe, expect, it } from 'vitest';
import { normalizeLinkPreviewImage, readPreviewPayload } from './link';

describe('link preview payload', () => {
  it('accepts inlined preview images and remote https URLs', () => {
    const dataUrl = 'data:image/jpeg;base64,/9j/';
    const remote = 'https://cdn.example.com/cover.jpg';
    expect(normalizeLinkPreviewImage(dataUrl)).toBe(dataUrl);
    expect(normalizeLinkPreviewImage(remote)).toBe(remote);
    expect(normalizeLinkPreviewImage('javascript:alert(1)')).toBe('');
    expect(readPreviewPayload({ title: 't', image: remote })?.image).toBe(remote);
  });
});
