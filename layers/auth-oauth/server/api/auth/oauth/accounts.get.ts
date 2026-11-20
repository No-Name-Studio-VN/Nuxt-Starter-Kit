import oauthAccountService from '#layers/auth-oauth/server/utils/database/oauthAccount';
import { success } from '#layers/server-core/server/utils/apiResponse';

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  setResponseHeader(event, 'Cache-Control', 'private, no-store');
  return success(await oauthAccountService.getByUserId(user.id));
});
