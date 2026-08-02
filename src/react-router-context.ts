import { createContext } from 'react-router'

import type { ReactRouterLoadContext } from './types'

export const cloudflareContext = createContext<ReactRouterLoadContext['cloudflare']>()
