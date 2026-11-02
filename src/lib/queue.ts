import type { MessageStatus } from '../types/message';
import type { NetworkState } from '../types/settings';
import { t } from './i18n';

export function pendingMessageIds(messages: Array<{ id: string; status: MessageStatus }>) {
  return messages.filter((message) => message.status === 'pending').map((message) => message.id);
}

export function statusAfterRetry(network: NetworkState): MessageStatus {
  return network === 'offline' ? 'pending' : 'sending';
}

export function offlineBannerLabel(pending: number) {
  if (pending <= 0) return t('network.offline0');
  if (pending === 1) return t('network.offline1');
  if (pending === 2) return t('network.offline2');
  return t('network.offlineMany', { count: pending });
}

export function serverBannerLabel(pending: number) {
  if (pending <= 0) return t('network.server0');
  if (pending === 1) return t('network.server1');
  if (pending === 2) return t('network.server2');
  return t('network.serverMany', { count: pending });
}
