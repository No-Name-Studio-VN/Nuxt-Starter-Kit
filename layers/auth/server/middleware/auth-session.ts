export default defineEventHandler(async (event) => {
  const { name, maxAge } = useRuntimeConfig(event).session;
  const cookieName = name === 'nuxt-session' ? USER_SESSION_COOKIE_NAME : name ?? USER_SESSION_COOKIE_NAME;
  if (!getCookie(event, cookieName)) return;

  const { user, signedInAt } = await getUserSession(event);
  // A pending 2FA session has no authenticated user or sign-in timestamp yet.
  if (!user) return;

  const now = Date.now();
  if (typeof signedInAt !== 'number' || !Number.isSafeInteger(signedInAt) || signedInAt <= 0 ||
    signedInAt > now || now - signedInAt >= maxAge * 1000) {
    await clearUserSession(event);
  }
});
