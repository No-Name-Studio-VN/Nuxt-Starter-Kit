export interface GoogleCredentialResponse {
  credential: string;
  select_by?: string;
  state?: string;
}

export interface GooglePromptMomentNotification {
  isDisplayed?: () => boolean;
  isNotDisplayed?: () => boolean;
  isSkippedMoment?: () => boolean;
  isDismissedMoment?: () => boolean;
  getNotDisplayedReason?: () => string;
  getSkippedReason?: () => string;
  getDismissedReason?: () => string;
}

export interface GoogleAccountsIdInitializeOptions {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
  use_fedcm_for_prompt?: boolean;
}

export interface GoogleAccountsId {
  initialize(options: GoogleAccountsIdInitializeOptions): void;
  prompt(momentListener?: (notification: GooglePromptMomentNotification) => void): void;
  cancel(): void;
  disableAutoSelect(): void;
}

export interface GoogleIdentityServices {
  accounts?: {
    id?: GoogleAccountsId;
  };
}
