import { Hono, type Context } from 'hono'
import { csrf } from 'hono/csrf'
import { secureHeaders } from 'hono/secure-headers'

import { apiRoutes } from './routes/api'
import { healthRoutes } from './routes/health'
import type { AppContext, ReactRouterRequestHandler } from './types'

const PRIVATE_INDEXING_POLICY = 'noindex, nofollow, noarchive, nosnippet, noimageindex'

function indexingIsAllowed(value: string): boolean {
  return value.trim().toLowerCase() === 'true'
}

export function createApp(renderReactRouter: ReactRouterRequestHandler) {
  const app = new Hono<AppContext>()

  app.use('*', async (c, next) => {
    await next()

    if (!indexingIsAllowed(c.env.ALLOW_INDEXING)) {
      c.res.headers.set('X-Robots-Tag', PRIVATE_INDEXING_POLICY)
    }
  })
  app.use('*', secureHeaders())
  app.use('*', csrf())

  app.route('/health', healthRoutes)
  app.route('/app/api', apiRoutes)

  app.get('/robots.txt', (c) => {
    const policy = indexingIsAllowed(c.env.ALLOW_INDEXING) ? 'Allow: /' : 'Disallow: /'
    c.header('Cache-Control', 'no-store')
    return c.text(`User-agent: *\n${policy}\n`)
  })
  app.get('/', (c) => c.redirect('/app'))

  const handleReactRouter = async (c: Context<AppContext>) =>
    renderReactRouter(c.req.raw, {
      cloudflare: {
        env: c.env,
        ctx: c.executionCtx,
      },
    })

  app.all('/__manifest', handleReactRouter)
  app.all('/app', handleReactRouter)
  app.all('/app.data', handleReactRouter)
  app.all('/app/*', handleReactRouter)

  return app
}
