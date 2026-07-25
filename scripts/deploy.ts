import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { loadProjectConfig, type DeploymentMode, type ProjectApp } from './lib/project-config.ts'

const repoRoot = path.resolve(import.meta.dirname, '..')
const parsed = parseArgs({
  args: process.argv.slice(2).filter((argument) => argument !== '--'),
  options: {
    app: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    source: { type: 'string' },
  },
  strict: true,
})
const dryRun = parsed.values['dry-run']

function fail(message: string): never {
  throw new Error(message)
}

function deploymentSource(value: string | undefined): DeploymentMode {
  if (value !== 'cloudflare-builds' && value !== 'github-actions') {
    fail('--source は cloudflare-builds または github-actions にしてください。')
  }
  return value
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

function validateRuntime(source: DeploymentMode): void {
  if (dryRun) {
    return
  }

  if (source === 'github-actions') {
    if (process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_REF !== 'refs/heads/main') {
      fail('GitHub Actions経由の本番デプロイはmainブランチからのみ実行できます。')
    }
    if (!process.env.CLOUDFLARE_API_TOKEN) {
      fail(
        'GitHub Environment production に CLOUDFLARE_DEPLOY_API_TOKEN secretを設定してください。',
      )
    }
    return
  }

  if (
    process.env.WORKERS_CI !== '1' ||
    process.env.WORKERS_CI_BRANCH !== 'main' ||
    !process.env.WORKERS_CI_BUILD_UUID
  ) {
    fail('Workers Builds経由の本番デプロイはmainブランチのBuildからのみ実行できます。')
  }
}

function selectApps(
  source: DeploymentMode,
  appId: string | undefined,
  apps: Record<string, ProjectApp>,
): ProjectApp[] {
  if (source === 'github-actions') {
    if (appId) {
      fail('GitHub Actions経由では--appを指定できません。登録済みWorkerをすべてデプロイします。')
    }
    return Object.values(apps)
  }

  if (!appId) {
    fail('Workers Buildsのdeploy commandには --app <app-id> を指定してください。')
  }
  const app = apps[appId]
  if (!app) {
    fail(`config/cloudflare/production.jsonに未登録のアプリです: ${appId}`)
  }
  return [app]
}

function commitMessage(source: DeploymentMode): string | undefined {
  const commit =
    source === 'github-actions' ? process.env.GITHUB_SHA : process.env.WORKERS_CI_COMMIT_SHA
  if (!commit || !/^[0-9a-f]{40}$/i.test(commit)) {
    return undefined
  }
  return `${source === 'github-actions' ? 'GitHub Actions' : 'Workers Builds'} ${commit}`
}

function main(): void {
  const source = deploymentSource(parsed.values.source)
  const config = loadProjectConfig(repoRoot)

  if (config.deployment.mode !== source) {
    console.log(
      `デプロイをスキップしました: configured=${config.deployment.mode}, runner=${source}`,
    )
    return
  }

  const apps = selectApps(source, parsed.values.app, config.apps)
  if (apps.length === 0) {
    fail('productionアプリが登録されていません。')
  }
  validateRuntime(source)

  for (const warning of config.warnings) {
    console.warn(`注意: ${warning}`)
  }

  for (const app of apps) {
    const appRoot = validateRegistration(app)
    const deployArgs = ['deploy']
    const message = commitMessage(source)
    if (message) {
      deployArgs.push('--message', message)
    }

    runWrangler(app, appRoot, deployArgs, config.accountId)
    runWrangler(app, appRoot, ['deployments', 'status'], config.accountId)
  }

  console.log(
    dryRun
      ? `\n${apps.length}件のproduction Workerをデプロイ対象として確認しました。`
      : `\n${apps.length}件のproduction Workerを${source}からデプロイしました。`,
  )
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
