import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { loadProjectConfig } from './lib/project-config.ts'
import { setWorkersDev } from './lib/wrangler.ts'

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

function runCommand(command: string, args: string[], environment = process.env): void {
  console.log(`${command} ${args.join(' ')}`)
  if (dryRun) {
    return
  }

  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: environment,
    stdio: 'inherit',
  })
  if (result.error) {
    fail(`${command}の起動に失敗しました: ${result.error.message}`)
  }
  if (result.status !== 0) {
    fail(`${command}が終了コード${result.status ?? 'unknown'}で失敗しました。`)
  }
}

function runWrangler(args: string[], accountId?: string): void {
  const environment = accountId ? { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId } : process.env
  runCommand('npm', ['exec', '--', 'wrangler', ...args], environment)
}

function runReactRouterBuild(configFile: string | undefined): void {
  const environment = configFile
    ? { ...process.env, CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH: configFile }
    : process.env
  runCommand('npm', ['exec', '--', 'react-router', 'build'], environment)
}

function deploymentConfig(customDomainEnabled: boolean): string | undefined {
  if (!customDomainEnabled) {
    return undefined
  }

  const sourceFile = path.join(repoRoot, 'wrangler.jsonc')
  const outputFile = path.join(repoRoot, '.wrangler.production.generated.jsonc')
  const source = readFileSync(sourceFile, 'utf8')
  writeFileSync(outputFile, setWorkersDev(source, false))
  return outputFile
}

function withConfig(args: string[], configFile: string | undefined): string[] {
  return configFile ? [...args, '--config', configFile] : args
}

function deployMessage(): string | undefined {
  const commit = process.env.WORKERS_CI_COMMIT_SHA
  return commit && /^[0-9a-f]{40}$/i.test(commit)
    ? `Cloudflare Workers Builds ${commit}`
    : undefined
}

function main(): void {
  const config = loadProjectConfig(repoRoot)
  validateWorkersBuildsRuntime()
  const configFile = deploymentConfig(Boolean(config.customDomain))
  runReactRouterBuild(configFile)

  runWrangler(
    withConfig(['d1', 'migrations', 'apply', 'DB', '--remote'], configFile),
    config.accountId,
  )

  const deployArgs = ['deploy']
  const message = deployMessage()
  if (message) {
    deployArgs.push('--message', message)
  }
  // Viteが生成した .wrangler/deploy/config.json をWranglerに検出させるため、
  // deployでは元の--configを渡さない。
  runWrangler(deployArgs, config.accountId)
  runWrangler(withConfig(['deployments', 'status'], configFile), config.accountId)

  console.log(
    dryRun
      ? `${config.app.id}をWorkers Buildsのデプロイ対象として確認しました。`
      : `${config.app.id}をCloudflare Workers Buildsのproductionへデプロイしました。`,
  )
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
