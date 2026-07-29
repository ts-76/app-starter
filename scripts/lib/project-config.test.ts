import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vite-plus/test'

import { loadProjectConfig, toTerraformVariables } from './project-config.ts'

const temporaryRoots: string[] = []

function projectRoot(config: unknown): string {
  const root = mkdtempSync(path.join(tmpdir(), 'single-app-config-'))
  temporaryRoots.push(root)
  mkdirSync(path.join(root, 'config', 'cloudflare'), { recursive: true })
  mkdirSync(path.join(root, 'config', 'access'), { recursive: true })
  writeFileSync(
    path.join(root, 'config', 'cloudflare', 'production.json'),
    `${JSON.stringify(config)}\n`,
  )
  writeFileSync(
    path.join(root, 'config', 'access', 'production.csv'),
    'value,description\nowner@example.com,Owner\n',
  )
  writeFileSync(path.join(root, 'wrangler.jsonc'), '{}\n')
  return root
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('single-app project config', () => {
  it('単一アプリと単一Access ListをTerraform入力へ変換する', () => {
    const config = loadProjectConfig(
      projectRoot({
        projectId: 'internal-tools',
        accountId: '934c6255d681d05e1fa9903560de8a59',
        baseDomain: 'example.com',
        environment: 'production',
        app: {
          id: 'sales-report',
          hostname: 'sales-report.example.com',
        },
      }),
    )

    expect(config.app).toEqual({
      id: 'sales-report',
      name: 'Sales Report',
      hostname: 'sales-report.example.com',
    })
    expect(config.accessMembers).toEqual([{ value: 'owner@example.com', description: 'Owner' }])
    expect(toTerraformVariables(config)).toMatchObject({
      app_id: 'sales-report',
      hostname: 'sales-report.example.com',
      allowed_emails: [{ value: 'owner@example.com', description: 'Owner' }],
    })
  })

  it('複数アプリ版のapps設定を拒否する', () => {
    const root = projectRoot({
      projectId: 'internal-tools',
      accountId: '934c6255d681d05e1fa9903560de8a59',
      baseDomain: 'example.com',
      environment: 'production',
      apps: {
        'sales-report': { accessList: 'sales' },
      },
    })

    expect(() => loadProjectConfig(root)).toThrow('未対応の項目があります: apps')
  })
})
