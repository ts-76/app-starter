import path from 'node:path'

import { loadProjectConfig, toCloudflareMcpDesiredState } from './lib/project-config.ts'

const repoRoot = path.resolve(import.meta.dirname, '..')

try {
  const config = loadProjectConfig(repoRoot)

  console.log(`設定OK: ${config.app.id}`)
  console.log(
    `公開先: ${config.customDomain?.hostname ?? config.app.workersDevHostname ?? 'workers.dev（デプロイ時に決定）'}`,
  )
  console.log(
    config.access
      ? `Access: 有効（${config.access.domain}、${config.access.members.length}人）`
      : 'Access: 無効',
  )
  console.log(
    config.mcpManagementEnabled
      ? 'Cloudflare MCP: Custom Domain・Accessの管理に使用'
      : 'Cloudflare MCP管理対象: なし',
  )
  if (config.mcpManagementEnabled) {
    const desired = toCloudflareMcpDesiredState(config)
    console.log('MCP反映順序:')
    desired.resources.forEach((resource, index) => {
      console.log(`  ${index + 1}. ${resource.kind}`)
    })
  }
  for (const warning of config.warnings) {
    console.warn(`注意: ${warning}`)
  }
} catch (error) {
  console.error(`設定エラー: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
