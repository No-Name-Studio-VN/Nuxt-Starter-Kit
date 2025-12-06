import { z } from 'zod'
import { getUserByUsername } from '~~/server/utils/database/user'

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { username, password } = await loginSchema.parseAsync(body)

  // Find user by username
  const user = await getUserByUsername(username)

  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Cannot find user with the provided username',
    })
  }

  // Verify password using nuxt-auth-utils
  const isValidPassword = await verifyPassword(user.password, password)

  if (!isValidPassword) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid username or password',
    })
  }

  // Update last login
  await updateUser(user.id, { lastLoginAt: new Date() })

  // Set user session
  await setUserSession(event, {
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
    },
  })

  return { success: true }
})
