import { describe, expect, it } from 'vite-plus/test'

import { assertMcpConfigsMatch, parseCodexMcpConfig, parseSharedMcpConfig } from './mcp-config.ts'

describe('MCP config', () => {
  const shared = `{
    "mcpServers": {
      "cloudflare-api": { "type": "http", "url": "https://mcp.cloudflare.com/mcp" },
      "hono-docs": { "type": "http", "url": "https://example.com/mcp" }
    }
  }`
  const codex = `
    [mcp_servers."cloudflare-api"]
    url = "https://mcp.cloudflare.com/mcp"
    enabled = true

    [mcp_servers."hono-docs"]
    url = "https://example.com/mcp"
  `

  it('同じserver名とURLを受け入れる', () => {
    expect(assertMcpConfigsMatch(parseSharedMcpConfig(shared), parseCodexMcpConfig(codex))).toBe(2)
  })

  it('不足しているserverを報告する', () => {
    expect(() =>
      assertMcpConfigsMatch(
        parseSharedMcpConfig(shared),
        parseCodexMcpConfig(
          '[mcp_servers."cloudflare-api"]\nurl = "https://mcp.cloudflare.com/mcp"',
        ),
      ),
    ).toThrow('.codex/config.tomlにない: hono-docs')
  })

  it('URLの不一致を報告する', () => {
    expect(() =>
      assertMcpConfigsMatch(
        parseSharedMcpConfig(shared),
        parseCodexMcpConfig(codex.replace('https://example.com/mcp', 'https://wrong.example/mcp')),
      ),
    ).toThrow('URLが異なる: hono-docs')
  })
})
