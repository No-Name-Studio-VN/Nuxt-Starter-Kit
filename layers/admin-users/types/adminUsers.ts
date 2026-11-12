export interface AdminUserModel {
  id: number;
  username: string;
  name: string;
  email: string;
  isAdmin: boolean;
  isLocked: boolean;
  emailVerified: boolean;
}
