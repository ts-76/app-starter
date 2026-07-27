import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import { commandExists } from './lib/cli.ts'
import { loadProjectConfig } from './lib/project-config.ts'
import {
  describeTerraformBackend,
  requireTerraformBackendCredentials,
  writeTerraformBackendConfig,
} from './lib/terraform-backend.ts'

type TerraformState = {
  version?: number
  serial?: number
  lineage?: string
  outputs?: Record<string, unknown>
  resources?: unknown[]
}

const repoRoot = path.resolve(import.meta.dirname, '..')
const generatedRoot = path.join(repoRoot, '.generated', 'terraform')
const terraformRoot = path.join(repoRoot, 'ops', 'terraform', 'environments', 'prod')
const localStateFile = path.join(generatedRoot, 'production.tfstate')
const localStateBackupFile = path.join(generatedRoot, 'production.tfstate.backup')
const migrationRoot = path.join(generatedRoot, 'backend-migration')
const sourceRoot = path.join(migrationRoot, 'source')
const probeRoot = path.join(migrationRoot, 'probe')
const mode = process.argv[2]
const approved = process.argv.includes('--yes')

function fail(message: string): never {
  throw new Error(message)
}

function terraform(
  workingDirectory: string,
  args: string[],
  environment: NodeJS.ProcessEnv,
  inherit = true,
  validStatuses = [0],
): string {
  const result = spawnSync('terraform', [`-chdir=${workingDirectory}`, ...args], {
    cwd: repoRoot,
    env: environment,
    encoding: inherit ? undefined : 'utf8',
    stdio: inherit ? 'inherit' : 'pipe',
  })
  if (!validStatuses.includes(result.status ?? 1)) {
    const detail = inherit ? '' : `\n${String(result.stderr ?? '').trim()}`
    fail(`terraform ${args[0] ?? ''} が失敗しました。${detail}`)
  }
  return inherit ? '' : String(result.stdout ?? '')
}

function pullState(
  workingDirectory: string,
  environment: NodeJS.ProcessEnv,
  label: string,
): TerraformState | null {
  const result = spawnSync('terraform', [`-chdir=${workingDirectory}`, 'state', 'pull'], {
    cwd: repoRoot,
    env: environment,
    encoding: 'utf8',
    stdio: 'pipe',
  })
  if ((result.status ?? 1) === 0) {
    return readState(String(result.stdout ?? ''), label)
  }

  const detail = `${String(result.stderr ?? '')}\n${String(result.stdout ?? '')}`
  if (/no state file was found/i.test(detail)) {
    return null
  }
  fail(`terraform state pull が失敗しました。\n${detail.trim()}`)
}

function readState(source: string, label: string): TerraformState {
  let state: TerraformState
  try {
    state = JSON.parse(source) as TerraformState
  } catch {
    fail(`${label}をTerraform stateとして読み込めません。`)
  }
  if (state.version !== 4 || typeof state.serial !== 'number') {
    fail(`${label}の形式が不正です。`)
  }
  return state
}

function stateAddresses(workingDirectory: string, environment: NodeJS.ProcessEnv): string[] {
  const output = terraform(workingDirectory, ['state', 'list'], environment, false)
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .toSorted()
}

function sameAddresses(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((address, index) => address === right[index])
}

function sameStateContent(left: TerraformState | null, right: TerraformState): boolean {
  if (!left) {
    return false
  }
  return (
    isDeepStrictEqual(left.outputs ?? {}, right.outputs ?? {}) &&
    isDeepStrictEqual(left.resources ?? [], right.resources ?? [])
  )
}

function writeLocalBackendConfig(): void {
  writeFileSync(
    path.join(sourceRoot, 'main.tf'),
    [
      'terraform {',
      '  required_version = "~> 1.15.0"',
      '  backend "local" {',
      `    path = ${JSON.stringify(localStateFile)}`,
      '  }',
      '}',
      '',
    ].join('\n'),
  )
}

function writeRemoteBackendConfig(directory: string): void {
  writeFileSync(
    path.join(directory, 'main.tf'),
    ['terraform {', '  required_version = "~> 1.15.0"', '  backend "s3" {}', '}', ''].join('\n'),
  )
}

function timestamp(): string {
  return new Date().toISOString().replaceAll(':', '').replaceAll('.', '-')
}

function isMeaningfulState(state: TerraformState): boolean {
  return (
    (state.serial ?? 0) > 0 ||
    (state.resources?.length ?? 0) > 0 ||
    Object.keys(state.outputs ?? {}).length > 0
  )
}

