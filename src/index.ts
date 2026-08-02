import { createRequestHandler, RouterContextProvider } from 'react-router'

import { createApp } from './hono-app'
import { cloudflareContext } from './react-router-context'
import type { Bindings } from './types'

const requestHandler = createRequestHandler(
  () => import('virtual:react-router/server-build'),
  import.meta.env.MODE,
)

const app = createApp((request, context) => {
  const routerContext = new RouterContextProvider()
  routerContext.set(cloudflareContext, context.cloudflare)
  return requestHandler(request, routerContext)
})

export default app satisfies ExportedHandler<Bindings>
