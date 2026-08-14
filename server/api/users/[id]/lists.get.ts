import { apiError, success } from '~~/server/utils/apiResponse';
import userListService from '~~/server/utils/database/userList';

export default defineEventHandler(async (event) => {
  const ownerUserId = Number(getRouterParam(event, 'id'));
  if (!Number.isInteger(ownerUserId) || ownerUserId <= 0) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Bad Request. User ID is invalid.',
      code: 'INVALID_USER_ID',
    });
  }

  let viewerUserId: number | null = null;

  try {
    const session = await getUserSession(event);
    if (session?.user?.id) {
      viewerUserId = session.user.id;
    }
  } catch {
    viewerUserId = null;
  }

  const payload = await userListService.getPublicListsForUser(event, ownerUserId, viewerUserId);

  return success(payload);
});
