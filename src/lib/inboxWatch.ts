import { registerPlugin } from '@capacitor/core';

type InboxOpen = {
  conversationId?: string;
  messageId?: string;
};

type InboxWatchPlugin = {
  remember(options: { origin: string; quiet: string; hiddenKinds: string; seen: string[] }): Promise<void>;
  stop(): Promise<void>;
  addListener(event: 'open', listener: (event: InboxOpen) => void): Promise<{ remove: () => Promise<void> }>;
};

export const InboxWatch = registerPlugin<InboxWatchPlugin>('InboxWatch');
