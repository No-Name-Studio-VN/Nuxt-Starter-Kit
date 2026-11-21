import { BOT_PROTECTION_TOKEN_FIELD, BOT_PROTECTION_TOKEN_HEADER } from '#shared/constants/formChallenge';
import type { H3Event } from 'h3';
import type { BotProtectionProvider, BotProtectionResult } from '../../types/botProtection';
import { verifyTurnstile } from '../providers/turnstile';

const providers = new Map<string, BotProtectionProvider>([['turnstile', verifyTurnstile]]);
const results = new WeakMap<H3Event, Promise<BotProtectionResult>>();

export function registerBotProtectionProvider(name: string, verify: BotProtectionProvider): void {
  if (providers.has(name)) throw new Error(`Bot protection provider "${name}" is already registered.`);
  providers.set(name, verify);
}

export function isUrlEncodedForm(event: H3Event): boolean {
  const contentType = getRequestHeader(event, 'content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  return contentType === 'application/x-www-form-urlencoded';
}

async function readToken(event: H3Event): Promise<string | undefined> {
  const header = getRequestHeader(event, BOT_PROTECTION_TOKEN_HEADER);
  if (header !== undefined) return header.trim();
  if (!isUrlEncodedForm(event) || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(event.method)) return;
  const body = await readBody<Record<string, unknown> | undefined>(event);
  const field = body?.[BOT_PROTECTION_TOKEN_FIELD];
  if (typeof field === 'string') return field.trim();
}

async function verify(event: H3Event): Promise<BotProtectionResult> {
  const token = await readToken(event);
  if (!token) return { ok: false, reason: 'missing-token' };

  try {
    const { provider } = useRuntimeConfig(event).botProtection;
    const verifyToken = providers.get(provider);
    if (!verifyToken) throw new Error('Provider is not registered');
    if (await verifyToken({ event, token })) return { ok: true };
    return { ok: false, reason: 'invalid-token' };
  } catch {
    // Avoid logging provider errors that might contain a token or secret.
    console.error('[bot-protection] Verification unavailable. Check the configured provider, its credentials, and network access.');
    return { ok: false, reason: 'unavailable' };
  }
}

export function verifyBotProtection(event: H3Event): Promise<BotProtectionResult> {
  const previous = results.get(event);
  if (previous) return previous;
  // Middleware and a handler may both ask. Provider tokens can only be used once.
  const result = verify(event);
  results.set(event, result);
  return result;
}
