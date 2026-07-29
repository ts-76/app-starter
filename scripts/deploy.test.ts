import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vite-plus/test'

const repoRoot = path.resolve(import.meta.dirname, '..')

describe('Workers Builds bundle', () => {
  it('WranglerがHono JSX用のTypeScript設定を使用する', () => {
    const wranglerConfig = readFileSync(path.join(repoRoot, 'wrangler.jsonc'), 'utf8')
    const workerTypeScriptConfig = JSON.parse(
      readFileSync(path.join(repoRoot, 'tsconfig.worker.json'), 'utf8'),
    ) as {
      compilerOptions?: {
        jsx?: string
        jsxImportSource?: string
      }
    }

    expect(wranglerConfig).toContain('"tsconfig": "./tsconfig.worker.json"')
    expect(workerTypeScriptConfig.compilerOptions).toMatchObject({
      jsx: 'react-jsx',
      jsxImportSource: 'hono/jsx',
    })
  })
})
