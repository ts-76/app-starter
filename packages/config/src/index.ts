import { z } from 'zod'

export const appEnvSchema = z.enum(['local', 'staging', 'production'])
export type AppEnv = z.infer<typeof appEnvSchema>

export function parseAppEnv(value: unknown): AppEnv {
  return appEnvSchema.catch('local').parse(value)
}
