import { parseArgs } from 'node:util'

import { parseJson, run, runInherited } from './lib/cli.ts'
import { CloudflareBuildsClient, type BuildTrigger } from './lib/cloudflare-builds.ts'
import { detectCloudflareAccountId, getWranglerAccounts } from './lib/wrangler.ts'

type GitHubRepo = {
  id: number
  name: string
  full_name: string
  owner: {
    id: number
    login: string
    type: string
  }
  default_branch: string
}

type Options = {
  app: string
  packageName: string
  workerName: string
  rootDirectory: string
  branch: string
  buildCommand: string
  deployCommand: string
  domain: string
  buildTokenUuid: string
  buildTokenName: string
  deployBootstrap: boolean
  triggerBuild: boolean
  push: boolean
  dryRun: boolean
  accountId: string
}

function readOptions(): Options {
  const args = process.argv.slice(2)
  if (args[0] === '--') {
    args.shift()
  }

  const parsed = parseArgs({
    args,
    options: {
      app: { type: 'string', default: 'sales-report' },
      package: { type: 'string' },
      worker: { type: 'string' },
      root: { type: 'string' },
      branch: { type: 'string', default: 'main' },
      domain: { type: 'string' },
      'build-command': { type: 'string' },
      'deploy-command': { type: 'string' },
      'build-token-uuid': { type: 'string' },
      'build-token-name': { type: 'string' },
      'account-id': { type: 'string' },
      deploy: { type: 'boolean', default: false },
      'trigger-build': { type: 'boolean', default: false },
      push: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
    },
  })

  const app = parsed.values.app ?? 'sales-report'
  const domain = parsed.values.domain ?? process.env.DOMAIN ?? ''

  return {
    app,
    packageName: parsed.values.package ?? `@internal/${app}`,
    workerName: parsed.values.worker ?? app,
    rootDirectory: parsed.values.root ?? `apps/${app}`,
    branch: parsed.values.branch ?? 'main',
    buildCommand: parsed.values['build-command'] ?? 'pnpm install --frozen-lockfile && pnpm check',
    deployCommand:
      parsed.values['deploy-command'] ??
      (domain ? 'pnpm deploy -- --domain $DOMAIN' : 'pnpm deploy'),
    domain,
    buildTokenUuid:
      parsed.values['build-token-uuid'] ?? process.env.CLOUDFLARE_BUILD_TOKEN_UUID ?? '',
    buildTokenName:
      parsed.values['build-token-name'] ?? process.env.CLOUDFLARE_BUILD_TOKEN_NAME ?? '',
    accountId: parsed.values['account-id'] ?? process.env.CLOUDFLARE_ACCOUNT_ID ?? '',
    deployBootstrap: parsed.values.deploy ?? false,
    triggerBuild: parsed.values['trigger-build'] ?? false,
    push: parsed.values.push ?? false,
    dryRun: parsed.values['dry-run'] ?? false,
  }
}

function validateDomain(domain: string): void {
  if (!domain) {
    return
  }

  if (!/^[a-z0-9.-]+$/i.test(domain) || domain.includes('..')) {
    throw new Error(`DOMAIN contains unsupported characters: ${domain}`)
  }
}

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback
  if (!value) {
    throw new Error(
      `${name} is required. Use 1Password CLI, for example: op run -- pnpm bootstrap:builds`,
    )
  }

  return value
}

function getGitHubRepo(): GitHubRepo {
  const view = run('gh', ['repo', 'view', '--json', 'nameWithOwner'])
  if (view.status !== 0) {
    throw new Error(
      'Could not detect GitHub repository. Run gh auth login and set a git remote first.',
    )
  }

  const { nameWithOwner } = parseJson<{ nameWithOwner: string }>(view.stdout, 'gh repo view')
  const repo = run('gh', ['api', `repos/${nameWithOwner}`])
  if (repo.status !== 0) {
    throw new Error(`Could not read GitHub repository via gh api: ${repo.stderr}`)
  }

  return parseJson<GitHubRepo>(repo.stdout, 'gh api repos')
}

