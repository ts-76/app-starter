import type { MiddlewareHandler } from 'hono'
import { createRemoteJWKSet, jwtVerify } from 'jose'

export type AccessUser = {
  email: string
  name?: string
}

export type AccessVariables = {
  user: AccessUser
}

const emailHeader = 'cf-access-authenticated-user-email'
const nameHeader = 'cf-access-authenticated-user-name'
const jwtHeader = 'cf-access-jwt-assertion'
const jwksByTeamDomain = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function getLocalAccessUser(request: Request): AccessUser | null {
  const email = request.headers.get(emailHeader)

  if (!email) {
    return null
  }

  const name = request.headers.get(nameHeader) ?? undefined
  return { email, name }
}

function teamDomain(value: string): string {
  const normalized = value.replace(/\/+$/, '')
  const url = new URL(normalized)
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.cloudflareaccess.com')) {
    throw new Error('ACCESS_TEAM_DOMAIN must be an HTTPS cloudflareaccess.com URL.')
  }
  return normalized
}

function remoteJwks(domain: string): ReturnType<typeof createRemoteJWKSet> {
  const existing = jwksByTeamDomain.get(domain)
  if (existing) {
    return existing
  }

  const created = createRemoteJWKSet(new URL(`${domain}/cdn-cgi/access/certs`))
  jwksByTeamDomain.set(domain, created)
  return created
}

async function getProductionAccessUser(
  request: Request,
  bindings: Pick<Env, 'ACCESS_AUD' | 'ACCESS_TEAM_DOMAIN'>,
): Promise<AccessUser | null> {
  const token = request.headers.get(jwtHeader)
  if (!token || !bindings.ACCESS_AUD || !bindings.ACCESS_TEAM_DOMAIN) {
    return null
  }

  const issuer = teamDomain(bindings.ACCESS_TEAM_DOMAIN)
  const { payload } = await jwtVerify(token, remoteJwks(issuer), {
    audience: bindings.ACCESS_AUD,
    issuer,
  })
  if (typeof payload.email !== 'string' || payload.email.length === 0) {
    return null
  }

  return {
    email: payload.email,
    name: typeof payload.name === 'string' ? payload.name : undefined,
  }
}

export function requireAccessUser(): MiddlewareHandler<{
  Bindings: Env
  Variables: AccessVariables
}> {
  return async (c, next) => {
    let user: AccessUser | null
    try {
      user =
        c.env.APP_ENV === 'local'
          ? getLocalAccessUser(c.req.raw)
          : await getProductionAccessUser(c.req.raw, c.env)
    } catch {
      return c.text('Cloudflare Access token is invalid.', 403)
    }

    if (!user) {
      return c.text('Cloudflare Access user is required.', 401)
    }

    c.set('user', user)
    return next()
  }
}
