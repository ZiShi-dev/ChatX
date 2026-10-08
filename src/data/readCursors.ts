import { MESSAGES } from './messages';
import type { ReadCursors, ReadTimes } from '../lib/readReceipts';

export const SEED_READ_CURSORS: ReadCursors = {
  'c-amina': { amina: 'm-amina-2' },
  'c-equipe': { amina: 'm-equipe-3', lucas: 'm-equipe-3', sofia: 'm-equipe-0' },
  'c-famille': { chloe: 'm-famille-2' },
};

const seenAt = (messageId: string) => MESSAGES.find((message) => message.id === messageId)?.createdAt ?? new Date().toISOString();

export const SEED_READ_TIMES: ReadTimes = {
  'c-amina': { amina: seenAt('m-amina-2') },
  'c-equipe': { amina: seenAt('m-equipe-3'), lucas: seenAt('m-equipe-3'), sofia: seenAt('m-equipe-0') },
  'c-famille': { chloe: seenAt('m-famille-2') },
};
