import { install, validId } from '../../utils/packs'

export default defineEventHandler(async (event) => {
  const { id } = (await readBody(event)) ?? {}
  if (!validId(id)) throw createError({ statusCode: 400, statusMessage: 'Bad translation id' })
  try { await install(id) } catch (err: any) { throw createError({ statusCode: 502, statusMessage: err?.message ?? String(err) }) }
  return { ok: true }
})
