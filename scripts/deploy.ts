import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { loadProjectConfig } from './lib/project-config.ts'

const repoRoot = path.resolve(import.meta.dirname, '..')
const parsed = parseArgs({
  args: process.argv.slice(2).filter((argument) => argument !== '--'),
  options: {
    'dry-run': { type: 'boolean', default: false },
  },
  strict: true,
})
const dryRun = parsed.values['dry-run']

function fail(message: string): never {
  throw new Error(message)
}

function validateWorkersBuildsRuntime(): void {
  if (dryRun) {
    return
  }
  if (
    process.env.WORKERS_CI !== '1' ||
    process.env.WORKERS_CI_BRANCH !== 'main' ||
    !process.env.WORKERS_CI_BUILD_UUID
  ) {
    fail('本番デプロイはmainブランチのCloudflare Workers Buildsからのみ実行できます。')
  }
}

function runWrangler(args: string[], accountId: string): void {
  console.log(`pnpm exec wrangler ${args.join(' ')}`)
  if (dryRun) {
    return
  }

  const result = spawnSync('pnpm', ['exec', 'wrangler', ...args], {
    cwd: repoRoot,
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId },
    stdio: 'inherit',
  })
  if (result.error) {
    fail(`Wranglerの起動に失敗しました: ${result.error.message}`)
  }
  if (result.status !== 0) {
    fail(`Wranglerが終了コード${result.status ?? 'unknown'}で失敗しました。`)
  }
}

function deployMessage(): string | undefined {
  const commit = process.env.WORKERS_CI_COMMIT_SHA
  return commit && /^[0-9a-f]{40}$/i.test(commit)
    ? `Cloudflare Workers Builds ${commit}`
    : undefined
}

async function verifyAccessProtection(hostname: string, attempt = 1): Promise<void> {
  const url = `https://${hostname}/health`
  let detail: string

  try {
    const response = await fetch(url, { redirect: 'manual' })
    const location = response.headers.get('location')
    const accessHost = location ? new URL(location).hostname : ''
    if (
      response.status >= 300 &&
      response.status < 400 &&
      accessHost.endsWith('.cloudflareaccess.com')
    ) {
      console.log(`Access保護を確認しました: ${url} -> ${accessHost}`)
      return
    }
    detail = `status=${response.status} location=${location ?? '(none)'}`
  } catch (error) {
    detail = error instanceof Error ? error.message : String(error)
  }

  if (attempt < 5) {
    await new Promise((resolve) => setTimeout(resolve, 2_000))
    return verifyAccessProtection(hostname, attempt + 1)
  }

  fail(`未認証アクセスがCloudflare Accessへ転送されません: ${url} (${detail})`)
}

async function main(): Promise<void> {
  const config = loadProjectConfig(repoRoot)
  validateWorkersBuildsRuntime()

  const deployArgs = ['deploy']
  const message = deployMessage()
  if (message) {
    deployArgs.push('--message', message)
  }

  runWrangler(deployArgs, config.accountId)
  runWrangler(['deployments', 'status'], config.accountId)

  if (dryRun) {
    console.log(`${config.app.id}をWorkers Buildsのproductionデプロイ対象として確認しました。`)
    return
  }

  await verifyAccessProtection(config.app.hostname)
  console.log(`${config.app.id}をCloudflare Workers Buildsからデプロイしました。`)
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
