import type { ExecutionContext as HonoExecutionContext } from 'hono'

export type Bindings = Env

export type AppContext = {
  Bindings: Bindings
}

export type ReactRouterLoadContext = {
  cloudflare: {
    env: Bindings
    ctx: HonoExecutionContext
  }
}

export type ReactRouterRequestHandler = (
  request: Request,
  context: ReactRouterLoadContext,
) => Response | Promise<Response>
