import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vite-plus/test'

const repoRoot = path.resolve(import.meta.dirname, '..')

describe('Workers Builds bundle', () => {
  it('Cloudflare WorkersとViteで開発・ビルドする', () => {
    const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const viteConfig = readFileSync(path.join(repoRoot, 'vite.config.ts'), 'utf8')
    const deployScript = readFileSync(path.join(repoRoot, 'scripts/deploy.ts'), 'utf8')

    expect(packageJson.scripts).toMatchObject({
      build: 'react-router build',
      dev: 'react-router dev',
    })
    expect(packageJson.devDependencies).toMatchObject({
      '@cloudflare/vite-plugin': expect.any(String),
      '@react-router/dev': expect.any(String),
      '@tailwindcss/vite': expect.any(String),
      tailwindcss: expect.any(String),
    })
    expect(packageJson.dependencies).toMatchObject({
      hono: expect.any(String),
      react: expect.any(String),
      'react-dom': expect.any(String),
      'react-router': expect.any(String),
    })
    expect(JSON.stringify(packageJson)).not.toContain('catalog:')
    expect(packageJson.dependencies).not.toHaveProperty('hono-door')
    expect(packageJson.dependencies).not.toHaveProperty('hono-door-ui')
    expect(viteConfig).toContain("viteEnvironment: { name: 'ssr' }")
    expect(viteConfig).toContain('reactRouter()')
    expect(viteConfig).toContain('tailwindcss()')
    expect(deployScript).toContain("['exec', '--', 'react-router', 'build']")
    expect(deployScript).toContain('runWrangler(deployArgs, config.accountId)')
    expect(deployScript).not.toContain('runWrangler(withConfig(deployArgs')
  })

  it('初期構成をworkers.dev、D1、Accessなしで公開する', () => {
    const wranglerConfig = readFileSync(path.join(repoRoot, 'wrangler.jsonc'), 'utf8')

    expect(wranglerConfig).toContain('"workers_dev": true')
    expect(wranglerConfig).toContain('"binding": "DB"')
    expect(wranglerConfig).toContain('"database_name": "sales-report-db"')
    expect(wranglerConfig).not.toContain('"durable_objects"')
    expect(wranglerConfig).not.toContain('"ADMIN_API_TOKEN"')
    expect(wranglerConfig).not.toContain('ACCESS_')
    expect(wranglerConfig).not.toContain('"r2_buckets"')
  })

  it('型検査がReact Router生成型とWorker bindingsを使用する', () => {
    const rootTypeScriptConfig = JSON.parse(
      readFileSync(path.join(repoRoot, 'tsconfig.json'), 'utf8'),
    ) as {
      references?: Array<{ path?: string }>
    }
    const cloudflareTypeScriptConfig = JSON.parse(
      readFileSync(path.join(repoRoot, 'tsconfig.cloudflare.json'), 'utf8'),
    ) as {
      compilerOptions?: {
        jsx?: string
        jsxImportSource?: string
      }
    }

    expect(rootTypeScriptConfig.references).toContainEqual({ path: './tsconfig.cloudflare.json' })
    expect(cloudflareTypeScriptConfig.compilerOptions).toMatchObject({
      jsx: 'react-jsx',
    })
    expect(cloudflareTypeScriptConfig.compilerOptions).not.toHaveProperty('jsxImportSource')
  })
})
