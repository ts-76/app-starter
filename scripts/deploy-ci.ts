import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

import { loadProjectConfig, type ProjectApp } from './lib/project-config.ts'

const repoRoot = path.resolve(import.meta.dirname, '..')
const dryRun = process.argv.includes('--dry-run')

function fail(message: string): never {
  throw new Error(message)
}

function validateRegistration(app: ProjectApp): string {
  const appRoot = path.resolve(repoRoot, app.rootDirectory)
  const appsRoot = path.join(repoRoot, 'apps') + path.sep
  if (!appRoot.startsWith(appsRoot)) {
    return fail(`${app.id}: root_directoryはapps/配下を指定してください。`)
  }
  if (path.basename(appRoot) !== app.id) {
    return fail(`${app.id}: root_directoryとidが一致していません。`)
  }
  if (!existsSync(path.join(appRoot, 'wrangler.jsonc'))) {
    return fail(`${app.id}: wrangler.jsoncが見つかりません。`)
  }

  return appRoot
}

function runWrangler(app: ProjectApp, appRoot: string, args: string[], accountId: string): void {
  const commandArgs = ['--dir', appRoot, 'exec', 'wrangler', ...args]
  console.log(`\n[${app.id}] pnpm ${commandArgs.join(' ')}`)

  if (dryRun) {
    return
  }

  const result = spawnSync('pnpm', commandArgs, {
    cwd: repoRoot,
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId },
    stdio: 'inherit',
  })
  if (result.error) {
    return fail(`${app.id}: Wranglerの起動に失敗しました: ${result.error.message}`)
  }
  if (result.status !== 0) {
    return fail(`${app.id}: Wranglerが終了コード${result.status ?? 'unknown'}で失敗しました。`)
  }
}

function main(): void {
  if (!dryRun) {
    if (process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_REF !== 'refs/heads/main') {
      fail('本番デプロイはGitHub Actionsのmainブランチからのみ実行できます。')
    }
    if (!process.env.CLOUDFLARE_API_TOKEN) {
      fail('Cloudflareのデプロイ資格情報が設定されていません。')
    }
  }

  const config = loadProjectConfig(repoRoot)
  const apps = Object.values(config.apps)
  if (apps.length === 0) {
    fail('productionアプリが登録されていません。')
  }
  for (const warning of config.warnings) {
    console.warn(`注意: ${warning}`)
  }

  for (const app of apps) {
    const appRoot = validateRegistration(app)
    const deployArgs = ['deploy']
    const commit = process.env.GITHUB_SHA
    if (commit && /^[0-9a-f]{40}$/i.test(commit)) {
      deployArgs.push('--message', `GitHub ${commit}`)
    }

    runWrangler(app, appRoot, deployArgs, config.accountId)
    runWrangler(app, appRoot, ['deployments', 'status'], config.accountId)
  }

  console.log(
    dryRun
      ? `\n${apps.length}件のproduction Workerをデプロイ対象として確認しました。`
      : `\n${apps.length}件のproduction Workerをデプロイしました。`,
  )
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
