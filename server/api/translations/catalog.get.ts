import { catalog } from '../../utils/packs'

export default defineEventHandler(async () => {
  try { return await catalog() } catch (err: any) { throw createError({ statusCode: 502, statusMessage: err?.message ?? String(err) }) }
})
