import type { AccessVariables } from '@internal/cloudflare-access'

export type Bindings = Env

export type Variables = AccessVariables

export type AppContext = {
  Bindings: Bindings
  Variables: Variables
}
