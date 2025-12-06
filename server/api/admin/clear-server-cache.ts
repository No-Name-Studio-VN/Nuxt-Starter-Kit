export default defineEventHandler(async (event) => {
  const cache = hubKV()
  await cache.clear().then(() => {
    return true
  })
})
