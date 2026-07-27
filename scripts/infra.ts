import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

import { commandExists, run } from './lib/cli.ts'
import { CloudflareAccessClient } from './lib/cloudflare-access.ts'
import { loadProjectConfig, writeTerraformVariables } from './lib/project-config.ts'
import {
  describeTerraformBackend,
  requireTerraformBackendCredentials,
  writeTerraformBackendConfig,
} from './lib/terraform-backend.ts'

type TerraformPlan = {
  resource_changes?: Array<{
    address?: string
    change?: {
      actions?: string[]
    }
  }>
}

const repoRoot = path.resolve(import.meta.dirname, '..')
const terraformRoot = path.join(repoRoot, 'ops', 'terraform', 'environments', 'prod')
const generatedRoot = path.join(repoRoot, '.generated', 'terraform')
const planFile = path.join(generatedRoot, 'production.tfplan')
const legacyLocalStateFile = path.join(generatedRoot, 'production.tfstate')
const mode = process.argv[2]
const approved = process.argv.includes('--yes')
const allowBootstrap = process.argv.includes('--allow-bootstrap')

function fail(message: string): never {
  throw new Error(message)
}

function terraform(
  args: string[],
  environment: NodeJS.ProcessEnv,
  inherit = true,
  validStatuses = [0],
): string {
  const result = spawnSync('terraform', [`-chdir=${terraformRoot}`, ...args], {
    cwd: repoRoot,
    env: environment,
    encoding: inherit ? undefined : 'utf8',
    stdio: inherit ? 'inherit' : 'pipe',
  })
  if (!validStatuses.includes(result.status ?? 1)) {
    fail(`terraform ${args[0] ?? ''} が失敗しました。`)
  }
  return inherit ? '' : String(result.stdout ?? '')
}

function summarizePlan(plan: TerraformPlan): {
  create: string[]
  update: string[]
  delete: string[]
  unchanged: number
} {
  const summary = {
    create: [] as string[],
    update: [] as string[],
    delete: [] as string[],
    unchanged: 0,
  }
  for (const resource of plan.resource_changes ?? []) {
    const address = resource.address ?? '(unknown resource)'
    const actions = resource.change?.actions ?? []
    if (actions.includes('delete')) {
      summary.delete.push(address)
    } else if (actions.includes('create')) {
      summary.create.push(address)
    } else if (actions.includes('update')) {
      summary.update.push(address)
    } else {
      summary.unchanged += 1
    }
  }
  return summary
}

function printResources(label: string, resources: string[]): void {
  if (resources.length === 0) {
    return
  }
  console.log(`${label}:`)
  for (const resource of resources) {
    console.log(`  - ${resource}`)
  }
}

async function main(): Promise<void> {
  if (mode !== 'plan' && mode !== 'apply') {
    fail('使い方: pnpm infra:plan または pnpm infra:apply -- --yes')
  }
  if (!commandExists('terraform')) {
    fail('Terraformが見つかりません。先にmise installを実行してください。')
  }

  const apiToken = process.env.CLOUDFLARE_API_TOKEN ?? process.env.CLOUDFLARE_TERRAFORM_API_TOKEN
  if (!apiToken) {
    fail('Cloudflare資格情報がありません。.env.terraform.1password を通して実行してください。')
  }

  const config = loadProjectConfig(repoRoot)
  if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_ACCOUNT_ID !== config.accountId) {
    fail('環境変数のCloudflare Account IDがconfig/cloudflare/production.jsonと一致しません。')
  }
  const variableFile = writeTerraformVariables(repoRoot, config)
  const backendConfig = writeTerraformBackendConfig(repoRoot, config)
  for (const warning of config.warnings) {
    console.warn(`注意: ${warning}`)
  }

  if (existsSync(legacyLocalStateFile)) {
    fail(
      '移行前のローカルstateが残っています。先に pnpm infra:state:migrate -- --yes を実行してください。',
    )
  }

  const environment = requireTerraformBackendCredentials({
    ...process.env,
    CLOUDFLARE_API_TOKEN: apiToken,
    CLOUDFLARE_ACCOUNT_ID: config.accountId,
    TF_IN_AUTOMATION: '1',
  })

  console.log(`Terraform state: ${describeTerraformBackend(backendConfig.backend)}`)
  terraform(['init', '-input=false', `-backend-config=${backendConfig.file}`], environment)

  const stateResult = run('terraform', [`-chdir=${terraformRoot}`, 'state', 'list'])
  const stateIsEmpty = stateResult.status !== 0 || stateResult.stdout.trim() === ''

  terraform(
    ['plan', '-input=false', `-var-file=${variableFile}`, `-out=${planFile}`, '-detailed-exitcode'],
    environment,
    true,
    [0, 2],
  )

  const planJson = terraform(['show', '-json', planFile], environment, false)
  const summary = summarizePlan(JSON.parse(planJson) as TerraformPlan)

  console.log('\nTerraform変更サマリー')
  console.log(
    `追加 ${summary.create.length} / 変更 ${summary.update.length} / 削除 ${summary.delete.length}`,
  )
  printResources('追加', summary.create)
  printResources('変更', summary.update)
  printResources('削除', summary.delete)

  if (summary.delete.length > 0) {
    fail(
      '削除を含むplanは安全のため自動適用しません。内容を確認してTerraformコードを見直してください。',
    )
  }
  if (mode === 'plan') {
    console.log('\nplanのみ実行しました。Cloudflareは変更していません。')
    return
  }
  if (stateIsEmpty && summary.create.length > 0 && !allowBootstrap) {
    fail(
      'Terraform stateが空です。既存リソースをimportするか、完全な新規作成なら --allow-bootstrap を明示してください。',
    )
  }
  if (!approved) {
    fail('適用には、plan確認後に pnpm infra:apply -- --yes を実行してください。')
  }
  if (summary.create.length === 0 && summary.update.length === 0) {
    console.log('\n変更はありません。')
    return
  }

  if (summary.create.includes('cloudflare_zero_trust_organization.this')) {
    const client = new CloudflareAccessClient({
      accountId: config.accountId,
      apiToken,
    })
    const organization = await client.ensureOrganization({
      auth_domain: config.accessAuthDomain,
      name: config.projectId,
      session_duration: '24h',
    })
    if (organization === 'created') {
      console.log('\nCloudflare Accessを初期化しました。以後はTerraformで管理します。')
    }
  }

  terraform(['apply', '-input=false', planFile], environment)
  console.log('\nCloudflareのDNS・Access設定を適用しました。')
}

try {
  await main()
} catch (error) {
  console.error(`基盤設定エラー: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
