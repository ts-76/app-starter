import path from 'node:path'
import { parseArgs } from 'node:util'

import {
  CloudflareAccessClient,
  type AccessApplicationInput,
  type AccessRule,
} from './lib/cloudflare-access.ts'
import { loadProjectConfig } from './lib/project-config.ts'

const repoRoot = path.resolve(import.meta.dirname, '..')

type Options = {
  appName: string
  domain: string
  accountId: string
  allowedEmails: string[]
  allowedDomains: string[]
  allowEveryone: boolean
  sameSiteCookieAttribute: string
  dryRun: boolean
}

function readOptions(): Options {
  const args = process.argv.slice(2)
  if (args[0] === '--') {
    args.shift()
  }

  const parsed = parseArgs({
    args,
    options: {
      name: { type: 'string' },
      domain: { type: 'string' },
      'account-id': { type: 'string' },
      'allowed-email': { type: 'string', multiple: true },
      'allowed-domain': { type: 'string', multiple: true },
      'allow-everyone': { type: 'boolean', default: false },
      'same-site-cookie-attribute': { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
  })

  const envEmails = splitCsv(process.env.ACCESS_ALLOWED_EMAILS)
  const envDomains = splitCsv(process.env.ACCESS_ALLOWED_DOMAINS)

  return {
    appName: parsed.values.name ?? '',
    domain: parsed.values.domain ?? process.env.DOMAIN ?? '',
    accountId: parsed.values['account-id'] ?? process.env.CLOUDFLARE_ACCOUNT_ID ?? '',
    allowedEmails: [...envEmails, ...(parsed.values['allowed-email'] ?? [])],
    allowedDomains: [...envDomains, ...(parsed.values['allowed-domain'] ?? [])],
    allowEveryone: parsed.values['allow-everyone'] ?? process.env.ACCESS_ALLOW_EVERYONE === 'true',
    sameSiteCookieAttribute:
      parsed.values['same-site-cookie-attribute'] ??
      process.env.ACCESS_SAME_SITE_COOKIE_ATTRIBUTE ??
      '',
    dryRun: parsed.values['dry-run'] ?? false,
  }
}

function splitCsv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback
  if (!value) {
    throw new Error(
      `${name} is required. Use 1Password CLI, for example: op run -- pnpm bootstrap:access`,
    )
  }

  return value
}

function validateDomain(domain: string): void {
  if (!domain) {
    throw new Error('DOMAIN is required. Set DOMAIN or pass --domain.')
  }

  if (!/^[a-z0-9.-]+$/i.test(domain) || domain.includes('..')) {
    throw new Error(`DOMAIN contains unsupported characters: ${domain}`)
  }
}

function validateEmail(email: string): void {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error(`Invalid allowed email: ${email}`)
  }
}

function validateAllowedDomain(domain: string): void {
  if (!/^[a-z0-9.-]+$/i.test(domain) || domain.includes('..') || !domain.includes('.')) {
    throw new Error(`Invalid allowed domain: ${domain}`)
  }
}

function buildIncludeRules(options: Options): AccessRule[] {
  for (const email of options.allowedEmails) {
    validateEmail(email)
  }

  for (const domain of options.allowedDomains) {
    validateAllowedDomain(domain)
  }

  const include: AccessRule[] = [
    ...options.allowedEmails.map((email) => ({ email: { email } })),
    ...options.allowedDomains.map((domain) => ({ email_domain: { domain } })),
  ]

  if (options.allowEveryone) {
    include.push({ everyone: {} })
  }

  if (include.length === 0) {
    throw new Error(
      'At least one Access include rule is required. Pass --allowed-email, --allowed-domain, or --allow-everyone.',
    )
  }

  return include
}

function buildApplication(options: Options): AccessApplicationInput {
  const application: AccessApplicationInput = {
    name: options.appName,
    domain: options.domain,
    type: 'self_hosted',
    app_launcher_visible: false,
    http_only_cookie_attribute: true,
    session_duration: '24h',
    policies: [
      {
        name: 'Allow approved users',
        decision: 'allow',
        precedence: 1,
        include: buildIncludeRules(options),
        session_duration: '24h',
      },
    ],
  }

  if (options.sameSiteCookieAttribute) {
    application.same_site_cookie_attribute = options.sameSiteCookieAttribute
  }

  return application
}

async function main(): Promise<void> {
  console.warn(
    [
      '注意: bootstrap:access は非常用ツールです。',
      '通常のAccess設定は config/access/*.csv と config/cloudflare/production.json を編集し、',
      'pnpm infra:plan で確認してから明示承認のもとで反映します (ops/terraform/README.md 参照)。',
      '',
    ].join('\n'),
  )

  const options = readOptions()
  const config = loadProjectConfig(repoRoot)
  options.appName ||= config.app.name
  options.domain ||= config.app.hostname
  if (options.allowedEmails.length === 0) {
    options.allowedEmails = config.accessMembers.map((member) => member.value)
  }
  validateDomain(options.domain)

  const accountId = options.accountId || config.accountId
  if (options.accountId && options.accountId !== config.accountId) {
    throw new Error(
      'The requested Cloudflare account ID does not match config/cloudflare/production.json.',
    )
  }

  const input = buildApplication(options)

  console.log(`Cloudflare Access app: ${input.name}`)
  console.log(`Protected domain: ${input.domain}`)

  if (options.dryRun) {
    console.log('[dry-run] would upsert Access application with:')
    console.log(JSON.stringify(input, null, 2))
    return
  }

  const apiToken = requireEnv('CLOUDFLARE_TERRAFORM_API_TOKEN', process.env.CLOUDFLARE_API_TOKEN)
  const client = new CloudflareAccessClient({ accountId, apiToken })

  await client.verifyToken()
  const applications = await client.listApplications()
  const existing = applications.find((app) => app.domain === input.domain)

  if (existing) {
    const app = await client.updateApplication(existing.id, input)
    console.log(`Updated Access application: ${app.id}`)
    return
  }

  const app = await client.createApplication(input)
  console.log(`Created Access application: ${app.id}`)
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
