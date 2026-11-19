import userService from '#layers/auth/server/utils/database/user';
import { shouldGrantAdmin } from '#layers/admin/server/utils/adminAccess';

/** Grants admin from `shouldGrantAdmin` before the session is written. Never revokes. */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('auth:signed-in', async (signIn) => {
    if (signIn.user.isAdmin || !shouldGrantAdmin(signIn)) return;

    await userService.update({ id: signIn.user.id, isAdmin: true });
  });
});
