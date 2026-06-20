import { Hono } from 'hono'

import { listReports } from '../services/reports'
import type { AppContext } from '../types'

export const apiRoutes = new Hono<AppContext>()

apiRoutes.get('/me', (c) => {
  return c.json({
    user: c.get('user'),
    environment: c.env.APP_ENV,
  })
})

apiRoutes.get('/reports', async (c) => {
  return c.json({
    reports: await listReports(c.env.DB),
  })
})
