import { passkeySignInMethodSource } from '#layers/auth-passkeys/server/utils/passkeySignInMethods';
import { registerSignInMethodSource } from '#layers/auth/server/utils/signInMethods';

export default defineNitroPlugin(() => {
  registerSignInMethodSource(passkeySignInMethodSource);
});
