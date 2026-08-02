import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const idPattern = /^[a-z](?:[a-z0-9-]*[a-z0-9])?$/
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const domainPattern =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const accountIdPattern = /^[0-9a-f]{32}$/
const accessPathPattern = /^\/(?:[a-z0-9._~-]+(?:\/[a-z0-9._~-]+)*)?$/i
const defaultAccessFile = path.join('config', 'access', 'production.csv')

export type AccessMember = {
  value: string
  description: string
}

export type ProjectApp = {
  id: string
  name: string
  workersDevHostname?: string
}

export type CustomDomainConfig = {
  baseDomain: string
  hostname: string
}

export type AccessConfig = {
  authDomain: string
  hostname: string
  path: string
  domain: string
  allowedEmailsFile: string
  members: AccessMember[]
  resourceNames: AccessResourceNames
}

export type AccessResourceNames = {
  identityProvider: string
  emailList: string
  application: string
  policy: string
}

export type ProjectConfig = {
  projectId: string
  accountId?: string
  environment: 'production'
  app: ProjectApp
  customDomain?: CustomDomainConfig
  access?: AccessConfig
  mcpManagementEnabled: boolean
  warnings: string[]
}

export type CloudflareMcpResource =
  | {
      kind: 'zero-trust-organization'
      name: string
      authDomain: string
      sessionDuration: '24h'
    }
  | {
      kind: 'access-identity-provider'
      name: string
      type: 'onetimepin'
    }
  | {
      kind: 'zero-trust-email-list'
      name: string
      members: AccessMember[]
    }
  | {
      kind: 'access-application'
      name: string
      hostname: string
      path: string
      domain: string
      type: 'self_hosted'
      sessionDuration: '24h'
      policy: {
        name: string
        decision: 'allow'
        precedence: 1
        emailListName: string
      }
    }
  | {
      kind: 'workers-custom-domain'
      baseDomain: string
      hostname: string
      service: string
    }

export type CloudflareMcpDesiredState = {
  accountId: string
  environment: 'production'
  resources: CloudflareMcpResource[]
}

type JsonObject = Record<string, unknown>

function fail(message: string): never {
  throw new Error(message)
}

function assertObject(value: unknown, label: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${label} はJSONオブジェクトで指定してください。`)
  }
  return value as JsonObject
}

function assertAllowedKeys(object: JsonObject, allowed: string[], label: string): void {
  const unexpected = Object.keys(object).filter((key) => !allowed.includes(key))
  if (unexpected.length > 0) {
    fail(`${label} に未対応の項目があります: ${unexpected.join(', ')}`)
  }
}

function requireString(object: JsonObject, key: string, label: string): string {
  const value = object[key]
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${label}.${key} は空でない文字列で指定してください。`)
  }
  return value.trim()
}

function optionalString(object: JsonObject, key: string, label: string): string | undefined {
  if (object[key] === undefined) {
    return undefined
  }
  return requireString(object, key, label)
}

function validateId(value: string, label: string): string {
  if (!idPattern.test(value)) {
    fail(`${label} は小文字英数字とハイフンのIDで指定してください: ${value}`)
  }
  return value
}

function validateDomain(value: string, label: string): string {
  const normalized = value.toLowerCase()
  if (!domainPattern.test(normalized)) {
    fail(`${label} はホスト名だけを指定してください（https:// やパスは不可）: ${value}`)
  }
  return normalized
}

function validateAccessPath(value: string): string {
  if (!accessPathPattern.test(value)) {
    fail('access.path は /app のような末尾スラッシュなしのURL pathで指定してください。')
  }

  try {
    const url = new URL(value, 'https://example.com')
    if (url.pathname !== value) {
      fail('access.path は正規化済みのURL pathで指定してください。')
    }
  } catch {
    fail('access.path は有効なURL pathで指定してください。')
  }

  return value
}

