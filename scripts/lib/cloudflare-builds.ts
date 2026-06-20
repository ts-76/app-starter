export type CloudflareClientOptions = {
  accountId: string
  apiToken: string
  baseUrl?: string
}

export type CloudflareApiResponse<T> = {
  success: boolean
  errors?: Array<{ code?: number; message: string }>
  messages?: Array<{ code?: number; message: string }>
  result: T
}

export type WorkerScript = {
  id: string
  tag?: string
}

export type BuildToken = {
  build_token_uuid: string
  build_token_name?: string
}

export type RepoConnection = {
  repo_connection_uuid: string
}

export type BuildTrigger = {
  trigger_uuid: string
  trigger_name: string
  external_script_id?: string
  repo_connection_uuid?: string
  branch_includes?: string[]
  root_directory?: string
}

export type EnvironmentVariable = {
  value: string
  is_secret: boolean
}

export class CloudflareBuildsClient {
  readonly accountId: string
  readonly apiToken: string
  readonly baseUrl: string

  constructor(options: CloudflareClientOptions) {
    this.accountId = options.accountId
    this.apiToken = options.apiToken
    this.baseUrl = options.baseUrl ?? 'https://api.cloudflare.com/client/v4'
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}/accounts/${this.accountId}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.apiToken}`,
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })

    const payload = (await response.json()) as CloudflareApiResponse<T>

    if (!response.ok || !payload.success) {
      const message =
        payload.errors?.map((error) => error.message).join('; ') || response.statusText
      throw new Error(`Cloudflare API ${method} ${path} failed: ${message}`)
    }

    return payload.result
  }

  async verifyToken(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/user/tokens/verify`, {
      headers: {
        authorization: `Bearer ${this.apiToken}`,
      },
    })

    const payload = (await response.json()) as CloudflareApiResponse<unknown>

    if (!response.ok || !payload.success) {
      const message =
        payload.errors?.map((error) => error.message).join('; ') || response.statusText
      throw new Error(`Cloudflare token verification failed: ${message}`)
    }
  }

  listWorkers(): Promise<WorkerScript[]> {
    return this.request<WorkerScript[]>('GET', '/workers/scripts')
  }

  listBuildTokens(): Promise<BuildToken[]> {
    return this.request<BuildToken[]>('GET', '/builds/tokens')
  }

  connectRepository(input: {
    providerAccountId: number
    providerAccountName: string
    repoId: number
    repoName: string
  }): Promise<RepoConnection> {
    return this.request<RepoConnection>('PUT', '/builds/repos/connections', {
      provider_type: 'github',
      provider_account_id: String(input.providerAccountId),
      provider_account_name: input.providerAccountName,
      repo_id: String(input.repoId),
      repo_name: input.repoName,
    })
  }

  listTriggers(workerTag: string): Promise<BuildTrigger[]> {
    return this.request<BuildTrigger[]>('GET', `/builds/workers/${workerTag}/triggers`)
  }

  createTrigger(input: {
    workerTag: string
    repoConnectionUuid: string
    buildTokenUuid: string
    triggerName: string
    buildCommand: string
    deployCommand: string
    rootDirectory: string
    branchIncludes: string[]
    branchExcludes: string[]
    pathIncludes: string[]
    pathExcludes: string[]
    buildCachingEnabled: boolean
  }): Promise<BuildTrigger> {
    return this.request<BuildTrigger>('POST', '/builds/triggers', {
      external_script_id: input.workerTag,
      repo_connection_uuid: input.repoConnectionUuid,
      build_token_uuid: input.buildTokenUuid,
      trigger_name: input.triggerName,
      build_command: input.buildCommand,
      deploy_command: input.deployCommand,
      root_directory: input.rootDirectory,
      branch_includes: input.branchIncludes,
      branch_excludes: input.branchExcludes,
      path_includes: input.pathIncludes,
      path_excludes: input.pathExcludes,
      build_caching_enabled: input.buildCachingEnabled,
    })
  }

  updateTrigger(
    triggerUuid: string,
    input: Partial<{
      build_command: string
      deploy_command: string
      root_directory: string
      branch_includes: string[]
      branch_excludes: string[]
      path_includes: string[]
      path_excludes: string[]
      build_caching_enabled: boolean
    }>,
  ): Promise<BuildTrigger> {
    return this.request<BuildTrigger>('PATCH', `/builds/triggers/${triggerUuid}`, input)
  }

  setEnvironmentVariables(
    triggerUuid: string,
    variables: Record<string, EnvironmentVariable>,
  ): Promise<Record<string, EnvironmentVariable>> {
    return this.request<Record<string, EnvironmentVariable>>(
      'PATCH',
      `/builds/triggers/${triggerUuid}/environment_variables`,
      variables,
    )
  }

  triggerBuild(triggerUuid: string, branch: string): Promise<unknown> {
    return this.request<unknown>('POST', `/builds/triggers/${triggerUuid}/builds`, { branch })
  }
}
