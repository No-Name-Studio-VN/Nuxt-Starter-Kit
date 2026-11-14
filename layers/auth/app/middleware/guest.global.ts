import guest from './guest';

// Auth's own guest pages. Pages from other layers opt in with
// `definePageMeta({ middleware: ['guest'] })`.
const ignoredPaths = [
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
];

export default defineNuxtRouteMiddleware((to, from) => {
  if (ignoredPaths.includes(to.path)) {
    return guest(to, from);
  }
});
