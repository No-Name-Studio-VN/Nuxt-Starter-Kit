import { registerAuthTokenKind } from '#layers/auth/server/utils/authTokenKinds';
import { AuthTokenType, PASSWORD_RESET_EXPIRY_MS } from '#layers/auth/shared/constants/authTokens';

export default defineNitroPlugin(() => {
  registerAuthTokenKind({
    id: AuthTokenType.PasswordReset,
    expiresInMs: PASSWORD_RESET_EXPIRY_MS,
  });
});
