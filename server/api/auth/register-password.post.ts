import { z } from 'zod'
import { createUser, getUserByUsername } from '~~/server/utils/database/user'

// Enhanced password complexity validation matching client-side requirements
const passwordComplexitySchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character')

const registerSchema = z.object({
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Username too long')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, hyphens, and underscores'),
  email: z.string().email('Valid email is required'),
  password: passwordComplexitySchema,
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { username, email: _email, password } = await registerSchema.parseAsync(body)

  // Check if username already exists
  const existingUser = await getUserByUsername(username)

  if (existingUser) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Username already exists',
    })
  }

  // Hash password using nuxt-auth-utils
  const hashedPassword = await hashPassword(password)

  // Create user
  const newUser = await createUser({
    username: username.toLowerCase().trim(),
    name: username.trim(),
    password: hashedPassword,
    createdAt: new Date(),
    lastLoginAt: new Date(),
  })

  // Set user session
  await setUserSession(event, {
    user: {
      id: newUser.id,
      username: newUser.username,
      name: newUser.name,
    },
  })

  return {
    success: true,
    user: {
      id: newUser.id,
      username: newUser.username,
      name: newUser.name,
    },
    statusMessage: 'Account created successfully. You can now create a passkey for additional security.',
  }
})
