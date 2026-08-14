export const TOTP_LENGTH = 6;
export const MAX_TOTP_ATTEMPTS = 10;

// Lock timeout options (in minutes)
export const LOCK_TIMEOUT_OPTIONS = [
  { label: 'Immediately', value: 0 },
  { label: '1 minute', value: 1 },
  { label: '5 minutes', value: 5 },
  { label: '15 minutes', value: 15 },
  { label: '30 minutes', value: 30 },
  { label: '1 hour', value: 60 },
  { label: 'Never', value: -1 },
] as const;
