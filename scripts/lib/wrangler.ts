import { parseJson, run } from './cli.ts'

export type WranglerAccount = {
  id: string
  name: string
}

type WranglerWhoami = {
  loggedIn: boolean
  accounts?: WranglerAccount[]
}

export function getWranglerAccounts(packageName = '@internal/sales-report'): WranglerAccount[] {
  const result = run('pnpm', ['--filter', packageName, 'exec', 'wrangler', 'whoami', '--json'])

  if (result.status !== 0) {
    return []
  }

  const payload = parseJson<WranglerWhoami>(result.stdout, 'wrangler whoami --json')
  if (!payload.loggedIn) {
    return []
  }

  return payload.accounts ?? []
}

export function detectCloudflareAccountId(input: {
  explicitAccountId?: string
  packageName?: string
}): string | null {
  if (input.explicitAccountId) {
    return input.explicitAccountId
  }

  const accounts = getWranglerAccounts(input.packageName)

  if (accounts.length === 1 && accounts[0]) {
    return accounts[0].id
  }

  return null
}
