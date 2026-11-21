import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as H3 from 'h3';
import { apiError } from '../../../layers/server-core/server/utils/apiResponse';
import { parseApiError } from '../../../layers/server-core/app/utils/apiError';
import { loginSchema, registerUserSchema } from '../../../layers/auth-password/shared/schemas/passwordSchema';

const nuxtRequire = createRequire(import.meta.resolve('nuxt'));
const nitroRequire = createRequire(nuxtRequire.resolve('@nuxt/nitro-server'));
const { createApp, createError, defineEventHandler, getRequestHeader, getRequestIP, getRequestURL, readBody, readValidatedBody, sendRedirect, toWebHandler }: typeof H3 = await import(
  createRequire(nitroRequire.resolve('nitropack/package.json')).resolve('h3')
);

let provider = 'turnstile';
let secretKey = 'test-secret';
let devTestKeys = false;
let handlerCalls = 0;
const siteverify = vi.fn<typeof fetch>();

beforeEach(() => {
  provider = 'turnstile';
  secretKey = 'test-secret';
  devTestKeys = false;
  handlerCalls = 0;
  siteverify.mockReset();
  vi.stubGlobal('defineEventHandler', defineEventHandler);
  vi.stubGlobal('createError', createError);
  vi.stubGlobal('apiError', apiError);
  vi.stubGlobal('useRuntimeConfig', () => ({
    botProtection: { provider }, turnstile: { secretKey }, public: { botProtection: { devTestKeys } },
  }));
  vi.stubGlobal('getRouteRules', (event: H3.H3Event) => ({
    botProtection: event.path === '/api/login' ? { redirect: '/auth/login?from=form' } : event.path === '/api/contact',
  }));
  vi.stubGlobal('getRequestHeader', getRequestHeader);
  vi.stubGlobal('getRequestIP', getRequestIP);
  vi.stubGlobal('getRequestURL', getRequestURL);
  vi.stubGlobal('readBody', readBody);
  vi.stubGlobal('sendRedirect', sendRedirect);
  vi.stubGlobal('fetch', siteverify);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function request(path: string, method: string, token?: string, options?: RequestInit) {
  const { default: middleware } = await import('../../../layers/bot-protection/server/middleware/botProtection');
  const app = createApp({ debug: false });
  app.use(defineEventHandler((event) => {
    event.context.cloudflare = {};
  }));
  app.use(middleware);
  app.use(defineEventHandler(async (event) => {
    handlerCalls += 1;
    if (event.path === '/api/login') {
      const result = await readValidatedBody(event, (value) => loginSchema.safeParse(value));
      return result.success ? result.data : { handled: false };
    }
    return { handled: true };
  }));
  const headers = new Headers(options?.headers);
  headers.set('cf-connecting-ip', '192.0.2.10');
  headers.set('host', 'kit.test');
  if (token !== undefined) headers.set('x-bot-protection-token', token);
  return toWebHandler(app)(new Request(`https://kit.test${path}`, { ...options, method, headers }));
}

describe('bot protection', () => {
  it('leaves unprotected paths and GET requests alone', async () => {
    expect((await request('/api/other', 'POST')).status).toBe(200);
    expect((await request('/api/contact', 'GET')).status).toBe(200);
    expect(handlerCalls).toBe(2);
    expect(siteverify).not.toHaveBeenCalled();
  });

  it('rejects missing and invalid tokens before the handler', async () => {
    siteverify.mockResolvedValue(Response.json({ success: false }));
    expect((await request('/api/contact', 'POST')).status).toBe(403);
    expect((await request('/api/contact', 'POST', 'invalid')).status).toBe(403);
    expect(handlerCalls).toBe(0);
    expect(siteverify).toHaveBeenCalledTimes(1);
  });

  it('accepts a native form token without consuming the body needed by the handler', async () => {
    siteverify.mockResolvedValue(Response.json({ success: true, hostname: 'kit.test' }));
    const response = await request('/api/login', 'POST', undefined, {
      body: new URLSearchParams({ username: 'Alice', password: 'Secret#123', 'bot-protection-token': 'form-token' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ username: 'alice', password: 'Secret#123' });
    expect(siteverify).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      body: new URLSearchParams({ secret: 'test-secret', response: 'form-token', remoteip: '192.0.2.10' }),
    }));
  });

  it('can verify an encoded body on a protected non-POST endpoint', async () => {
    siteverify.mockResolvedValue(Response.json({ success: true, hostname: 'kit.test' }));
    const response = await request('/api/contact', 'PUT', undefined, {
      body: new URLSearchParams({ 'bot-protection-token': 'form-token' }),
    });

    expect(response.status).toBe(200);
    expect(handlerCalls).toBe(1);
  });

  it('does not use the form token if a header was provided', async () => {
    siteverify.mockResolvedValue(Response.json({ success: false }));
    const response = await request('/api/login', 'POST', 'header-token', {
      body: new URLSearchParams({ 'bot-protection-token': 'form-token' }),
    });

    expect(response.status).toBe(302);
    expect(siteverify).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      body: new URLSearchParams({ secret: 'test-secret', response: 'header-token', remoteip: '192.0.2.10' }),
    }));
  });

  it('redirects failed native form submissions to the configured page', async () => {
    const response = await request('/api/login', 'POST', undefined, {
      body: new URLSearchParams({ username: 'Alice' }),
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/auth/login?from=form&error=bot-protection');
    expect(handlerCalls).toBe(0);
  });

  it('returns the English API error and reason for JSON even with a redirect rule and Vietnamese locale', async () => {
    const response = await request('/api/login', 'POST', undefined, {
      headers: { 'content-type': 'application/json', 'accept-language': 'vi-VN,vi;q=0.9' },
      body: JSON.stringify({ 'bot-protection-token': 'ignored' }),
    });

    expect(response.status).toBe(403);
    expect(response.headers.get('location')).toBeNull();
    expect(parseApiError(await response.json())).toMatchObject({
      code: 'BOT_PROTECTION_FAILED',
      message: 'Complete the security check and try again.',
      details: { reason: 'missing-token' },
    });
    expect(handlerCalls).toBe(0);
  });

  it('returns English for boolean rules regardless of the requested locale', async () => {
    const response = await request('/api/contact', 'POST', undefined, {
      headers: { 'accept-language': 'vi' },
      body: new URLSearchParams(),
    });

    expect(response.status).toBe(403);
    expect(parseApiError(await response.json())).toMatchObject({
      message: 'Complete the security check and try again.',
      details: { reason: 'missing-token' },
    });
  });

  it('strips the challenge field from a validated registration', () => {
    const registration = { username: 'alice', name: 'Alice', email: 'alice@example.com', password: 'Secret#123', 'confirm-password': 'Secret#123' };
    expect(registerUserSchema.parse({ ...registration, 'bot-protection-token': 'form-token' })).toEqual(registration);
  });

  it('rejects successful Siteverify responses for the wrong or missing hostname', async () => {
    siteverify.mockResolvedValueOnce(Response.json({ success: true, hostname: 'other.test' }));
    siteverify.mockResolvedValueOnce(Response.json({ success: true }));
    for (const response of [await request('/api/contact', 'POST', 'valid'), await request('/api/contact', 'POST', 'valid')]) {
      expect(response.status).toBe(403);
      expect(parseApiError(await response.json()).details).toEqual({ reason: 'invalid-token' });
    }
    expect(handlerCalls).toBe(0);
  });

  it('allows a verified token for the request hostname and sends the client IP to Siteverify', async () => {
    siteverify.mockResolvedValue(Response.json({ success: true, hostname: 'kit.test' }));
    expect((await request('/api/contact', 'POST', 'valid')).status).toBe(200);
    expect(handlerCalls).toBe(1);
    expect(siteverify).toHaveBeenCalledWith('https://challenges.cloudflare.com/turnstile/v0/siteverify', expect.objectContaining({
      method: 'POST',
      body: new URLSearchParams({ secret: 'test-secret', response: 'valid', remoteip: '192.0.2.10' }),
    }));
  });

  it('keeps the hostname check outside development even if the test pair flag is set', async () => {
    devTestKeys = true;
    siteverify.mockResolvedValue(Response.json({ success: true, hostname: 'localhost' }));
    expect((await request('/api/contact', 'POST', 'valid')).status).toBe(403);
    expect(handlerCalls).toBe(0);
  });

  it('fails closed without a production secret', async () => {
    secretKey = '';
    expect((await request('/api/contact', 'POST', 'token')).status).toBe(403);
    expect(handlerCalls).toBe(0);
    expect(siteverify).not.toHaveBeenCalled();
  });

  it('uses a registered custom provider for both manual and automatic verification', async () => {
    const { registerBotProtectionProvider, verifyBotProtection } = await import('../../../layers/bot-protection/server/utils/botProtection');
    provider = 'fixture';
    registerBotProtectionProvider('fixture', ({ token, event }) => token === `allow:${event.method}`);
    const app = createApp();
    app.use(defineEventHandler(verifyBotProtection));
    const handle = toWebHandler(app);
    const result = await handle(new Request('https://kit.test/api/other', { headers: { 'x-bot-protection-token': 'allow:GET' } }));
    expect(await result.json()).toEqual({ ok: true });
    expect((await request('/api/contact', 'POST', 'allow:GET')).status).toBe(403);
    expect((await request('/api/contact', 'POST', 'allow:POST')).status).toBe(200);
    expect(handlerCalls).toBe(1);
    expect(siteverify).not.toHaveBeenCalled();
  });
});
