import type { MiddlewareHandler } from 'hono'

import type { AppContext } from '../types'

export function requireRole(_role: string): MiddlewareHandler<AppContext> {
  return async (_c, next) => {
    await next()
  }
}