async function main(): Promise<void> {
  if (mode !== 'migrate') {
    fail('使い方: pnpm infra:state:migrate -- --yes')
  }
  if (!approved) {
    fail('state移行には pnpm infra:state:migrate -- --yes を実行してください。')
  }
  if (!commandExists('terraform')) {
    fail('Terraformが見つかりません。先にmise installを実行してください。')
  }
  const config = loadProjectConfig(repoRoot)
  const backendConfig = writeTerraformBackendConfig(repoRoot, config)
  const environment = requireTerraformBackendCredentials({
    ...process.env,
    TF_IN_AUTOMATION: '1',
  })

  if (!existsSync(localStateFile)) {
    terraform(
      terraformRoot,
      ['init', '-input=false', '-reconfigure', `-backend-config=${backendConfig.file}`],
      environment,
    )
    const remoteState = pullState(terraformRoot, environment, 'R2 state')
    if (!remoteState || !isMeaningfulState(remoteState)) {
      fail('移行対象のlocal stateも、移行済みのR2 stateもありません。')
    }
    const remoteAddresses = stateAddresses(terraformRoot, environment)
    console.log(`state移行済み: ${describeTerraformBackend(backendConfig.backend)}`)
    console.log(`確認済みresource: ${remoteAddresses.length}件`)
    return
  }

  const localState = readState(readFileSync(localStateFile, 'utf8'), 'ローカルstate')
  if (!localState.lineage) {
    fail('ローカルstateにlineageがありません。自動移行は行いません。')
  }
  const backupRoot = path.join(generatedRoot, 'backups')
  const backupSuffix = timestamp()
  const backupFile = path.join(backupRoot, `production-pre-r2-${backupSuffix}.tfstate`)

  mkdirSync(backupRoot, { recursive: true })
  copyFileSync(localStateFile, backupFile)
  chmodSync(backupFile, 0o600)
  rmSync(migrationRoot, { recursive: true, force: true })
  mkdirSync(sourceRoot, { recursive: true })
  mkdirSync(probeRoot, { recursive: true })

  console.log(`移行先: ${describeTerraformBackend(backendConfig.backend)}`)
  console.log(`ローカルbackup: ${path.relative(repoRoot, backupFile)}`)

  try {
    writeLocalBackendConfig()
    terraform(sourceRoot, ['init', '-input=false'], environment)
    const localAddresses = stateAddresses(sourceRoot, environment)
    if (localAddresses.length === 0) {
      fail('ローカルstateが空です。自動移行は行いません。')
    }

    writeRemoteBackendConfig(probeRoot)
    terraform(
      probeRoot,
      ['init', '-input=false', `-backend-config=${backendConfig.file}`],
      environment,
    )
    const remoteState = pullState(probeRoot, environment, 'R2 state')
    const remoteAddresses =
      remoteState && isMeaningfulState(remoteState) ? stateAddresses(probeRoot, environment) : []

    const alreadyMigrated =
      sameStateContent(remoteState, localState) && sameAddresses(remoteAddresses, localAddresses)

    if (!alreadyMigrated && remoteState && isMeaningfulState(remoteState)) {
      fail(
        '移行先R2には別のstateがあります。上書きせず停止しました。R2のbucket/keyを確認してください。',
      )
    }

    if (!alreadyMigrated) {
      writeRemoteBackendConfig(sourceRoot)
      terraform(
        sourceRoot,
        ['init', '-input=false', '-force-copy', `-backend-config=${backendConfig.file}`],
        environment,
      )
    } else {
      console.log('同一stateがR2にあるため、再コピーせず検証へ進みます。')
    }

    terraform(
      terraformRoot,
      ['init', '-input=false', '-reconfigure', `-backend-config=${backendConfig.file}`],
      environment,
    )
    const verifiedAddresses = stateAddresses(terraformRoot, environment)
    const verifiedState = pullState(terraformRoot, environment, '移行後のR2 state')

    if (
      !sameStateContent(verifiedState, localState) ||
      !sameAddresses(verifiedAddresses, localAddresses)
    ) {
      fail('移行後のR2 stateがローカルstateと一致しません。ローカルstateは残しています。')
    }

    rmSync(localStateFile)
    if (existsSync(localStateBackupFile)) {
      copyFileSync(
        localStateBackupFile,
        path.join(backupRoot, `production-previous-${backupSuffix}.tfstate`),
      )
      chmodSync(path.join(backupRoot, `production-previous-${backupSuffix}.tfstate`), 0o600)
      rmSync(localStateBackupFile)
    }

    console.log(`state移行完了: ${describeTerraformBackend(backendConfig.backend)}`)
    console.log(`検証済みresource: ${verifiedAddresses.length}件`)
    console.log(`復旧用backup: ${path.relative(repoRoot, backupFile)}`)
  } finally {
    rmSync(migrationRoot, { recursive: true, force: true })
  }
}

try {
  await main()
} catch (error) {
  console.error(`state移行エラー: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
