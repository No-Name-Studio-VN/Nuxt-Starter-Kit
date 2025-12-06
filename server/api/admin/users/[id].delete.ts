import { deleteUser } from '~~/server/utils/database/user'

export default defineEventHandler(async (event) => {
  const userId = parseInt(getRouterParam(event, 'id') || '0')

  if (!userId || userId <= 0) {
    throw createError({
      statusCode: 400,
      message: 'Invalid user ID',
    })
  }

  try {
    await deleteUser(userId)

    return { success: true }
  }
  catch {
    throw createError({
      statusCode: 500,
      message: 'Failed to delete user',
    })
  }
})
