import type { UserProfileModel } from '#layers/auth/types/models/profile';

export interface SettingsSectionProps {
  profile: UserProfileModel;
  refresh: () => Promise<void>;
}

export interface SettingsOAuthNotice {
  variant: 'success' | 'destructive';
  title: string;
  message: string;
}
