import type { H3Event } from 'h3';
import { apiError, success } from '~~/server/utils/apiResponse';

function getBearerToken(authorization: string | undefined): string | undefined {
  const prefix = 'Bearer ';
  return authorization?.startsWith(prefix) ? authorization.slice(prefix.length).trim() : undefined;
}

function getSeedSecret(event: H3Event): string | undefined {
  return getHeader(event, 'x-seed-secret') ?? getBearerToken(getHeader(event, 'authorization'));
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const seedSecret = config.seed.secret.toString();
  if (!seedSecret) {
    throw apiError({
      status: 503,
      statusText: 'Service Unavailable',
      message: 'Seed endpoint is not configured.',
      code: 'SEED_ENDPOINT_NOT_CONFIGURED',
    });
  }

  if (getSeedSecret(event) !== seedSecret) {
    throw apiError({
      status: 401,
      statusText: 'Unauthorized',
      message: 'Unauthorized. A valid seed secret is required.',
      code: 'INVALID_SEED_SECRET',
    });
  }

  const defaultAdminPassword = config.defaultAdminPassword.toString();
  if (!defaultAdminPassword) {
    throw apiError({
      status: 503,
      statusText: 'Service Unavailable',
      message: 'Default admin password is not configured.',
      code: 'DEFAULT_ADMIN_PASSWORD_NOT_CONFIGURED',
    });
  }

  const summary = await seedDatabase(defaultAdminPassword);

  return success(summary, 'Database seed completed.');
});