function titleFromId(id: string): string {
  return id
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function parseCsvRows(source: string, label: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    const next = source[index + 1]

    if (character === '"') {
      if (quoted && next === '"') {
        cell += '"'
        index += 1
      } else {
        quoted = !quoted
      }
      continue
    }
    if (!quoted && character === ',') {
      row.push(cell)
      cell = ''
      continue
    }
    if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && next === '\n') {
        index += 1
      }
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      continue
    }
    cell += character
  }

  if (quoted) {
    fail(`${label}: CSVの引用符が閉じられていません。`)
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

export function parseAccessCsv(source: string, label: string): AccessMember[] {
  const rows = parseCsvRows(source, label)
  const header = rows.shift()?.map((cell) => cell.trim())
  if (!header || header.length !== 2 || header[0] !== 'value' || header[1] !== 'description') {
    fail(`${label}: 先頭行は value,description にしてください。`)
  }

  const members: AccessMember[] = []
  const seen = new Set<string>()
  rows.forEach((columns, index) => {
    if (columns.length === 1 && columns[0]?.trim() === '') {
      return
    }
    if (columns.length !== 2) {
      fail(`${label}:${index + 2}: value と description の2列で指定してください。`)
    }

    const value = (columns[0] ?? '').trim().toLowerCase()
    const description = (columns[1] ?? '').trim()
    if (!emailPattern.test(value)) {
      fail(`${label}:${index + 2}: メールアドレスが不正です: ${value || '(空)'}`)
    }
    if (seen.has(value)) {
      fail(`${label}:${index + 2}: メールアドレスが重複しています: ${value}`)
    }
    seen.add(value)
    members.push({ value, description })
  })

  return members.toSorted((left, right) => left.value.localeCompare(right.value))
}

function loadCustomDomain(root: JsonObject, label: string): CustomDomainConfig | undefined {
  if (root.customDomain === undefined) {
    return undefined
  }
  const rawDomain = assertObject(root.customDomain, `${label}.customDomain`)
  assertAllowedKeys(rawDomain, ['baseDomain', 'hostname'], `${label}.customDomain`)
  const baseDomain = validateDomain(
    requireString(rawDomain, 'baseDomain', `${label}.customDomain`),
    'customDomain.baseDomain',
  )
  const hostname = validateDomain(
    requireString(rawDomain, 'hostname', `${label}.customDomain`),
    'customDomain.hostname',
  )
  if (hostname !== baseDomain && !hostname.endsWith(`.${baseDomain}`)) {
    fail(`customDomain.hostname は ${baseDomain} 配下にしてください: ${hostname}`)
  }
  return { baseDomain, hostname }
}

function loadAccess(
  repoRoot: string,
  root: JsonObject,
  label: string,
  endpointHostname: string | undefined,
  projectId: string,
  appId: string,
): AccessConfig | undefined {
  if (root.access === undefined) {
    return undefined
  }
  const rawAccess = assertObject(root.access, `${label}.access`)
  assertAllowedKeys(
    rawAccess,
    ['authDomain', 'path', 'allowedEmailsFile', 'resourceNames'],
    `${label}.access`,
  )
  if (!endpointHostname) {
    fail('Custom DomainなしでAccessを使う場合は app.workersDevHostname が必要です。')
  }
  const authDomain = validateDomain(
    requireString(rawAccess, 'authDomain', `${label}.access`),
    'access.authDomain',
  )
  if (!authDomain.endsWith('.cloudflareaccess.com')) {
    fail('access.authDomain は cloudflareaccess.com のホスト名で指定してください。')
  }
  const accessPath = validateAccessPath(optionalString(rawAccess, 'path', `${label}.access`) ?? '/')

  const allowedEmailsFile =
    optionalString(rawAccess, 'allowedEmailsFile', `${label}.access`) ?? defaultAccessFile
  const normalizedAccessFile = path.normalize(allowedEmailsFile)
  if (
    path.isAbsolute(normalizedAccessFile) ||
    normalizedAccessFile.startsWith('..') ||
    !normalizedAccessFile.startsWith(`${path.join('config', 'access')}${path.sep}`)
  ) {
    fail('access.allowedEmailsFile は config/access 配下の相対パスで指定してください。')
  }
  const accessFile = path.join(repoRoot, normalizedAccessFile)
  if (!existsSync(accessFile)) {
    fail(`${allowedEmailsFile} がありません。`)
  }

  const defaultApplicationName = `${projectId}-${appId}`
  const rawResourceNames =
    rawAccess.resourceNames === undefined
      ? {}
      : assertObject(rawAccess.resourceNames, `${label}.access.resourceNames`)
  assertAllowedKeys(
    rawResourceNames,
    ['identityProvider', 'emailList', 'application', 'policy'],
    `${label}.access.resourceNames`,
  )
  const resourceName = (key: keyof AccessResourceNames, fallback: string): string => {
    const value = optionalString(rawResourceNames, key, `${label}.access.resourceNames`) ?? fallback
    return validateId(value, `access.resourceNames.${key}`)
  }

  return {
    authDomain,
    hostname: endpointHostname,
    path: accessPath,
    domain: accessPath === '/' ? endpointHostname : `${endpointHostname}${accessPath}`,
    allowedEmailsFile: normalizedAccessFile,
    members: parseAccessCsv(readFileSync(accessFile, 'utf8'), normalizedAccessFile),
    resourceNames: {
      identityProvider: resourceName('identityProvider', `${projectId}-email-one-time-pin`),
      emailList: resourceName('emailList', `${defaultApplicationName}-emails`),
      application: resourceName('application', defaultApplicationName),
      policy: resourceName('policy', `${defaultApplicationName}-allow`),
    },
  }
}

export function loadProjectConfig(repoRoot: string): ProjectConfig {
  const relativeConfigFile = path.join('config', 'cloudflare', 'production.json')
  const configFile = path.join(repoRoot, relativeConfigFile)
  if (!existsSync(configFile)) {
    fail(`${relativeConfigFile} が見つかりません。`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(configFile, 'utf8'))
  } catch (error) {
    fail(
      `${relativeConfigFile} を読み込めません: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const root = assertObject(parsed, relativeConfigFile)
  assertAllowedKeys(
    root,
    ['$schema', 'projectId', 'accountId', 'environment', 'app', 'customDomain', 'access'],
    relativeConfigFile,
  )

  const projectId = validateId(requireString(root, 'projectId', relativeConfigFile), 'projectId')
  const rawAccountId = optionalString(root, 'accountId', relativeConfigFile)
  const accountId = rawAccountId?.toLowerCase()
  if (accountId && !accountIdPattern.test(accountId)) {
    fail(`${relativeConfigFile}.accountId は32文字のCloudflare Account IDで指定してください。`)
  }
  const environment = requireString(root, 'environment', relativeConfigFile)
  if (environment !== 'production') {
    fail(`${relativeConfigFile}.environment は production にしてください。`)
  }

  const rawApp = assertObject(root.app, `${relativeConfigFile}.app`)
  assertAllowedKeys(rawApp, ['id', 'workersDevHostname'], `${relativeConfigFile}.app`)
  const appId = validateId(requireString(rawApp, 'id', `${relativeConfigFile}.app`), 'app.id')
  const workersDevHostnameValue = optionalString(
    rawApp,
    'workersDevHostname',
    `${relativeConfigFile}.app`,
  )
  const workersDevHostname = workersDevHostnameValue
    ? validateDomain(workersDevHostnameValue, 'app.workersDevHostname')
    : undefined
  if (workersDevHostname && !workersDevHostname.endsWith('.workers.dev')) {
    fail('app.workersDevHostname は workers.dev のホスト名で指定してください。')
  }
  if (workersDevHostname && !workersDevHostname.startsWith(`${appId}.`)) {
    fail(`app.workersDevHostname は ${appId}. で始まる必要があります。`)
  }
  if (!existsSync(path.join(repoRoot, 'wrangler.jsonc'))) {
    fail('単一アプリの wrangler.jsonc がリポジトリルートにありません。')
  }

  const customDomain = loadCustomDomain(root, relativeConfigFile)
  const access = loadAccess(
    repoRoot,
    root,
    relativeConfigFile,
    customDomain?.hostname ?? workersDevHostname,
    projectId,
    appId,
  )
  const mcpManagementEnabled = Boolean(customDomain || access)
  if (mcpManagementEnabled && !accountId) {
    fail('Custom DomainまたはAccessを使う場合は accountId が必要です。')
  }

  const warnings =
    access && access.members.length === 0
      ? [`${access.allowedEmailsFile} は空です。このアプリには誰もアクセスできません。`]
      : []

  return {
    projectId,
    accountId,
    environment: 'production',
    app: {
      id: appId,
      name: titleFromId(appId),
      workersDevHostname,
    },
    customDomain,
    access,
    mcpManagementEnabled,
    warnings,
  }
}

export function toCloudflareMcpDesiredState(config: ProjectConfig): CloudflareMcpDesiredState {
  if (!config.mcpManagementEnabled || !config.accountId) {
    fail('Custom DomainまたはAccessが設定されていないため、MCP管理対象はありません。')
  }

  const resources: CloudflareMcpResource[] = []
  if (config.access) {
    const { identityProvider, emailList, application, policy } = config.access.resourceNames
    resources.push(
      {
        kind: 'zero-trust-organization',
        name: config.projectId,
        authDomain: config.access.authDomain,
        sessionDuration: '24h',
      },
      {
        kind: 'access-identity-provider',
        name: identityProvider,
        type: 'onetimepin',
      },
      {
        kind: 'zero-trust-email-list',
        name: emailList,
        members: config.access.members,
      },
      {
        kind: 'access-application',
        name: application,
        hostname: config.access.hostname,
        path: config.access.path,
        domain: config.access.domain,
        type: 'self_hosted',
        sessionDuration: '24h',
        policy: {
          name: policy,
          decision: 'allow',
          precedence: 1,
          emailListName: emailList,
        },
      },
    )
  }

  if (config.customDomain) {
    resources.push({
      kind: 'workers-custom-domain',
      baseDomain: config.customDomain.baseDomain,
      hostname: config.customDomain.hostname,
      service: config.app.id,
    })
  }

  return {
    accountId: config.accountId,
    environment: config.environment,
    resources,
  }
}
