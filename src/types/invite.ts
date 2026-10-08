export interface InviteCode {
  id: string;
  code: string;
  isActive: boolean;
  usedBy: string | null;
  expiresAt?: string;
}
