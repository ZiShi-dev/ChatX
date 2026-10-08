import { create } from 'zustand';
import { USERS } from '../data/users';
import type { User } from '../types/user';

type UserState = {
  users: User[];
  addUser: (user: User) => void;
  updateUser: (id: string, patch: Partial<User>) => void;
  removeUser: (id: string) => void;
};

export const useUserStore = create<UserState>((set) => ({
  users: USERS,
  addUser: (user) =>
    set((state) => ({
      users: state.users.some((item) => item.id === user.id)
        ? state.users.map((item) => (item.id === user.id ? { ...item, ...user } : item))
        : [...state.users, user],
    })),
  updateUser: (id, patch) =>
    set((state) => ({
      users: state.users.map((user) => (user.id === id ? { ...user, ...patch } : user)),
    })),
  removeUser: (id) =>
    set((state) => ({
      users: state.users.filter((user) => user.id !== id),
    })),
}));
