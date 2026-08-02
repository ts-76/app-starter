import { parseJson, run } from './cli.ts'

export type WranglerAccount = {
  id: string
  name: string
}

type WranglerWhoami = {
  loggedIn: boolean
  accounts?: WranglerAccount[]
}

export function getWranglerAccounts(): WranglerAccount[] {
  const result = run('npm', ['exec', '--', 'wrangler', 'whoami', '--json'])

  if (result.status !== 0) {
    return []
  }

  const payload = parseJson<WranglerWhoami>(result.stdout, 'wrangler whoami --json')
  if (!payload.loggedIn) {
    return []
  }

  return payload.accounts ?? []
}

export function detectCloudflareAccountId(input: { explicitAccountId?: string }): string | null {
  if (input.explicitAccountId) {
    return input.explicitAccountId
  }

  const accounts = getWranglerAccounts()

  if (accounts.length === 1 && accounts[0]) {
    return accounts[0].id
  }

  return null
}

export function setWorkersDev(source: string, enabled: boolean): string {
  const workersDevSetting = /"workers_dev"\s*:\s*(?:true|false)/
  if (!workersDevSetting.test(source)) {
    throw new Error('wrangler.jsonc に workers_dev を明示してください。')
  }
  return source.replace(workersDevSetting, `"workers_dev": ${String(enabled)}`)
}
