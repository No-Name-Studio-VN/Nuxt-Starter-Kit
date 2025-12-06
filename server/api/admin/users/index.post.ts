import { createUser } from '~~/server/utils/database/user'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { username, name, password, isAdmin } = body

  // Validation
  if (!username || !name || !password) {
    throw createError({
      statusCode: 400,
      message: 'Username, name, and password are required',
    })
  }

  try {
    const now = new Date()

    const user = await createUser({
      username: username.toLowerCase().trim(),
      name: name.trim(),
      password: await hashPassword(password),
      isAdmin: isAdmin || false,
      createdAt: now,
      lastLoginAt: now,
    })

    return {
      id: user.id,
      username: user.username,
      name: user.name,
      isAdmin: user.isAdmin,
    }
  }
  catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      throw createError({
        statusCode: 409,
        message: 'Username already exists',
      })
    }

    throw createError({
      statusCode: 500,
      message: 'Failed to create user',
    })
  }
})
