import type { H3Event } from 'h3'
import userService from '~~/server/utils/database/user'
import { apiError } from '~~/server/utils/apiResponse'

/**
 * Get the target user ID from route parameter and verify access permissions.
 * - Admins can access any user's data
 * - Regular users can only access their own data (via their ID or "me")
 *
 * @param event - The H3 event object
 * @param paramName - The route parameter name (default: 'id')
 * @returns The resolved user ID that can be accessed
 * @throws 403 error if user doesn't have permission to access the requested user
 */
export async function getAuthorizedUserId(event: H3Event, paramName = 'id'): Promise<number> {
  const session = await getUserSession(event)

  if (!session.user) {
    throw apiError({
      status: 401,
      statusText: 'Unauthorized',
      message: 'Unauthorized. You must be signed in to access this resource.',
      code: 'AUTH_REQUIRED',
    })
  }

  const currentUserId = session.user.id

  // Get the current user from database to check admin status
  const currentUser = await userService.getById(currentUserId)
  if (!currentUser) {
    throw apiError({
      status: 404,
      statusText: 'Not Found',
      message: 'Authenticated user account not found.',
      code: 'USER_NOT_FOUND',
    })
  }

  // Get the target user ID from route parameter
  const targetId = getRouterParam(event, paramName)
  if (!targetId) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Bad Request. User ID parameter is missing.',
      code: 'USER_ID_MISSING',
    })
  }

  // Resolve "me" to the current user's ID
  const resolvedTargetId = targetId === 'me' ? currentUserId : Number(targetId)

  // Validate that the resolved ID is a valid number
  if (isNaN(resolvedTargetId)) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Bad Request. The provided user ID is not a valid number.',
      code: 'USER_ID_INVALID',
    })
  }

  // Admins can access any user's data
  if (currentUser.isAdmin) {
    return resolvedTargetId
  }

  // Regular users can only access their own data
  if (resolvedTargetId !== currentUserId) {
    throw apiError({
      status: 403,
      statusText: 'Forbidden',
      message: 'Forbidden. You do not have permission to access this user\'s data.',
      code: 'USER_ACCESS_FORBIDDEN',
    })
  }

  return resolvedTargetId
}
