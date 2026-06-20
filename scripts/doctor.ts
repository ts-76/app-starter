import { run, mask } from './lib/cli.ts'
import { CloudflareBuildsClient } from './lib/cloudflare-builds.ts'
import { detectCloudflareAccountId, getWranglerAccounts } from './lib/wrangler.ts'

type Check = {
  name: string
  ok: boolean
  detail: string
  required: boolean
}

const checks: Check[] = []

function record(name: string, ok: boolean, detail: string, required = true): void {
  checks.push({ name, ok, detail, required })
}

function commandVersion(command: string, args: string[] = ['--version']): string | null {
  const result = run(command, args)
  if (result.status !== 0) {
    return null
  }

  return result.stdout.trim() || result.stderr.trim()
}

async function main(): Promise<void> {
  const nodeVersion = commandVersion('node')
  record('node', Boolean(nodeVersion), nodeVersion ?? 'node command not found')

  const pnpmVersion = commandVersion('pnpm')
  record(
    'pnpm',
    pnpmVersion === '11.8.0',
    pnpmVersion ? `version ${pnpmVersion}` : 'pnpm command not found',
  )

  const ghVersion = commandVersion('gh')
  record('gh', Boolean(ghVersion), ghVersion?.split('\n')[0] ?? 'gh command not found')

  const wranglerVersion = commandVersion('pnpm', [
    '--filter',
    '@internal/sales-report',
    'exec',
    'wrangler',
    '--version',
  ])
  record('wrangler', Boolean(wranglerVersion), wranglerVersion ?? 'pnpm wrangler failed')

  const opVersion = commandVersion('op')
  record('1password-cli', Boolean(opVersion), opVersion ?? 'optional: op command not found', false)

  const gitRoot = run('git', ['rev-parse', '--show-toplevel'])
  record(
    'git-repository',
    gitRoot.status === 0,
    gitRoot.status === 0 ? gitRoot.stdout.trim() : 'not a git repository yet',
  )

  const ghAuth = run('gh', ['auth', 'status'])
  record(
    'github-auth',
    ghAuth.status === 0,
    ghAuth.status === 0 ? 'authenticated' : 'run gh auth login',
  )

  const repo = run('gh', ['repo', 'view', '--json', 'nameWithOwner,url'])
  record(
    'github-repo',
    repo.status === 0,
    repo.status === 0 ? repo.stdout.trim() : 'no GitHub repository detected',
  )

  const wranglerWhoami = run('pnpm', [
    '--filter',
    '@internal/sales-report',
    'exec',
    'wrangler',
    'whoami',
  ])
  record(
    'cloudflare-wrangler-auth',
    wranglerWhoami.status === 0,
    wranglerWhoami.status === 0 ? 'authenticated' : 'run pnpm wrangler login',
  )

  const wranglerAccounts = getWranglerAccounts()
  const detectedAccountId = detectCloudflareAccountId({
    explicitAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  })
  const accountId = detectedAccountId ?? undefined
  const apiToken = process.env.CLOUDFLARE_BUILDS_API_TOKEN ?? process.env.CLOUDFLARE_API_TOKEN
  const buildTokenUuid = process.env.CLOUDFLARE_BUILD_TOKEN_UUID

  record(
    'cloudflare-account-id',
    Boolean(accountId),
    accountId
      ? process.env.CLOUDFLARE_ACCOUNT_ID
        ? `from env ${mask(accountId)}`
        : `from wrangler ${mask(accountId)}`
      : `${wranglerAccounts.length} Wrangler accounts found; set CLOUDFLARE_ACCOUNT_ID`,
  )
  record(
    'env:CLOUDFLARE_BUILDS_API_TOKEN',
    Boolean(apiToken),
    apiToken ? `present ${mask(apiToken)}` : 'missing',
  )
  record(
    'env:CLOUDFLARE_BUILD_TOKEN_UUID',
    true,
    buildTokenUuid ? mask(buildTokenUuid) : 'optional if exactly one Cloudflare build token exists',
    false,
  )

  if (accountId && apiToken) {
    try {
      const client = new CloudflareBuildsClient({ accountId, apiToken })
      await client.verifyToken()
      record('cloudflare-api-token', true, 'token verified')
      if (!buildTokenUuid) {
        const buildTokens = await client.listBuildTokens()
        record(
          'cloudflare-build-token',
          buildTokens.length === 1,
          buildTokens.length === 1
            ? `will auto-select ${buildTokens[0]?.build_token_name ?? buildTokens[0]?.build_token_uuid}`
            : `${buildTokens.length} build tokens found; set CLOUDFLARE_BUILD_TOKEN_UUID`,
          buildTokens.length !== 1,
        )
      }
    } catch (error) {
      record('cloudflare-api-token', false, error instanceof Error ? error.message : String(error))
    }
  }

  const width = Math.max(...checks.map((check) => check.name.length), 1)
  for (const check of checks) {
    const marker = check.ok ? 'ok' : 'missing'
    console.log(`${marker.padEnd(7)} ${check.name.padEnd(width)}  ${check.detail}`)
  }

  const requiredFailed = checks.some((check) => check.required && !check.ok)
  if (requiredFailed) {
    process.exitCode = 1
  }
}

await main()
