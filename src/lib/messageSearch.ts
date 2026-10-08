import type { Message } from '../types/message';

export function messageSearchText(message: Message) {
  return [message.text, message.media?.fileName, message.link?.title, message.link?.url]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('ar');
}

export function matchingMessages(messages: Message[], query: string) {
  const needle = query.trim().toLocaleLowerCase('ar');
  if (!needle) return messages;
  return messages.filter((message) => message && !message.deletedForEveryone && messageSearchText(message).includes(needle));
}

export function searchMessages(messages: Message[], query: string, limit = 12) {
  const needle = query.trim().toLocaleLowerCase('ar');
  if (!needle) return [];
  const hits: Message[] = [];
  for (let index = messages.length - 1; index >= 0 && hits.length < limit; index -= 1) {
    const message = messages[index];
    if (!message || message.deletedForEveryone) continue;
    if (messageSearchText(message).includes(needle)) hits.push(message);
  }
  return hits;
}
