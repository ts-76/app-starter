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
  same_site_cookie_attribute: 'strict'
  session_duration: string
  policies: AccessPolicy[]
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
