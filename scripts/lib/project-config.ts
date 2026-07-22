import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const idPattern = /^[a-z](?:[a-z0-9-]*[a-z0-9])?$/
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const domainPattern =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const accountIdPattern = /^[0-9a-f]{32}$/

export type AccessMember = {
  value: string
  description: string
}

export type ProjectApp = {
  id: string
  name: string
  hostname: string
  rootDirectory: string
  accessList: string
}

export type ProjectConfig = {
  projectId: string
  accountId: string
  baseDomain: string
  environment: 'production'
  apps: Record<string, ProjectApp>
  accessLists: Record<string, AccessMember[]>
  warnings: string[]
}

type JsonObject = Record<string, unknown>

function fail(message: string): never {
  throw new Error(message)
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertObject(value: unknown, label: string): JsonObject {
  if (!isObject(value)) {
    fail(`${label} はJSONオブジェクトで指定してください。`)
  }
  return value
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
  const value = object[key]
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${label}.${key} は空でない文字列で指定してください。`)
  }
  return value.trim()
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

function loadAccessList(repoRoot: string, listId: string): AccessMember[] {
  const file = path.join(repoRoot, 'config', 'access', `${listId}.csv`)
  if (!existsSync(file)) {
    fail(`Access List「${listId}」がありません: config/access/${listId}.csv`)
  }
  return parseAccessCsv(readFileSync(file, 'utf8'), `config/access/${listId}.csv`)
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
    ['$schema', 'projectId', 'accountId', 'baseDomain', 'environment', 'apps'],
    relativeConfigFile,
  )

  const projectId = validateId(requireString(root, 'projectId', relativeConfigFile), 'projectId')
  const accountId = requireString(root, 'accountId', relativeConfigFile).toLowerCase()
  if (!accountIdPattern.test(accountId)) {
    fail(`${relativeConfigFile}.accountId は32文字のCloudflare Account IDで指定してください。`)
  }
  const baseDomain = validateDomain(
    requireString(root, 'baseDomain', relativeConfigFile),
    'baseDomain',
  )
  const environment = requireString(root, 'environment', relativeConfigFile)
  if (environment !== 'production') {
    fail(`${relativeConfigFile}.environment は production にしてください。`)
  }

  const rawApps = assertObject(root.apps, `${relativeConfigFile}.apps`)
  if (Object.keys(rawApps).length === 0) {
    fail(`${relativeConfigFile}.apps に1件以上のアプリを登録してください。`)
  }

  const apps: Record<string, ProjectApp> = {}
  const referencedLists = new Set<string>()
  const hostnames = new Set<string>()

  for (const [appIdValue, rawAppValue] of Object.entries(rawApps).toSorted(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const appId = validateId(appIdValue, `apps.${appIdValue}`)
    const rawApp = assertObject(rawAppValue, `apps.${appId}`)
    assertAllowedKeys(rawApp, ['accessList', 'hostname'], `apps.${appId}`)

    const accessList = validateId(
      requireString(rawApp, 'accessList', `apps.${appId}`),
      `apps.${appId}.accessList`,
    )
    const configuredHostname = optionalString(rawApp, 'hostname', `apps.${appId}`)
    const hostname = validateDomain(
      configuredHostname ?? `${appId}.${baseDomain}`,
      `apps.${appId}.hostname`,
    )
    if (hostname !== baseDomain && !hostname.endsWith(`.${baseDomain}`)) {
      fail(`apps.${appId}.hostname は ${baseDomain} 配下にしてください: ${hostname}`)
    }
    if (hostnames.has(hostname)) {
      fail(`hostname が重複しています: ${hostname}`)
    }
    hostnames.add(hostname)

    const rootDirectory = path.join('apps', appId)
    if (!existsSync(path.join(repoRoot, rootDirectory, 'wrangler.jsonc'))) {
      fail(`apps.${appId}: ${rootDirectory}/wrangler.jsonc が見つかりません。`)
    }

    referencedLists.add(accessList)
    apps[appId] = {
      id: appId,
      name: titleFromId(appId),
      hostname,
      rootDirectory,
      accessList,
    }
  }

  const accessLists: Record<string, AccessMember[]> = {}
  const warnings: string[] = []
  for (const listId of [...referencedLists].toSorted()) {
    const members = loadAccessList(repoRoot, listId)
    accessLists[listId] = members
    if (members.length === 0) {
      warnings.push(
        `config/access/${listId}.csv は空です。このリストを使うアプリには誰もアクセスできません。`,
      )
    }
  }

  const accessDirectory = path.join(repoRoot, 'config', 'access')
  if (existsSync(accessDirectory)) {
    for (const file of readdirSync(accessDirectory)
      .filter((entry) => entry.endsWith('.csv'))
      .toSorted()) {
      const listId = path.basename(file, '.csv')
      validateId(listId, `config/access/${file}`)
      if (!referencedLists.has(listId)) {
        warnings.push(`config/access/${file} はどのアプリからも参照されていません。`)
      }
    }
  }

  return { projectId, accountId, baseDomain, environment, apps, accessLists, warnings }
}

export function toTerraformVariables(config: ProjectConfig): JsonObject {
  return {
    account_id: config.accountId,
    project_id: config.projectId,
    base_domain: config.baseDomain,
    apps: Object.fromEntries(
      Object.entries(config.apps).map(([id, app]) => [
        id,
        {
          name: app.name,
          hostname: app.hostname,
          access_list: app.accessList,
        },
      ]),
    ),
    access_lists: config.accessLists,
  }
}

export function writeTerraformVariables(repoRoot: string, config: ProjectConfig): string {
  const output = path.join(repoRoot, '.generated', 'terraform', 'production.tfvars.json')
  mkdirSync(path.dirname(output), { recursive: true })
  writeFileSync(output, `${JSON.stringify(toTerraformVariables(config), null, 2)}\n`)
  return output
}

function encodeCsvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

export function ensureAccessMember(
  repoRoot: string,
  listIdValue: string,
  emailValue: string,
  description: string,
): void {
  const listId = validateId(listIdValue, 'accessList')
  const email = emailValue.trim().toLowerCase()
  if (!emailPattern.test(email)) {
    fail(`メールアドレスが不正です: ${emailValue}`)
  }

  const file = path.join(repoRoot, 'config', 'access', `${listId}.csv`)
  mkdirSync(path.dirname(file), { recursive: true })
  const current = existsSync(file)
    ? parseAccessCsv(readFileSync(file, 'utf8'), `config/access/${listId}.csv`)
    : []
  if (current.some((member) => member.value === email)) {
    return
  }

  const next = [...current, { value: email, description: description.trim() }].toSorted((a, b) =>
    a.value.localeCompare(b.value),
  )
  const rows = [
    'value,description',
    ...next.map((member) => `${encodeCsvCell(member.value)},${encodeCsvCell(member.description)}`),
  ]
  writeFileSync(file, `${rows.join('\n')}\n`)
}

export function registerProjectApp(
  repoRoot: string,
  appIdValue: string,
  accessListValue: string,
  hostname?: string,
): void {
  const appId = validateId(appIdValue, 'appId')
  const accessList = validateId(accessListValue, 'accessList')
  const file = path.join(repoRoot, 'config', 'cloudflare', 'production.json')
  const root = assertObject(
    JSON.parse(readFileSync(file, 'utf8')),
    'config/cloudflare/production.json',
  )
  const apps = assertObject(root.apps, 'config/cloudflare/production.json.apps')
  if (apps[appId]) {
    fail(`config/cloudflare/production.json に ${appId} はすでに登録されています。`)
  }

  apps[appId] = hostname ? { accessList, hostname } : { accessList }
  root.apps = Object.fromEntries(Object.entries(apps).toSorted(([a], [b]) => a.localeCompare(b)))
  writeFileSync(file, `${JSON.stringify(root, null, 2)}\n`)
}
