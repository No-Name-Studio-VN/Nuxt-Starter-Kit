import { eq, inArray } from 'drizzle-orm'
import { getUserCacheKey } from '../constants/cacheKeys'
import type { User } from '../db'
import { CACHE_TTL } from '@/constants/cachettl'

/**
 * Get a user by their ID
 * Uses caching for performance
 */
export async function getUserById(id: number) {
  const db = useDB()
  const cache = hubKV()
  const cacheKey = getUserCacheKey(id)

  const cachedUser = await cache.get<User>(cacheKey)
  if (cachedUser) {
    return cachedUser
  }

  const user = await db
    .select()
    .from(tables.users)
    .where(eq(tables.users.id, id))
    .get()

  if (user) {
    await cache.set<User>(cacheKey, user, { ttl: CACHE_TTL.ONE_DAY })
  }

  return user
}

/**
 * Get a user by their username
 */
export async function getUserByUsername(username: string) {
  const db = useDB()

  const user = await db
    .select()
    .from(tables.users)
    .where(eq(tables.users.username, username.toLowerCase().trim()))
    .get()

  return user
}

/**
 * Create a new user
 */
export async function createUser(data: typeof tables.users.$inferInsert) {
  const db = useDB()

  const newUser = await db
    .insert(tables.users)
    .values(data)
    .returning()
    .get()

  const cache = hubKV()
  const cacheKey = getUserCacheKey(newUser.id)
  await cache.set<User>(cacheKey, newUser, { ttl: CACHE_TTL.ONE_DAY })

  return newUser
}

/**
 * Update a user by their ID
 * Invalidates cache after update
 */
export async function updateUser(
  id: number,
  data: Partial<typeof tables.users.$inferInsert>,
) {
  const db = useDB()
  const cache = hubKV()
  const cacheKey = getUserCacheKey(id)

  const updatedUser = await db
    .update(tables.users)
    .set(data)
    .where(eq(tables.users.id, id))
    .returning()
    .get()

  if (updatedUser) {
    await cache.set<User>(cacheKey, updatedUser, { ttl: CACHE_TTL.ONE_DAY })
  }
  else {
    await cache.del(cacheKey)
  }

  return updatedUser
}

/**
 * Delete a user by their ID
 * Invalidates cache after deletion
 */
export async function deleteUser(id: number) {
  const db = useDB()
  const cache = hubKV()
  const cacheKey = getUserCacheKey(id)

  await db
    .delete(tables.users)
    .where(eq(tables.users.id, id))
    .execute()

  await cache.del(cacheKey)
}

/**
 * Delete multiple users by their IDs
 * Invalidates cache for all deleted users
 */
export async function deleteUsers(ids: number[]) {
  const db = useDB()
  const cache = hubKV()

  await db
    .delete(tables.users)
    .where(inArray(tables.users.id, ids))
    .execute()

  const cacheKeys = ids.map(id => getUserCacheKey(id))
  await Promise.all(cacheKeys.map(key => cache.del(key)))
}
