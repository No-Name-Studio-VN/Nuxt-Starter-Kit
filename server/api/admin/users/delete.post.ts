import { deleteUsers } from '~~/server/utils/database/user'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { userIds } = body

  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw createError({
      statusCode: 400,
      message: 'User IDs array is required',
    })
  }

  try {
    await deleteUsers(userIds)

    return {
      success: true,
      deleted: userIds.length,
    }
  }
  catch (error) {
    console.error('Error deleting users:', error)

    throw createError({
      statusCode: 500,
      message: 'Failed to delete users',
    })
  }
})
