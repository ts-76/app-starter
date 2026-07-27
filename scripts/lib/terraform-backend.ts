import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import type { ProjectConfig } from './project-config.ts'

export type TerraformBackend = {
  bucket: string
  key: string
  endpoint: string
}

function hclString(value: string): string {
  return JSON.stringify(value)
}

export function getTerraformBackend(config: ProjectConfig): TerraformBackend {
  const bucket = `${config.projectId}-terraform-state`
  if (bucket.length > 64) {
    throw new Error(`projectIdが長すぎるためR2 bucket名を作れません（64文字以内）: ${bucket}`)
  }

  return {
    bucket,
    key: `${config.environment}/terraform.tfstate`,
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
  }
}

export function writeTerraformBackendConfig(
  repoRoot: string,
  config: ProjectConfig,
): { backend: TerraformBackend; file: string } {
  const backend = getTerraformBackend(config)
  const file = path.join(repoRoot, '.generated', 'terraform', `${config.environment}.backend.hcl`)
  const source = [
    `bucket = ${hclString(backend.bucket)}`,
    `key = ${hclString(backend.key)}`,
    'region = "auto"',
    'endpoints = {',
    `  s3 = ${hclString(backend.endpoint)}`,
    '}',
    'skip_credentials_validation = true',
    'skip_region_validation = true',
    'skip_requesting_account_id = true',
    'skip_s3_checksum = true',
    'use_path_style = true',
    'use_lockfile = true',
    '',
  ].join('\n')

  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, source)
  return { backend, file }
}

export function requireTerraformBackendCredentials(
  environment: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  if (!environment.AWS_ACCESS_KEY_ID || !environment.AWS_SECRET_ACCESS_KEY) {
    throw new Error(
      'R2 state資格情報がありません。.env.terraform.1passwordのAWS_ACCESS_KEY_IDとAWS_SECRET_ACCESS_KEYを設定してください。',
    )
  }

  const cleanEnvironment = { ...environment }
  delete cleanEnvironment.AWS_SESSION_TOKEN

  return {
    ...cleanEnvironment,
    AWS_EC2_METADATA_DISABLED: 'true',
  }
}

export function describeTerraformBackend(backend: TerraformBackend): string {
  return `r2://${backend.bucket}/${backend.key}`
}
