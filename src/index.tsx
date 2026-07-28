import { Hono } from 'hono'
import { csrf } from 'hono/csrf'
import { secureHeaders } from 'hono/secure-headers'

import { requireAccessUser } from './middleware/cloudflare-access'
import { apiRoutes } from './routes/api'
import { appRoutes } from './routes/app'
import { healthRoutes } from './routes/health'
import type { AppContext } from './types'

const app = new Hono<AppContext>()

app.use('*', secureHeaders())
app.use('*', csrf())
app.use('*', requireAccessUser())

app.route('/app', appRoutes)
app.route('/api', apiRoutes)
app.route('/health', healthRoutes)

app.get('/', (c) => c.redirect('/app'))

export default app
