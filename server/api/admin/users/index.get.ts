export default defineEventHandler(async () => {
  const db = useDB()
  const users = await db
    .select()
    .from(tables.users)
    .execute()

  return users
})
