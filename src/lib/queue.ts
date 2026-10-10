import type { MessageStatus } from '../types/message';
import type { NetworkState } from '../types/settings';

export function pendingMessageIds(messages: Array<{ id: string; status: MessageStatus }>) {
  return messages.filter((message) => message.status === 'pending').map((message) => message.id);
}

export function statusAfterRetry(network: NetworkState): MessageStatus {
  return network === 'offline' ? 'pending' : 'sending';
}

export function offlineBannerLabel(pending: number) {
  if (pending <= 0) return 'لا يوجد اتصال — سيتم إرسال رسائلك عند عودة الإنترنت';
  if (pending === 1) return 'لا يوجد اتصال — رسالة واحدة في انتظار الإرسال';
  if (pending === 2) return 'لا يوجد اتصال — رسالتان في انتظار الإرسال';
  return `لا يوجد اتصال — ${pending} رسائل في انتظار الإرسال`;
}

export function serverBannerLabel(pending: number) {
  if (pending <= 0) return 'تعذر الوصول إلى الخادم. تحقق من الشبكة ثم أعد المحاولة.';
  if (pending === 1) return 'تعذر الوصول إلى الخادم — رسالة واحدة في الانتظار';
  if (pending === 2) return 'تعذر الوصول إلى الخادم — رسالتان في الانتظار';
  return `تعذر الوصول إلى الخادم — ${pending} رسائل في الانتظار`;
}
