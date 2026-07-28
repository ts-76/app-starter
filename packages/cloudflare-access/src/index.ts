import type { MiddlewareHandler } from 'hono'

export type AccessUser = {
  email: string
  name?: string
}

export type AccessVariables = {
  user: AccessUser
}

const emailHeader = 'cf-access-authenticated-user-email'
const nameHeader = 'cf-access-authenticated-user-name'

export function getAccessUser(request: Request): AccessUser | null {
  const email = request.headers.get(emailHeader)

  if (!email) {
    return null
  }

  const name = request.headers.get(nameHeader) ?? undefined
  return { email, name }
}

export function requireAccessUser(): MiddlewareHandler<{ Variables: AccessVariables }> {
  return async (c, next) => {
    const user = getAccessUser(c.req.raw)

    if (!user) {
      return c.text('Cloudflare Access user is required.', 401)
    }

    c.set('user', user)
    return next()
  }
}
