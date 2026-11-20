import { cacheSignInAvatar } from '#layers/auth/app/utils/cacheSignInAvatar';
import {
  getLastSignInStorage,
  saveCachedSignInAvatar,
  syncLastSignIn,
} from '#layers/auth/app/utils/lastSignIn';

export default defineNuxtPlugin(() => {
  const { session } = useUserSession();
  onNuxtReady(() => {
    const storage = getLastSignInStorage();
    if (!storage) return;

    let triedAvatar = '';
    watch(session, async (value) => {
      const record = syncLastSignIn(storage, value);
      if (!record?.avatarUrl || record.avatar !== record.avatarUrl) return;
      const attempt = `${record.savedAt}:${record.avatarUrl}`;
      if (attempt === triedAvatar) return;
      triedAvatar = attempt;

      const avatar = await cacheSignInAvatar(record.avatarUrl);
      if (avatar) saveCachedSignInAvatar(storage, record, avatar);
    }, { immediate: true });
  });
});
