import path from 'node:path'

import { loadProjectConfig, writeTerraformVariables } from './lib/project-config.ts'
import { describeTerraformBackend, getTerraformBackend } from './lib/terraform-backend.ts'

const repoRoot = path.resolve(import.meta.dirname, '..')

try {
  const config = loadProjectConfig(repoRoot)
  const shouldWrite = process.argv.includes('--write')
  const output = shouldWrite ? writeTerraformVariables(repoRoot, config) : null

  console.log(
    `設定OK: ${Object.keys(config.apps).length}アプリ / ${Object.keys(config.accessLists).length} Access List`,
  )
  console.log(`Terraform state: ${describeTerraformBackend(getTerraformBackend(config))}`)
  for (const [listId, members] of Object.entries(config.accessLists)) {
    console.log(`- ${listId}: ${members.length}人`)
  }
  for (const warning of config.warnings) {
    console.warn(`注意: ${warning}`)
  }
  if (output) {
    console.log(`Terraform入力を生成: ${path.relative(repoRoot, output)}`)
  }
} catch (error) {
  console.error(`設定エラー: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
