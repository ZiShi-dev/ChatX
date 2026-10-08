export interface Group {
  id: string;
  name: string;
  type: 'group';
  adminId: string;
  memberIds: string[];
}
