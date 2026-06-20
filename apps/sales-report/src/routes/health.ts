import { Hono } from 'hono'

import type { AppContext } from '../types'

export const healthRoutes = new Hono<AppContext>()

healthRoutes.get('/', (c) => c.text('ok'))
