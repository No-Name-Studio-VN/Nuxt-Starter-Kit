import { TURNSTILE_TEST_SECRET_KEY } from '../../shared/constants/turnstile';
import type { BotProtectionProvider } from '../../types/botProtection';

export const verifyTurnstile: BotProtectionProvider = async ({ event, token }) => {
  const config = useRuntimeConfig(event);
  const turnstile = config.turnstile;
  const devTestKeys = import.meta.dev && config.public.botProtection?.devTestKeys;
  const secret = devTestKeys
    ? TURNSTILE_TEST_SECRET_KEY
    : typeof turnstile === 'object' && turnstile && 'secretKey' in turnstile && typeof turnstile.secretKey === 'string'
      ? turnstile.secretKey
      : undefined;
  if (!secret) throw new Error('Missing NUXT_TURNSTILE_SECRET_KEY');
  if (token.length > 2048) return false;

  const body = new URLSearchParams({ secret, response: token });
  const ip = (event.context.cloudflare && getRequestHeader(event, 'cf-connecting-ip')) || getRequestIP(event);
  if (ip) body.set('remoteip', ip);

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Siteverify is unavailable');
  const result: unknown = await response.json();
  if (typeof result !== 'object' || result === null || !('success' in result) || result.success !== true) return false;
  // Cloudflare's dummy verification response always reports localhost.
  return devTestKeys || ('hostname' in result && result.hostname === getRequestURL(event).hostname);
};
