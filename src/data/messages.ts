import type { Message } from '../types/message';

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const text = (
  id: string,
  conversationId: string,
  senderId: string,
  body: string,
  minutes: number,
  extra: Partial<Message> = {},
): Message => ({
  id,
  conversationId,
  senderId,
  type: 'text',
  text: body,
  status: 'sent',
  createdAt: minutesAgo(minutes),
  ...extra,
});

const BURST_OLDER = 50;
const BURST_NEW = 200;

const burstMessages: Message[] = Array.from({ length: BURST_OLDER + BURST_NEW }, (_, index) => {
  const fresh = index >= BURST_OLDER;
  const offset = index - BURST_OLDER;
  return text(
    `m-burst-${index}`,
    'c-burst',
    fresh ? 'amina' : index % 2 === 0 ? 'lucas' : 'sofia',
    fresh ? `رسالة جديدة ${offset + 1}` : `قبل الدفعة ${index + 1}`,
    fresh ? 12 - (offset * 12) / BURST_NEW : 900 - index,
  );
});

export const MESSAGES: Message[] = [
  text('m-amina-1', 'c-amina', 'amina', 'هل نراجع الواجهة هذا المساء؟ https://chatx.app/guide', 40, {
    link: {
      url: 'https://chatx.app/guide',
      title: 'دليل ChatX',
      description: 'ملاحظات قصيرة عن توفير البيانات.',
      image: '/previews/chatx-guide.svg',
      preview: 'loaded',
    },
  }),
  text('m-amina-2', 'c-amina', 'me', 'نعم. نبدأ من الصفحة الرئيسية.', 28),
  text('m-amina-failed', 'c-amina', 'me', 'لم تصل هذه الرسالة.', 6, { status: 'failed' }),
  text('m-lucas-1', 'c-lucas', 'lucas', 'أجرب التطبيق من المتصفح.', 180),
  text('m-equipe-0', 'c-equipe', 'me', 'أبدأ المراجعة.', 70),
  text('m-equipe-1', 'c-equipe', 'sofia', 'الواجهة جاهزة للتجربة.', 55),
  text('m-equipe-mention', 'c-equipe', 'amina', '@mrerreur راجع الزر الجديد.', 48),
  text('m-equipe-2', 'c-equipe', 'lucas', 'تمام، أجربها الآن.', 40, { replyToId: 'm-equipe-1' }),
  text('m-equipe-3', 'c-equipe', 'me', 'أرسلت النسخة الجديدة.', 18),
  text('m-equipe-signal', 'c-equipe', 'amina', 'تنبيه: تذكير قصير قبل الاجتماع.', 40),
  text('m-famille-1', 'c-famille', 'chloe', 'نلتقي يوم الأحد؟', 400),
  text('m-famille-2', 'c-famille', 'me', 'الأحد يناسبني.', 30, {
    reactions: [{ emoji: '❤️', userId: 'chloe' }],
  }),
  text('m-famille-reply', 'c-famille', 'chloe', 'رائع، نثبت الأحد.', 22, {
    replyToId: 'm-famille-2',
    reactions: [
      { emoji: '👍', userId: 'mehdi' },
      { emoji: '👍', userId: 'yanis' },
      { emoji: '😂', userId: 'chloe' },
    ],
  }),
  text('m-global-1', 'c-global', 'amina', 'مرحبًا، هذه مجموعة ChatX.', 80),
  text('m-global-everyone', 'c-global', 'amina', '@everyone اجتماع قصير بعد قليل.', 50),
  text('m-global-2', 'c-global', 'lucas', 'مرحبا كيف حالك Hello مرحبا Lucas https://example.com/test 12345', 20),
  {
    id: 'm-global-photo',
    conversationId: 'c-global',
    senderId: 'sofia',
    type: 'image',
    status: 'sent',
    createdAt: minutesAgo(8),
    media: {
      fileName: 'note.jpg',
      fileSize: 8.4 * 1024 * 1024,
      width: 1200,
      height: 800,
      state: 'remote',
    },
  },
  ...burstMessages,
];
