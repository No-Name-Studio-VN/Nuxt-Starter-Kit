import type { H3Event } from 'h3';
import type { z } from 'zod';

export function readValidatedRequestBody<T>(
  event: H3Event,
  validate: (body: unknown) => z.ZodSafeParseResult<T>,
) {
  const cloudflare: unknown = event.context.cloudflare;
  const request = typeof cloudflare === 'object' && cloudflare !== null && 'request' in cloudflare
    ? cloudflare.request
    : undefined;

  // Nitro only forwards POST, PUT and PATCH bodies on Cloudflare. Give H3 the
  // original Worker request for DELETE so its normal parsing and validation still apply.
  if (request instanceof Request && !['POST', 'PUT', 'PATCH'].includes(request.method)) {
    event.web = { ...event.web, request };
  }

  return readValidatedBody(event, validate);
}
