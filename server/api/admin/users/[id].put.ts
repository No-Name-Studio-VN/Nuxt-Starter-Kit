export default defineEventHandler(async (event) => {
  const userId = parseInt(getRouterParam(event, 'id') || '0')
  const body = await readBody(event)
  const { name, isAdmin } = body

  // Validation
  if (!userId || userId <= 0) {
    throw createError({
      statusCode: 400,
      message: 'Invalid user ID',
    })
  }

  try {
    const updateData: Record<string, unknown> = {}

    if (name) {
      updateData.name = name.trim()
    }

    if (typeof isAdmin === 'boolean') {
      updateData.isAdmin = isAdmin
    }

    const user = await updateUser(userId, updateData)

    if (!user) {
      throw createError({
        statusCode: 404,
        message: 'User not found',
      })
    }

    return {
      id: user.id,
      username: user.username,
      name: user.name,
      isAdmin: user.isAdmin,
    }
  }
  catch (error) {
    if (error instanceof Error && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: 'Failed to update user',
    })
  }
})
