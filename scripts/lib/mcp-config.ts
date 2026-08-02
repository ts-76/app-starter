type JsonObject = Record<string, unknown>

function asObject(value: unknown, label: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} はJSONオブジェクトで指定してください。`)
  }
  return value as JsonObject
}

export function parseSharedMcpConfig(source: string): Map<string, string> {
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch {
    throw new Error('.mcp.json をJSONとして読み込めません。')
  }

  const root = asObject(parsed, '.mcp.json')
  const servers = asObject(root.mcpServers, '.mcp.json.mcpServers')
  const result = new Map<string, string>()

  for (const [name, value] of Object.entries(servers)) {
    const server = asObject(value, `.mcp.json.mcpServers.${name}`)
    if (typeof server.url !== 'string' || server.url.trim() === '') {
      throw new Error(`.mcp.json.mcpServers.${name}.url がありません。`)
    }
    result.set(name, server.url.trim())
  }

  return result
}

export function parseCodexMcpConfig(source: string): Map<string, string> {
  const result = new Map<string, string>()
  let currentServer: string | undefined

  for (const line of source.split(/\r?\n/)) {
    const section = line.match(/^\s*\[mcp_servers\."([^"]+)"\]\s*$/)
    if (section) {
      currentServer = section[1]
      continue
    }
    if (/^\s*\[/.test(line)) {
      currentServer = undefined
      continue
    }

    const url = line.match(/^\s*url\s*=\s*"([^"]+)"\s*$/)
    if (currentServer && url) {
      if (result.has(currentServer)) {
        throw new Error(`.codex/config.toml の ${currentServer} にurlが複数あります。`)
      }
      result.set(currentServer, url[1]!.trim())
    }
  }

  return result
}

export function assertMcpConfigsMatch(
  sharedConfig: Map<string, string>,
  codexConfig: Map<string, string>,
): number {
  if (sharedConfig.size === 0 || codexConfig.size === 0) {
    throw new Error('MCP serverが設定されていません。')
  }

  const sharedNames = [...sharedConfig.keys()].toSorted()
  const codexNames = [...codexConfig.keys()].toSorted()
  const onlyShared = sharedNames.filter((name) => !codexConfig.has(name))
  const onlyCodex = codexNames.filter((name) => !sharedConfig.has(name))
  const differentUrls = sharedNames.filter(
    (name) => codexConfig.has(name) && codexConfig.get(name) !== sharedConfig.get(name),
  )
  const differences = [
    onlyShared.length > 0 ? `.codex/config.tomlにない: ${onlyShared.join(', ')}` : '',
    onlyCodex.length > 0 ? `.mcp.jsonにない: ${onlyCodex.join(', ')}` : '',
    differentUrls.length > 0 ? `URLが異なる: ${differentUrls.join(', ')}` : '',
  ].filter(Boolean)

  if (differences.length > 0) {
    throw new Error(`MCP設定が一致しません（${differences.join(' / ')}）。`)
  }

  return sharedConfig.size
}
