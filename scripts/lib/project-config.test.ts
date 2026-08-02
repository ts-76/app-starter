import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vite-plus/test'

import { loadProjectConfig, toCloudflareMcpDesiredState } from './project-config.ts'

const temporaryRoots: string[] = []

function projectRoot(config: unknown, accessCsv?: string): string {
  const root = mkdtempSync(path.join(tmpdir(), 'sales-report-config-'))
  temporaryRoots.push(root)
  mkdirSync(path.join(root, 'config', 'cloudflare'), { recursive: true })
  writeFileSync(
    path.join(root, 'config', 'cloudflare', 'production.json'),
    `${JSON.stringify(config)}\n`,
  )
  if (accessCsv !== undefined) {
    mkdirSync(path.join(root, 'config', 'access'), { recursive: true })
    writeFileSync(path.join(root, 'config', 'access', 'production.csv'), accessCsv)
  }
  writeFileSync(path.join(root, 'wrangler.jsonc'), '{}\n')
  return root
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('project config', () => {
  it('デフォルトではworkers.devを使いMCP管理対象を作らない', () => {
    const config = loadProjectConfig(
      projectRoot({
        projectId: 'sales-report',
        environment: 'production',
        app: { id: 'sales-report' },
      }),
    )

    expect(config).toMatchObject({
      projectId: 'sales-report',
      app: { id: 'sales-report', name: 'Sales Report' },
      mcpManagementEnabled: false,
    })
    expect(config.accountId).toBeUndefined()
    expect(config.customDomain).toBeUndefined()
    expect(config.access).toBeUndefined()
    expect(() => toCloudflareMcpDesiredState(config)).toThrow('MCP管理対象はありません')
  })

  it('Custom DomainだけをMCP desired stateへ変換する', () => {
    const config = loadProjectConfig(
      projectRoot({
        projectId: 'sales-report',
        accountId: '0123456789abcdef0123456789abcdef',
        environment: 'production',
        app: { id: 'sales-report' },
        customDomain: {
          baseDomain: 'example.com',
          hostname: 'sales-report.example.com',
        },
      }),
    )

    expect(toCloudflareMcpDesiredState(config)).toEqual({
      accountId: '0123456789abcdef0123456789abcdef',
      environment: 'production',
      resources: [
        {
          kind: 'workers-custom-domain',
          baseDomain: 'example.com',
          hostname: 'sales-report.example.com',
          service: 'sales-report',
        },
      ],
    })
  })

  it('workers.dev向けAccessを安全な順序のMCP desired stateへ変換する', () => {
    const config = loadProjectConfig(
      projectRoot(
        {
          projectId: 'sales-report',
          accountId: '0123456789abcdef0123456789abcdef',
          environment: 'production',
          app: {
            id: 'sales-report',
            workersDevHostname: 'sales-report.example.workers.dev',
          },
          access: {
            authDomain: 'example.cloudflareaccess.com',
          },
        },
        'value,description\nowner@example.com,Owner\n',
      ),
    )

    const desired = toCloudflareMcpDesiredState(config)
    expect(desired.resources.map((resource) => resource.kind)).toEqual([
      'zero-trust-organization',
      'access-identity-provider',
      'zero-trust-email-list',
      'access-application',
    ])
    expect(desired.resources).toMatchObject([
      {
        name: 'sales-report',
        authDomain: 'example.cloudflareaccess.com',
      },
      {
        name: 'sales-report-email-one-time-pin',
        type: 'onetimepin',
      },
      {
        name: 'sales-report-sales-report-emails',
        members: [{ value: 'owner@example.com', description: 'Owner' }],
      },
      {
        name: 'sales-report-sales-report',
        hostname: 'sales-report.example.workers.dev',
        path: '/',
        domain: 'sales-report.example.workers.dev',
        policy: {
          name: 'sales-report-sales-report-allow',
          emailListName: 'sales-report-sales-report-emails',
        },
      },
    ])
  })

  it('AccessをCustom Domainより先に並べる', () => {
    const config = loadProjectConfig(
      projectRoot(
        {
          projectId: 'sales-report',
          accountId: '0123456789abcdef0123456789abcdef',
          environment: 'production',
          app: { id: 'sales-report' },
          customDomain: {
            baseDomain: 'example.com',
            hostname: 'sales-report.example.com',
          },
          access: { authDomain: 'example.cloudflareaccess.com', path: '/app' },
        },
        'value,description\nowner@example.com,Owner\n',
      ),
    )

    const desired = toCloudflareMcpDesiredState(config)
    expect(desired.resources.map((resource) => resource.kind)).toEqual([
      'zero-trust-organization',
      'access-identity-provider',
      'zero-trust-email-list',
      'access-application',
      'workers-custom-domain',
    ])
    expect(desired.resources).toContainEqual(
      expect.objectContaining({
        kind: 'access-application',
        hostname: 'sales-report.example.com',
        path: '/app',
        domain: 'sales-report.example.com/app',
      }),
    )
  })

  it('既存MCP resourceの名前を明示できる', () => {
    const config = loadProjectConfig(
      projectRoot(
        {
          projectId: 'internal-tools',
          accountId: '0123456789abcdef0123456789abcdef',
          environment: 'production',
          app: { id: 'sales-report' },
          customDomain: {
            baseDomain: 'example.com',
            hostname: 'sales-report.example.com',
          },
          access: {
            authDomain: 'internal-tools.cloudflareaccess.com',
            resourceNames: {
              identityProvider: 'internal-tools-email-one-time-pin',
              emailList: 'internal-tools-sales-emails',
              application: 'internal-tools-sales-report',
              policy: 'internal-tools-sales-report-allow-sales',
            },
          },
        },
        'value,description\nowner@example.com,Owner\n',
      ),
    )

    expect(toCloudflareMcpDesiredState(config).resources).toMatchObject([
      { name: 'internal-tools' },
      { name: 'internal-tools-email-one-time-pin' },
      { name: 'internal-tools-sales-emails' },
      {
        name: 'internal-tools-sales-report',
        policy: { name: 'internal-tools-sales-report-allow-sales' },
      },
      { hostname: 'sales-report.example.com' },
    ])
  })

  it('Custom DomainなしのAccessにはworkers.dev hostnameを要求する', () => {
    const root = projectRoot(
      {
        projectId: 'sales-report',
        accountId: '0123456789abcdef0123456789abcdef',
        environment: 'production',
        app: { id: 'sales-report' },
        access: { authDomain: 'example.cloudflareaccess.com' },
      },
      'value,description\nowner@example.com,Owner\n',
    )

    expect(() => loadProjectConfig(root)).toThrow('app.workersDevHostname が必要です')
  })

  it('Access pathにqueryやwildcardを許可しない', () => {
    const root = projectRoot(
      {
        projectId: 'sales-report',
        accountId: '0123456789abcdef0123456789abcdef',
        environment: 'production',
        app: { id: 'sales-report', workersDevHostname: 'sales-report.example.workers.dev' },
        access: { authDomain: 'example.cloudflareaccess.com', path: '/app/*' },
      },
      'value,description\nowner@example.com,Owner\n',
    )

    expect(() => loadProjectConfig(root)).toThrow('access.path は /app')
  })

  it('複数アプリ版のapps設定を拒否する', () => {
    const root = projectRoot({
      projectId: 'sales-report',
      environment: 'production',
      app: { id: 'sales-report' },
      apps: {
        'sales-report': { accessList: 'sales' },
      },
    })

    expect(() => loadProjectConfig(root)).toThrow('未対応の項目があります: apps')
  })
})
