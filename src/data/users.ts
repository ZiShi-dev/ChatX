import type { User } from '../types/user';

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

export const CURRENT_USER_ID = 'me';

export const USERS: User[] = [
  {
    id: CURRENT_USER_ID,
    username: 'mrerreur',
    displayName: 'Mr.Erreur',
    role: 'creator',
    status: 'online',
    bio: 'يبني ChatX خطوة بخطوة.',
    color: '#3d9b84',
  },
  {
    id: 'amina',
    username: 'amina',
    displayName: 'Amina Diallo',
    role: 'member',
    status: 'online',
    bio: 'مهتمة بواجهة المحادثات.',
    color: '#6f8f72',
  },
  {
    id: 'lucas',
    username: 'lucas',
    displayName: 'Lucas Martin',
    role: 'member',
    status: 'online',
    bio: 'يجرّب التطبيق من المتصفح.',
    color: '#4d7ea8',
  },
  {
    id: 'sofia',
    username: 'sofia',
    displayName: 'Sofia Bernard',
    role: 'member',
    status: 'offline',
    bio: 'تتابع المجموعات.',
    color: '#a56b7a',
    lastSeenAt: minutesAgo(45),
  },
  {
    id: 'yanis',
    username: 'yanis',
    displayName: 'Yanis Cohen',
    role: 'member',
    status: 'offline',
    bio: '',
    color: '#b08968',
    lastSeenAt: minutesAgo(180),
  },
  {
    id: 'chloe',
    username: 'chloe',
    displayName: 'Chloé Rossi',
    role: 'member',
    status: 'online',
    bio: '',
    color: '#7d6b9a',
  },
  {
    id: 'mehdi',
    username: 'mehdi',
    displayName: 'Mehdi Benali',
    role: 'member',
    status: 'offline',
    bio: '',
    color: '#5f8f8a',
    lastSeenAt: minutesAgo(900),
  },
];

export const CURRENT_USER = USERS[0];
