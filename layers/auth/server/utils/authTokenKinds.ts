import type { AuthTokenKind, AuthTokenKindRegistration } from '#layers/auth/types/authTokens';

// Filled once by Nitro plugins; shared by every request.
const tokenKinds = new Map<AuthTokenKind, number>();

/** Throws when the id is taken, so no layer can replace another's token lifetime. */
export function registerAuthTokenKind(kind: AuthTokenKindRegistration): void {
  if (tokenKinds.has(kind.id)) {
    throw new Error(`Auth token kind "${kind.id}" is already registered.`);
  }
  if (!Number.isFinite(kind.expiresInMs) || kind.expiresInMs <= 0) {
    throw new Error(`Auth token kind "${kind.id}" must have a positive, finite lifetime.`);
  }

  tokenKinds.set(kind.id, kind.expiresInMs);
}

export function getAuthTokenLifetime(kind: AuthTokenKind): number {
  const lifetime = tokenKinds.get(kind);
  if (lifetime === undefined) {
    throw new Error(`Auth token kind "${kind}" is not registered.`);
  }

  return lifetime;
}
