import { Hono, type Context } from 'hono'
import { csrf } from 'hono/csrf'
import { secureHeaders } from 'hono/secure-headers'

import { apiRoutes } from './routes/api'
import { healthRoutes } from './routes/health'
import type { AppContext, ReactRouterRequestHandler } from './types'

export function createApp(renderReactRouter: ReactRouterRequestHandler) {
  const app = new Hono<AppContext>()

  app.use('*', secureHeaders())
  app.use('*', csrf())

  app.route('/health', healthRoutes)
  app.route('/app/api', apiRoutes)

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
