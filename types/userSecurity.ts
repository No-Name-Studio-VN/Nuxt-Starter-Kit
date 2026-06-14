export interface TwoFactorSetupPayload {
  uri: string
  secret: string
}

export interface TwoFactorVerifyPayload {
  backupCodes: string[]
}

export interface LoginTwoFactorValidationPayload {
  valid: boolean
}

export interface PasswordUpdatePayload {
  message: string
}
