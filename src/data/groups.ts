import type { Group } from '../types/group';

export const GROUPS: Group[] = [
  {
    id: 'c-equipe',
    name: 'Équipe ChatX',
    type: 'group',
    adminId: 'me',
    memberIds: ['me', 'amina', 'lucas', 'sofia'],
  },
  {
    id: 'c-famille',
    name: 'Famille',
    type: 'group',
    adminId: 'chloe',
    memberIds: ['me', 'chloe', 'mehdi', 'yanis'],
  },
  {
    id: 'c-burst',
    name: 'Exemple',
    type: 'group',
    adminId: 'me',
    memberIds: ['me', 'amina', 'lucas', 'sofia'],
  },
];
