import { IncomingMessage, ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { Socket } from 'node:net';
import type * as H3 from 'h3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { disableTotpSchema } from '../../../layers/auth-2fa/shared/schemas/twoFactorSchema';
import { readValidatedRequestBody } from '../../../layers/server-core/server/utils/requestBody';

// Nuxt's test utilities and the Nitro runtime can use different H3 versions.
const nuxtRequire = createRequire(import.meta.resolve('nuxt'));
const nitroRequire = createRequire(nuxtRequire.resolve('@nuxt/nitro-server'));
const { createEvent, readValidatedBody }: typeof H3 = await import(
  createRequire(nitroRequire.resolve('nitropack/package.json')).resolve('h3')
);

const url = 'https://example.test/api/users/me/2fa/disable';
const headers = { 'content-type': 'application/json' };
const validBody = JSON.stringify({ password: 'current-password' });

function eventWithBody(method: 'DELETE' | 'POST', body: string, worker = false) {
  const request = new Request(url, { method, headers, body });
  const nodeRequest = new IncomingMessage(new Socket());
  nodeRequest.method = method;
  nodeRequest.headers = headers;
  const event = createEvent(nodeRequest, new ServerResponse(nodeRequest));
  if (worker) {
    event.context.cloudflare = { request };
  } else {
    event.web = { request };
  }
  return event;
}

beforeEach(() => vi.stubGlobal('readValidatedBody', readValidatedBody));
afterEach(() => vi.unstubAllGlobals());

describe('readValidatedRequestBody', () => {
  it('reads the original Worker request when Nitro did not forward the DELETE body', async () => {
    const event = eventWithBody('DELETE', validBody, true);
    await expect(readValidatedRequestBody(event, disableTotpSchema.safeParse)).resolves.toEqual({
      success: true,
      data: { password: 'current-password' },
    });
  });

  it('returns validation failures for an invalid Worker DELETE body', async () => {
    const event = eventWithBody('DELETE', '{}', true);
    await expect(readValidatedRequestBody(event, disableTotpSchema.safeParse)).resolves.toMatchObject({
      success: false,
    });
  });

  it('keeps the usual H3 error for malformed Worker DELETE JSON', async () => {
    const event = eventWithBody('DELETE', '{', true);
    await expect(readValidatedRequestBody(event, disableTotpSchema.safeParse)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('keeps reading the forwarded H3 body for POST on a Worker', async () => {
    const event = eventWithBody('POST', validBody);
    event.context.cloudflare = { request: new Request(url, { method: 'POST' }) };
    await expect(readValidatedRequestBody(event, disableTotpSchema.safeParse)).resolves.toMatchObject({
      success: true,
    });
  });

  it('keeps reading the H3 body outside Workers', async () => {
    const event = eventWithBody('DELETE', validBody);
    await expect(readValidatedRequestBody(event, disableTotpSchema.safeParse)).resolves.toMatchObject({
      success: true,
    });
  });
});
