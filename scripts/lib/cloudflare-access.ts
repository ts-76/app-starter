export type CloudflareApiOptions = {
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

export type AccessRule =
  | { email: { email: string } }
  | { email_domain: { domain: string } }
  | { everyone: Record<string, never> }

export type AccessPolicy = {
  name: string
  decision: 'allow'
  precedence: number
  include: AccessRule[]
  session_duration?: string
}

export type AccessApplication = {
  id: string
  name?: string
  domain: string
  type: 'self_hosted'
  policies?: AccessPolicy[]
}

export type AccessApplicationInput = {
  name: string
  domain: string
  type: 'self_hosted'
  app_launcher_visible: boolean
  http_only_cookie_attribute: boolean
  same_site_cookie_attribute?: string
  session_duration: string
  policies: AccessPolicy[]
}

export type ZeroTrustOrganizationInput = {
  auth_domain: string
  name: string
  session_duration: string
}

export type ZeroTrustOrganization = ZeroTrustOrganizationInput & {
  created_at?: string
  updated_at?: string
}

function apiErrorMessage<T>(payload: CloudflareApiResponse<T>, statusText: string): string {
  return payload.errors?.map((error) => error.message).join('; ') || statusText
}

export class CloudflareAccessClient {
  readonly accountId: string
  readonly apiToken: string
  readonly baseUrl: string

  constructor(options: CloudflareApiOptions) {
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
      const message = apiErrorMessage(payload, response.statusText)
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
      const message = apiErrorMessage(payload, response.statusText)
      throw new Error(`Cloudflare token verification failed: ${message}`)
    }
  }

  async ensureOrganization(input: ZeroTrustOrganizationInput): Promise<'created' | 'existing'> {
    const path = '/access/organizations'
    const response = await fetch(`${this.baseUrl}/accounts/${this.accountId}${path}`, {
      headers: {
        authorization: `Bearer ${this.apiToken}`,
        'content-type': 'application/json',
      },
    })
    const payload = (await response.json()) as CloudflareApiResponse<ZeroTrustOrganization>

    if (response.ok && payload.success) {
      return 'existing'
    }

    const accessNotEnabled = payload.errors?.some(
      (error) => error.code === 9999 && error.message.includes('access.api.error.not_enabled'),
    )
    if (!accessNotEnabled) {
      throw new Error(
        `Cloudflare API GET ${path} failed: ${apiErrorMessage(payload, response.statusText)}`,
      )
    }

    await this.request<ZeroTrustOrganization>('POST', path, input)
    return 'created'
  }

  listApplications(): Promise<AccessApplication[]> {
    return this.request<AccessApplication[]>('GET', '/access/apps')
  }

  createApplication(input: AccessApplicationInput): Promise<AccessApplication> {
    return this.request<AccessApplication>('POST', '/access/apps', input)
  }

  updateApplication(appId: string, input: AccessApplicationInput): Promise<AccessApplication> {
    return this.request<AccessApplication>('PUT', `/access/apps/${appId}`, input)
  }
}
