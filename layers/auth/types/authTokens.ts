export type AuthTokenKind = string;

export interface AuthTokenKindRegistration {
  id: AuthTokenKind;
  expiresInMs: number;
}
