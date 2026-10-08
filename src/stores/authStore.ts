import { create } from 'zustand';
import { CURRENT_USER } from '../data/users';
import { AdminApiError, adminFetch } from '../lib/adminApi';
import { readDirectoryUser } from '../lib/directory';
import { readGooglePreview, readGoogleReadyUser } from '../lib/googleAccount';
import type { User } from '../types/user';
import { useUserStore } from './userStore';

const AUTH_KEY = 'chatx.auth';

type SavedAuth = {
  activated?: boolean;
  currentUser?: Partial<User>;
  accounts?: Partial<User>[];
};

function readAuth(): SavedAuth {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SavedAuth;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function asUser(saved?: Partial<User>): User | undefined {
  if (!saved?.id || !saved.displayName || !saved.username) return undefined;
  if (saved.id === CURRENT_USER.id) {
    return {
      ...CURRENT_USER,
      ...saved,
      id: CURRENT_USER.id,
      role: CURRENT_USER.role,
      status: CURRENT_USER.status,
    };
  }
  return {
    id: saved.id,
    username: saved.username,
    displayName: saved.displayName,
    role: saved.role === 'admin' ? 'admin' : 'member',
    status: 'online',
    bio: saved.bio ?? '',
    color: saved.color || '#4d7ea8',
    ...(saved.avatarUrl ? { avatarUrl: saved.avatarUrl } : {}),
    ...(saved.bannerUrl ? { bannerUrl: saved.bannerUrl } : {}),
  };
}

function writeAuth(state: Pick<AuthState, 'activated' | 'currentUser' | 'accounts'>) {
  try {
    const payload: SavedAuth = {
      activated: state.activated,
      currentUser: state.currentUser,
      accounts: state.accounts,
    };
    localStorage.setItem(AUTH_KEY, JSON.stringify(payload));
  } catch {
    // The session still works in memory when storage is full.
  }
}

const SERVER_ID = /^[0-9a-f-]{36}$/i;

function applyAccountPatch(user: User, patch: { displayName?: string; bio?: string; bannerUrl?: string | null; avatarUrl?: string | null }): User {
  const next: User = {
    ...user,
    ...(patch.displayName !== undefined ? { displayName: patch.displayName, username: patch.displayName } : {}),
    ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
  };
  if (patch.bannerUrl) next.bannerUrl = patch.bannerUrl;
  else if (patch.bannerUrl === null) delete next.bannerUrl;
  if (patch.avatarUrl) next.avatarUrl = patch.avatarUrl;
  else if (patch.avatarUrl === null) delete next.avatarUrl;
  return next;
}

const savedAuth = readAuth();
const initialUser = asUser(savedAuth.currentUser) ?? CURRENT_USER;
const initialAccounts = (() => {
  const saved = (savedAuth.accounts ?? []).map(asUser).filter((user): user is User => Boolean(user));
  return saved.some((user) => user.id === initialUser.id) ? saved : [initialUser, ...saved];
})();

function inviteFailure(error: unknown): 'invalid' | 'username_taken' | 'weak_password' | 'offline' | 'rate_limited' {
  const reason = error instanceof AdminApiError ? error.code : 'offline';
  if (reason === 'username_taken' || reason === 'weak_password' || reason === 'rate_limited') return reason;
  if (reason === 'offline' || reason === 'unavailable') return 'offline';
  return 'invalid';
}

type AuthState = {
  currentUser: User;
  activated: boolean;
  accounts: User[];
  logout: () => void;
  updateProfile: (patch: Partial<Pick<User, 'displayName' | 'username' | 'bio' | 'avatarUrl' | 'bannerUrl'>>) => void;
  saveAccountProfile: (patch: { displayName?: string; bio?: string; bannerUrl?: string | null; avatarUrl?: string | null }) => Promise<'ok' | 'local' | 'offline' | 'invalid' | 'username_taken'>;
  loadAccount: () => Promise<'ok' | 'local' | 'offline' | 'invalid'>;
  applyPresence: (rows: Array<{ id: string; status: User['status']; lastSeenAt?: string }>) => void;
  markSelfOffline: () => void;
  signInWithGoogle: (credential: string) => Promise<{ ok: true; step: 'ready' } | { ok: true; step: 'profile'; name: string; picture: string } | { ok: false; reason: 'invalid' | 'offline' | 'rate_limited' }>;
  finishGoogleProfile: (
    credential: string,
    displayName: string,
    extra?: { avatarUrl?: string; bio?: string; bannerUrl?: string },
  ) => Promise<'ok' | 'invalid' | 'username_taken' | 'offline' | 'rate_limited' | 'profile'>;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  currentUser: initialUser,
  activated: savedAuth.activated === true,
  accounts: initialAccounts,
  logout: () => {
    set({ activated: false });
    writeAuth(get());
    void adminFetch('/api/auth/logout', { method: 'POST', body: {} }).catch(() => undefined);
  },
  updateProfile: (patch) => {
    const next = { ...get().currentUser, ...patch };
    set((state) => ({
      currentUser: next,
      accounts: state.accounts.map((account) => (account.id === next.id ? next : account)),
    }));
    useUserStore.getState().updateUser(next.id, patch);
    writeAuth(get());
  },
  saveAccountProfile: async (patch) => {
    const current = get().currentUser;
    const next = applyAccountPatch(current, patch);
    const remember = (user: User) => {
      set((state) => ({
        currentUser: user,
        accounts: state.accounts.some((account) => account.id === user.id)
          ? state.accounts.map((account) => (account.id === user.id ? user : account))
          : [...state.accounts, user],
      }));
      const directoryPatch = { ...user, avatarUrl: user.avatarUrl, bannerUrl: user.bannerUrl };
      const users = useUserStore.getState();
      if (users.users.some((item) => item.id === user.id)) users.updateUser(user.id, directoryPatch);
      else users.addUser(user);
      writeAuth(get());
    };
    remember(next);
    if (!SERVER_ID.test(current.id)) return 'local';
    try {
      const saved = readDirectoryUser((await adminFetch('/api/profile', {
        method: 'PATCH',
        body: {
          ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
          ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
          ...(patch.bannerUrl !== undefined ? { banner: patch.bannerUrl } : {}),
          ...(patch.avatarUrl !== undefined ? { avatar: patch.avatarUrl } : {}),
        },
      }) as { user?: unknown }).user);
      if (saved) {
        const merged: User = { ...next, ...saved, status: 'online', color: next.color };
        if (!saved.avatarUrl) delete merged.avatarUrl;
        if (!saved.bannerUrl) delete merged.bannerUrl;
        remember(merged);
      }
      return 'ok';
    } catch (error) {
      const reason = inviteFailure(error);
      if (reason !== 'offline') remember(current);
      return reason === 'offline' ? 'offline' : reason === 'username_taken' ? 'username_taken' : 'invalid';
    }
  },
  applyPresence: (rows) => {
    const users = useUserStore.getState();
    for (const row of rows) {
      if (!users.users.some((item) => item.id === row.id)) continue;
      users.updateUser(row.id, row.lastSeenAt ? { status: row.status, lastSeenAt: row.lastSeenAt } : { status: row.status });
    }
    const mine = rows.find((row) => row.id === get().currentUser.id);
    if (!mine) return;
    const next = { ...get().currentUser, status: mine.status, ...(mine.lastSeenAt ? { lastSeenAt: mine.lastSeenAt } : {}) };
    set((state) => ({
      currentUser: next,
      accounts: state.accounts.map((account) => (account.id === next.id ? next : account)),
    }));
  },
  markSelfOffline: () => {
    const current = get().currentUser;
    if (!SERVER_ID.test(current.id) || current.status === 'offline') return;
    const next = { ...current, status: 'offline' as const };
    set((state) => ({
      currentUser: next,
      accounts: state.accounts.map((account) => (account.id === next.id ? next : account)),
    }));
    useUserStore.getState().updateUser(next.id, { status: 'offline' });
  },
  loadAccount: async () => {
    const current = get().currentUser;
    try {
      const saved = readDirectoryUser((await adminFetch('/api/profile') as { user?: unknown }).user);
      if (!saved) return 'invalid';
      const next: User = { ...current, ...saved, status: 'online', color: current.id === saved.id ? current.color : saved.color };
      if (!saved.avatarUrl) delete next.avatarUrl;
      if (!saved.bannerUrl) delete next.bannerUrl;
      set((state) => ({
        currentUser: next,
        accounts: state.accounts.some((account) => account.id === next.id)
          ? state.accounts.map((account) => (account.id === next.id ? next : account))
          : [...state.accounts, next],
      }));
      const users = useUserStore.getState();
      const directoryUser = { ...next, avatarUrl: next.avatarUrl, bannerUrl: next.bannerUrl };
      if (users.users.some((item) => item.id === next.id)) users.updateUser(next.id, directoryUser);
      else users.addUser(directoryUser);
      writeAuth(get());
      return 'ok';
    } catch (error) {
      const reason = inviteFailure(error);
      if (!SERVER_ID.test(current.id) && reason !== 'offline') return 'local';
      return reason === 'offline' ? 'offline' : 'invalid';
    }
  },
  signInWithGoogle: async (credential) => {
    try {
      const payload = await adminFetch('/api/auth/google', { method: 'POST', body: { credential } });
      const ready = readGoogleReadyUser(payload);
      if (ready) {
        const next = { ...ready, status: 'online' as const };
        useUserStore.getState().addUser(next);
        set((state) => ({
          activated: true,
          currentUser: next,
          accounts: state.accounts.some((account) => account.id === next.id)
            ? state.accounts.map((account) => (account.id === next.id ? next : account))
            : [...state.accounts, next],
        }));
        writeAuth(get());
        return { ok: true, step: 'ready' as const };
      }
      const preview = readGooglePreview(payload);
      return preview ? { ok: true, step: 'profile' as const, ...preview } : { ok: false, reason: 'invalid' as const };
    } catch (error) {
      const reason = inviteFailure(error);
      return { ok: false, reason: reason === 'offline' || reason === 'rate_limited' ? reason : 'invalid' };
    }
  },
  finishGoogleProfile: async (credential, displayName, extra) => {
    try {
      const user = readGoogleReadyUser(await adminFetch('/api/auth/google/profile', {
        method: 'POST',
        body: { credential, displayName },
      }));
      if (!user) return 'invalid';
      const bio = extra?.bio?.trim() ?? user.bio;
      const next = applyAccountPatch(
        { ...user, ...(extra?.avatarUrl ? { avatarUrl: extra.avatarUrl } : {}) },
        { bio, ...(extra?.bannerUrl ? { bannerUrl: extra.bannerUrl } : {}) },
      );
      if (bio || extra?.bannerUrl || extra?.avatarUrl) {
        try {
          await adminFetch('/api/profile', {
            method: 'PATCH',
            body: {
              ...(bio ? { bio } : {}),
              ...(extra?.bannerUrl ? { banner: extra.bannerUrl } : {}),
              ...(extra?.avatarUrl ? { avatar: extra.avatarUrl } : {}),
            },
          });
        } catch (error) {
          const reason = inviteFailure(error);
          return reason === 'offline' ? 'offline' : 'profile';
        }
      }
      useUserStore.getState().addUser(next);
      set((state) => ({
        activated: true,
        currentUser: next,
        accounts: state.accounts.some((account) => account.id === next.id)
          ? state.accounts.map((account) => (account.id === next.id ? next : account))
          : [...state.accounts, next],
      }));
      writeAuth(get());
      return 'ok';
    } catch (error) {
      const reason = inviteFailure(error);
      return reason === 'weak_password' ? 'invalid' : reason;
    }
  },
}));

for (const account of [initialUser]) {
  const users = useUserStore.getState();
  if (users.users.some((user) => user.id === account.id)) users.updateUser(account.id, account);
  else users.addUser(account);
}
