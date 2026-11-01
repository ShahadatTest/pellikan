import { runNamedQuery } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, 'name') ?? ''
  const params = (await readBody(event)) ?? {}
  return runNamedQuery(name, params)
})
