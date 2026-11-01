import { remove, validId } from '../../utils/packs'

export default defineEventHandler(async (event) => {
  const { id } = (await readBody(event)) ?? {}
  if (!validId(id)) throw createError({ statusCode: 400, statusMessage: 'Bad translation id' })
  remove(id)
  return { ok: true }
})
