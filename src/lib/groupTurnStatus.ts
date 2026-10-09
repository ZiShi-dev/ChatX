export type TurnRefresh = 'loading' | 'ok' | 'offline' | 'invalid' | 'local';

export function groupTurnStatus(name: string, mine: boolean, now: number, opensAt: string | undefined, refresh: TurnRefresh) {
  const opens = opensAt ? Date.parse(opensAt) : Number.NaN;
  const expires = opens + 7 * 24 * 60 * 60 * 1000;
  if (Number.isFinite(expires) && now >= expires) {
    if (refresh === 'loading') return 'انتهى الدور — جارٍ تحديث الدور التالي';
    if (refresh === 'offline') return 'انتهى الدور — تعذر الاتصال لتحديث الدور التالي';
    if (refresh === 'ok') return 'انتهى الدور — لم تصل بيانات الدور الجديد من الخادم';
    return 'انتهى الدور — تعذر تحميل بيانات الدور التالي';
  }
  const format = (date: number) => new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', numberingSystem: 'latn' }).format(date);
  if (Number.isFinite(opens) && opens > now) return mine ? `دورك في ${format(opens)}` : `دور ${name} في ${format(opens)}`;
  const end = Number.isFinite(expires) ? ` حتى ${format(expires)}` : '';
  return mine ? `دورك لتعديل الاسم والصورة بحرية${end}` : `دور ${name} لتعديل الاسم والصورة${end}`;
}
