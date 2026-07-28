import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { ensureAccessMember, loadProjectConfig, registerProjectApp } from './lib/project-config.ts'

// 新しい社内アプリの雛形を生成する。
// 使い方: pnpm new:app <app-id> --team <team> --owner-email <email> [--name <表示名>] [--domain <domain>]

const parsed = parseArgs({
  allowPositionals: true,
  options: {
    name: { type: 'string' },
    team: { type: 'string' },
    domain: { type: 'string' },
    'owner-email': { type: 'string' },
  },
})

const appId = parsed.positionals[0]

function fail(message: string): never {
  console.error(`エラー: ${message}`)
  console.error(
    '使い方: pnpm new:app <app-id> --team <team> --owner-email <email> [--name <表示名>] [--domain <domain>]',
  )
  process.exit(1)
}

if (!appId) {
  fail(
    'app-id を指定してください (例: pnpm new:app expense-tracker --team finance --owner-email you@example.com)',
  )
}

if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(appId)) {
  fail(`app-id は小文字とハイフンのみ使えます (kebab-case): ${appId}`)
}

const accessList = parsed.values.team
if (!accessList || !/^[a-z](?:[a-z0-9-]*[a-z0-9])?$/.test(accessList)) {
  fail('--team を指定してください (例: --team finance)')
}

const ownerEmail = parsed.values['owner-email']
if (!ownerEmail || !ownerEmail.includes('@')) {
  fail('--owner-email に有効なメールアドレスを指定してください')
}

const displayName =
  parsed.values.name ??
  appId
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

const repoRoot = path.resolve(import.meta.dirname, '..')
const projectConfig = loadProjectConfig(repoRoot)
const appDir = path.join(repoRoot, 'apps', appId)

if (existsSync(appDir)) {
  fail(`apps/${appId} はすでに存在します`)
}

if (projectConfig.apps[appId]) {
  fail(`config/cloudflare/production.json に ${appId} はすでに登録されています`)
}

const files: Record<string, string> = {
  [`apps/${appId}/package.json`]: `${JSON.stringify(
    {
      name: `@internal/${appId}`,
      private: true,
      type: 'module',
      scripts: {
        dev: 'wrangler dev --var APP_ENV:local',
        typecheck: 'vp check --no-fmt --no-lint',
        check: 'pnpm typecheck',
      },
      dependencies: {
        '@internal/cloudflare-access': 'workspace:*',
        '@internal/config': 'workspace:*',
        '@internal/ui': 'workspace:*',
        hono: 'catalog:',
        zod: 'catalog:',
      },
      devDependencies: {
        '@cloudflare/workers-types': 'catalog:',
        '@internal/typescript-config': 'workspace:*',
        typescript: 'catalog:',
        wrangler: 'catalog:',
      },
    },
    null,
    2,
  )}\n`,

  [`apps/${appId}/tsconfig.json`]: `{
  "extends": "@internal/typescript-config/worker",
  "include": ["src/**/*.ts", "src/**/*.tsx", "worker-configuration.d.ts"]
}
`,

  [`apps/${appId}/wrangler.jsonc`]: `{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "${appId}",
  "main": "src/index.tsx",
  "compatibility_date": "2026-06-19",
  "workers_dev": false,
  // D1/R2 が必要になったら sales-report の wrangler.jsonc を参考に binding を追加してください。
  "vars": {
    "APP_ENV": "production",
  },
  "env": {
    "staging": {
      "name": "${appId}-staging",
      "workers_dev": false,
      "vars": {
        "APP_ENV": "staging",
      },
    },
  },
}
`,

  [`apps/${appId}/worker-configuration.d.ts`]: `// wrangler の binding を変更したら次で再生成してください:
// pnpm --filter @internal/${appId} exec wrangler types
declare interface Env {
  APP_ENV: string
}
`,

  [`apps/${appId}/src/types.ts`]: `import type { AccessVariables } from '@internal/cloudflare-access'

export type Bindings = Env

export type Variables = AccessVariables

export type AppContext = {
  Bindings: Bindings
  Variables: Variables
}
`,

  [`apps/${appId}/src/index.tsx`]: `import { requireAccessUser } from '@internal/cloudflare-access'
import { Hono } from 'hono'
import { csrf } from 'hono/csrf'
import { secureHeaders } from 'hono/secure-headers'

import type { AppContext } from './types'

const app = new Hono<AppContext>()

app.use('*', secureHeaders())
app.use('*', csrf())
app.use('*', requireAccessUser())

app.get('/health', (c) => c.json({ status: 'ok' }))

app.get('/', (c) => {
  const user = c.get('user')
  return c.html(
    <html>
      <body>
        <h1>${displayName}</h1>
        <p>ようこそ、{user.email} さん</p>
      </body>
    </html>,
  )
})

export default app
`,

  [`apps/${appId}/README.md`]: `# ${displayName}

## 開発

\`\`\`sh
pnpm install
pnpm --filter @internal/${appId} dev
\`\`\`

## 本番反映

PR を作成し、main にマージされると GitHub Actions が自動デプロイします。
`,
}

for (const [relativePath, content] of Object.entries(files)) {
  const absolutePath = path.join(repoRoot, relativePath)
  mkdirSync(path.dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, content)
  console.log(`作成: ${relativePath}`)
}

ensureAccessMember(repoRoot, accessList, ownerEmail, `${displayName} owner`)
registerProjectApp(repoRoot, appId, accessList, parsed.values.domain)
loadProjectConfig(repoRoot)
console.log(`更新: config/cloudflare/production.json に ${appId} を登録`)
console.log(`更新: config/access/${accessList}.csv に ${ownerEmail.toLowerCase()} を登録`)

console.log(`
次にやること:
1. pnpm install                              # workspace に新アプリを認識させる
2. pnpm --filter @internal/${appId} dev      # ローカルで動作確認
3. pnpm check                                # 品質チェック
4. pnpm infra:check                          # ドメインとAccess設定を確認
5. 作業ブランチでPRを作成                    # mainマージでGitHub Actionsがデプロイ
6. Access/DNSを反映するときは pnpm infra:plan で確認後、明示承認してapply
`)
