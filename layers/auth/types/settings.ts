import type { UserProfileModel } from '#layers/auth/types/models/profile';

export interface SettingsSectionProps {
  profile: UserProfileModel;
  refresh: () => Promise<void>;
}
