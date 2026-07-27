import path from 'node:path'

import { run, mask } from './lib/cli.ts'
import { loadProjectConfig } from './lib/project-config.ts'
import { describeTerraformBackend, getTerraformBackend } from './lib/terraform-backend.ts'
import { getWranglerAccounts } from './lib/wrangler.ts'

const repoRoot = path.resolve(import.meta.dirname, '..')

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

function hasGitHubName(result: ReturnType<typeof run>, name: string): boolean {
  if (result.status !== 0) {
    return false
  }

  try {
    const items = JSON.parse(result.stdout) as Array<{ name?: string }>
    return items.some((item) => item.name === name)
  } catch {
    return false
  }
}

async function main(): Promise<void> {
  let projectConfig: ReturnType<typeof loadProjectConfig> | null = null
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

  const terraformVersion = commandVersion('mise', ['exec', '--', 'terraform', 'version'])
  record(
    'terraform',
    Boolean(terraformVersion),
    terraformVersion?.split('\n')[0] ?? 'infra反映前にmise installを実行',
    false,
  )

  try {
    const config = loadProjectConfig(repoRoot)
    projectConfig = config
    record(
      'project-config',
      true,
      `${Object.keys(config.apps).length} apps / ${Object.keys(config.accessLists).length} access lists / deploy=${config.deployment.mode}`,
    )
    record('terraform-state', true, describeTerraformBackend(getTerraformBackend(config)), false)
  } catch (error) {
    record('project-config', false, error instanceof Error ? error.message : String(error))
  }

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
  const accountId = projectConfig?.accountId
  const accountMatches = Boolean(
    accountId && wranglerAccounts.some((account) => account.id === accountId),
  )
  const terraformToken = process.env.CLOUDFLARE_TERRAFORM_API_TOKEN
  const deploymentMode = projectConfig?.deployment.mode
  const deploySecrets =
    deploymentMode === 'github-actions'
      ? run('gh', ['secret', 'list', '--env', 'production', '--json', 'name'])
      : null
  const hasDeploySecret = Boolean(
    deploySecrets && hasGitHubName(deploySecrets, 'CLOUDFLARE_DEPLOY_API_TOKEN'),
  )

  record(
    'cloudflare-account-id',
    accountMatches,
    accountId
      ? wranglerAccounts.some((account) => account.id === accountId)
        ? `configとWranglerが一致 ${mask(accountId)}`
        : `configのAccount IDがWranglerの${wranglerAccounts.length} accountsにありません`
      : 'config/cloudflare/production.jsonにaccountIdを設定',
  )
  record(
    'github:CLOUDFLARE_DEPLOY_API_TOKEN',
    deploymentMode !== 'github-actions' || hasDeploySecret,
    deploymentMode === 'github-actions'
      ? hasDeploySecret
        ? 'production environment secret is configured'
        : 'github-actions mode: add the account-owned deploy token to GitHub Environment production'
      : 'cloudflare-builds modeでは不要',
    deploymentMode === 'github-actions',
  )
  record(
    'cloudflare-workers-builds',
    true,
    deploymentMode === 'cloudflare-builds'
      ? '対象WorkerごとにGit接続とdeploy:builds commandをCloudflare側で確認'
      : 'github-actions modeでは不要',
    false,
  )
  record(
    'env:CLOUDFLARE_TERRAFORM_API_TOKEN',
    Boolean(terraformToken),
    terraformToken
      ? `present ${mask(terraformToken)}`
      : 'Custom Domain・Accessを明示反映するときだけ必要',
    false,
  )
  const hasR2AccessKey = Boolean(process.env.AWS_ACCESS_KEY_ID)
  const hasR2SecretKey = Boolean(process.env.AWS_SECRET_ACCESS_KEY)
  record(
    'env:R2_TERRAFORM_STATE',
    hasR2AccessKey && hasR2SecretKey,
    hasR2AccessKey && hasR2SecretKey
      ? 'R2 state credentials are present'
      : 'infraコマンド実行時だけ1Passwordから注入',
    false,
  )
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