function findProductionTrigger(triggers: BuildTrigger[], branch: string): BuildTrigger | undefined {
  return triggers.find((trigger) => trigger.branch_includes?.includes(branch)) ?? triggers[0]
}

async function main(): Promise<void> {
  const options = readOptions()
  validateDomain(options.domain)
  const accountId = detectCloudflareAccountId({
    explicitAccountId: options.accountId,
    packageName: options.packageName,
  })
  const apiToken = requireEnv('CLOUDFLARE_BUILDS_API_TOKEN', process.env.CLOUDFLARE_API_TOKEN)

  if (!accountId) {
    const accounts = getWranglerAccounts(options.packageName)
    throw new Error(
      `Could not auto-detect Cloudflare account ID because Wrangler returned ${accounts.length} accounts. Set CLOUDFLARE_ACCOUNT_ID or pass --account-id.`,
    )
  }

  const client = new CloudflareBuildsClient({ accountId, apiToken })
  const repo = getGitHubRepo()

  console.log(`GitHub repository: ${repo.full_name}`)
  console.log(`Cloudflare Worker: ${options.workerName}`)
  console.log(`Root directory: ${options.rootDirectory}`)
  if (options.domain) {
    console.log(`Custom domain: ${options.domain}`)
  }

  await client.verifyToken()

  let buildTokenUuid = options.buildTokenUuid
  if (!buildTokenUuid) {
    const buildTokens = await client.listBuildTokens()
    const requestedToken = options.buildTokenName
      ? buildTokens.find((token) => token.build_token_name === options.buildTokenName)
      : undefined

    if (requestedToken) {
      buildTokenUuid = requestedToken.build_token_uuid
      console.log(`Using Cloudflare build token by name: ${requestedToken.build_token_name}`)
    } else if (buildTokens.length === 1 && buildTokens[0]) {
      buildTokenUuid = buildTokens[0].build_token_uuid
      console.log(
        `Using the only Cloudflare build token: ${buildTokens[0].build_token_name ?? buildTokenUuid}`,
      )
    } else {
      const tokenList = buildTokens
        .map((token) => {
          const name = token.build_token_name ?? '(unnamed)'
          return `- ${name}: ${token.build_token_uuid}`
        })
        .join('\n')

      throw new Error(
        [
          `CLOUDFLARE_BUILD_TOKEN_UUID or CLOUDFLARE_BUILD_TOKEN_NAME is required because ${buildTokens.length} build tokens were found.`,
          'Available build tokens:',
          tokenList || '- none',
          'Set CLOUDFLARE_BUILD_TOKEN_UUID, pass --build-token-uuid, or pass --build-token-name.',
        ].join('\n'),
      )
    }
  }

  let workers = await client.listWorkers()
  let worker = workers.find((script) => script.id === options.workerName)

  if (!worker && options.deployBootstrap) {
    if (options.dryRun) {
      const domainArgs = options.domain ? ` -- --domain ${options.domain}` : ''
      console.log(
        `[dry-run] would run: pnpm --filter ${options.packageName} run deploy${domainArgs}`,
      )
    } else {
      console.log('Worker not found. Running explicit bootstrap deploy...')
      const deployArgs = ['--filter', options.packageName, 'run', 'deploy']
      if (options.domain) {
        deployArgs.push('--', '--domain', options.domain)
      }

      const status = runInherited('pnpm', deployArgs)
      if (status !== 0) {
        throw new Error(`Bootstrap deploy failed with exit code ${status}.`)
      }

      workers = await client.listWorkers()
      worker = workers.find((script) => script.id === options.workerName)
    }
  }

  if (!worker?.tag) {
    if (options.dryRun) {
      console.log(`[dry-run] Worker ${options.workerName} was not found.`)
      console.log(`[dry-run] rerun with --deploy to preview the explicit bootstrap deploy path.`)
      return
    }

    throw new Error(
      [
        `Worker ${options.workerName} was not found.`,
        'Run with --deploy for an explicit platform-team bootstrap deploy, or create the Worker first.',
      ].join(' '),
    )
  }

  const triggers = await client.listTriggers(worker.tag)
  const existing = findProductionTrigger(triggers, options.branch)

  if (existing) {
    console.log(
      `Existing Builds trigger found: ${existing.trigger_name} (${existing.trigger_uuid})`,
    )

    if (!options.dryRun) {
      await client.updateTrigger(existing.trigger_uuid, {
        build_command: options.buildCommand,
        deploy_command: options.deployCommand,
        root_directory: options.rootDirectory,
        branch_includes: [options.branch],
        branch_excludes: [],
        path_includes: [
          `${options.rootDirectory}/**`,
          'packages/cloudflare-access/**',
          'packages/ui/**',
          'packages/config/**',
          'pnpm-lock.yaml',
          'pnpm-workspace.yaml',
        ],
        path_excludes: ['docs/**'],
        build_caching_enabled: true,
      })
      if (options.domain) {
        await client.setEnvironmentVariables(existing.trigger_uuid, {
          DOMAIN: { value: options.domain, is_secret: false },
        })
      }
    } else {
      console.log('[dry-run] would sync existing trigger settings')
      if (options.domain) {
        console.log('[dry-run] would set DOMAIN build environment variable')
      }
    }

    if (options.push) {
      if (options.dryRun) {
        console.log(`[dry-run] would run: git push origin ${options.branch}`)
      } else {
        const status = runInherited('git', ['push', 'origin', options.branch])
        if (status !== 0) {
          throw new Error(`git push failed with exit code ${status}.`)
        }
      }
    }

    if (options.triggerBuild) {
      if (options.dryRun) {
        console.log(`[dry-run] would trigger build for ${options.branch}`)
      } else {
        await client.triggerBuild(existing.trigger_uuid, options.branch)
        console.log(`Triggered Cloudflare build for ${options.branch}.`)
      }
    }

    return
  }

  console.log('No Builds trigger found. Creating repository connection and production trigger...')

  if (options.dryRun) {
    console.log('[dry-run] would PUT /builds/repos/connections')
    console.log('[dry-run] would POST /builds/triggers')
    console.log('[dry-run] would PATCH trigger environment variables')
    return
  }

  const connection = await client.connectRepository({
    providerAccountId: repo.owner.id,
    providerAccountName: repo.owner.login,
    repoId: repo.id,
    repoName: repo.name,
  })

  const trigger = await client.createTrigger({
    workerTag: worker.tag,
    repoConnectionUuid: connection.repo_connection_uuid,
    buildTokenUuid,
    triggerName: `Deploy ${options.app} production`,
    buildCommand: options.buildCommand,
    deployCommand: options.deployCommand,
    rootDirectory: options.rootDirectory,
    branchIncludes: [options.branch],
    branchExcludes: [],
    pathIncludes: [
      `${options.rootDirectory}/**`,
      'packages/cloudflare-access/**',
      'packages/ui/**',
      'packages/config/**',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
    ],
    pathExcludes: ['docs/**'],
    buildCachingEnabled: true,
  })

  await client.setEnvironmentVariables(trigger.trigger_uuid, {
    NODE_ENV: { value: 'production', is_secret: false },
    ...(options.domain ? { DOMAIN: { value: options.domain, is_secret: false } } : {}),
  })

  console.log(`Created Builds trigger: ${trigger.trigger_uuid}`)

  if (options.triggerBuild) {
    await client.triggerBuild(trigger.trigger_uuid, options.branch)
    console.log(`Triggered first Cloudflare build for ${options.branch}.`)
  }
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
