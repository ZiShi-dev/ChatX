import type { Conversation } from '../types/conversation';
import type { Message } from '../types/message';

export type FriendLink = 'none' | 'outgoing' | 'incoming' | 'friends';
export type PrivateTalk = 'open' | 'intro' | 'locked';

export function privateTalkGate(input: {
  type: Conversation['type'];
  self?: boolean;
  friend?: FriendLink;
  messages: Array<Pick<Message, 'event' | 'deletedForEveryone'>>;
}): PrivateTalk {
  if (input.type !== 'private' || input.self || input.friend === 'friends') return 'open';
  const started = input.messages.some((message) => !message.event && !message.deletedForEveryone);
  return started ? 'locked' : 'intro';
}

export function isIncomingRequest(conversation: Conversation, messages: Message[], currentUserId: string) {
  if (conversation.type !== 'private' || conversation.self || conversation.friend === 'friends') return false;
  if (conversation.friend === 'incoming') return true;
  return messages.some((message) => (
    message.conversationId === conversation.id
    && !message.event
    && !message.deletedForEveryone
    && message.senderId !== currentUserId
  ));
}
