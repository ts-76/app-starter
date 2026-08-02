import { readFileSync } from 'node:fs'
import path from 'node:path'

import { run } from './lib/cli.ts'
import {
  assertMcpConfigsMatch,
  parseCodexMcpConfig,
  parseSharedMcpConfig,
} from './lib/mcp-config.ts'
import { loadProjectConfig } from './lib/project-config.ts'

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

function supportsNodeVersion(version: string): boolean {
  const [major, minor] = version.replace(/^v/, '').split('.').map(Number)
  return major === 24 && typeof minor === 'number' && minor >= 18
}

function supportsNpmVersion(version: string): boolean {
  const [major] = version.replace(/^v/, '').split('.').map(Number)
  return typeof major === 'number' && major >= 11
}

function main(): void {
  const nodeVersion = process.version
  record('node', supportsNodeVersion(nodeVersion), nodeVersion)

  const npmVersion = commandVersion('npm')
  record(
    'npm',
    Boolean(npmVersion && supportsNpmVersion(npmVersion)),
    npmVersion ?? 'npm 11以上が必要です',
  )

  const ghVersion = commandVersion('gh')
  record(
    'github-cli',
    Boolean(ghVersion),
    ghVersion?.split('\n')[0] ?? '任意: GitHub操作が必要ならghをインストール',
    false,
  )

  try {
    const wranglerPackage = JSON.parse(
      readFileSync(path.join(repoRoot, 'node_modules', 'wrangler', 'package.json'), 'utf8'),
    ) as { version?: unknown }
    const wranglerVersion = wranglerPackage.version
    record(
      'wrangler-package',
      typeof wranglerVersion === 'string',
      typeof wranglerVersion === 'string' ? `version ${wranglerVersion}` : 'versionがありません',
    )
  } catch {
    record('wrangler-package', false, 'node_modulesにWranglerがありません')
  }

  try {
    const config = loadProjectConfig(repoRoot)
    record(
      'project-config',
      true,
      `${config.app.id} / ${config.customDomain?.hostname ?? 'workers.dev'} / Access ${config.access ? 'enabled' : 'disabled'}`,
    )
    record(
      'cloudflare-mcp-management',
      true,
      config.mcpManagementEnabled
        ? 'Custom Domain・AccessはCloudflare MCPで反映'
        : 'optional infrastructure is not configured',
      false,
    )
  } catch (error) {
    record('project-config', false, error instanceof Error ? error.message : String(error))
  }

  try {
    const sharedConfig = parseSharedMcpConfig(
      readFileSync(path.join(repoRoot, '.mcp.json'), 'utf8'),
    )
    const codexConfig = parseCodexMcpConfig(
      readFileSync(path.join(repoRoot, '.codex', 'config.toml'), 'utf8'),
    )
    const serverCount = assertMcpConfigsMatch(sharedConfig, codexConfig)
    record('mcp-config', true, `.mcp.jsonと.codex/config.tomlが一致 ${serverCount} servers`)
  } catch (error) {
    record('mcp-config', false, error instanceof Error ? error.message : String(error))
  }

  const gitRoot = run('git', ['rev-parse', '--show-toplevel'])
  record(
    'git-repository',
    gitRoot.status === 0,
    gitRoot.status === 0 ? gitRoot.stdout.trim() : 'not a git repository yet',
  )

  const width = Math.max(...checks.map((check) => check.name.length), 1)
  for (const check of checks) {
    const marker = check.ok ? 'ok' : check.required ? 'missing' : 'optional'
    console.log(`${marker.padEnd(7)} ${check.name.padEnd(width)}  ${check.detail}`)
  }

  const requiredFailed = checks.some((check) => check.required && !check.ok)
  if (requiredFailed) {
    process.exitCode = 1
  }
}

main()
