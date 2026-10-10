import { describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { createScrollHold } from './ionScrollHold';

describe('createScrollHold', () => {
  it('restores scrollTop after hold', async () => {
    const scrollEl = { scrollTop: 120 };
    const contentRef = createRef<HTMLIonContentElement>();
    contentRef.current = {
      getScrollElement: async () => scrollEl as unknown as HTMLElement,
    } as HTMLIonContentElement;

    const hold = createScrollHold(contentRef);
    scrollEl.scrollTop = 120;
    await hold.hold();
    scrollEl.scrollTop = 400;
    hold.restore();

    await vi.waitFor(() => {
      expect(scrollEl.scrollTop).toBe(120);
    });
  });

  it('onPickerDismiss restores only when picker was opened', async () => {
    const scrollEl = { scrollTop: 50 };
    const contentRef = createRef<HTMLIonContentElement>();
    contentRef.current = {
      getScrollElement: async () => scrollEl as unknown as HTMLElement,
    } as HTMLIonContentElement;

    const hold = createScrollHold(contentRef);
    hold.onPickerDismiss();
    expect(scrollEl.scrollTop).toBe(50);

    await hold.hold();
    scrollEl.scrollTop = 0;
    hold.onPickerDismiss();
    await vi.waitFor(() => {
      expect(scrollEl.scrollTop).toBe(50);
    });
  });
});
