import communityDeletionService from '~~/server/utils/database/communityDeletion';
import { success } from '~~/server/utils/apiResponse';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);

  await communityDeletionService.deleteUsers([session.user.id]);

  return success({});
});
