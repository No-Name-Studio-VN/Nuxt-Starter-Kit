import { withQuery } from 'ufo';
import { isUrlEncodedForm, verifyBotProtection } from '../utils/botProtection';

export default defineEventHandler(async (event) => {
  if (event.method === 'GET') return;
  const rules = getRouteRules(event);
  if (!('botProtection' in rules)) return;
  const rule = rules.botProtection;
  if (rule !== true && (!rule || typeof rule !== 'object')) return;

  const result = await verifyBotProtection(event);
  if (result.ok) return;
  if (event.method === 'POST' && rule !== true && 'redirect' in rule && typeof rule.redirect === 'string' && isUrlEncodedForm(event)) {
    return sendRedirect(event, withQuery(rule.redirect, { error: 'bot-protection' }));
  }

  const { reason } = result;
  const message = reason === 'missing-token' ? 'Complete the security check and try again.'
    : reason === 'invalid-token' ? 'Security verification failed. Please try again.'
      : 'Security verification is unavailable. Please try again later.';
  throw apiError({ status: 403, statusText: 'Forbidden', code: 'BOT_PROTECTION_FAILED', message, details: { reason } });
});
