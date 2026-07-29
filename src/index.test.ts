import { describe, expect, it } from 'vite-plus/test'

import app from './index'

const authenticatedHeaders = {
  'cf-access-authenticated-user-email': 'local@example.com',
}

const baseBindings = {
  ACCESS_AUD: 'test-audience',
  ACCESS_TEAM_DOMAIN: 'https://internal-tools-tslab-app.cloudflareaccess.com',
  APP_ENV: 'local' as const,
  ASSETS_BUCKET: {} as R2Bucket,
}

describe('sales-report Worker', () => {
  it('認証ヘッダーがなければアクセスを拒否する', async () => {
    const response = await app.request('/health', {}, baseBindings)

    expect(response.status).toBe(401)
    await expect(response.text()).resolves.toBe('Cloudflare Access user is required.')
  })

  it('productionではメールヘッダーだけの偽装を拒否する', async () => {
    const response = await app.request(
      '/health',
      { headers: authenticatedHeaders },
      { ...baseBindings, APP_ENV: 'production' },
    )

    expect(response.status).toBe(401)
    await expect(response.text()).resolves.toBe('Cloudflare Access user is required.')
  })

  it('認証済みユーザーへhealthと環境情報を返す', async () => {
    const healthResponse = await app.request(
      '/health',
      { headers: authenticatedHeaders },
      baseBindings,
    )
    const meResponse = await app.request('/api/me', { headers: authenticatedHeaders }, baseBindings)

    expect(healthResponse.status).toBe(200)
    await expect(healthResponse.text()).resolves.toBe('ok')
    expect(meResponse.status).toBe(200)
    await expect(meResponse.json()).resolves.toEqual({
      user: { email: 'local@example.com' },
      environment: 'local',
    })
  })

  it('D1の行をreports APIのレスポンスへ変換する', async () => {
    const database = {
      prepare: () => ({
        all: async () => ({
          results: [
            {
              id: 'report-1',
              title: '月次売上',
              status: 'published',
              created_at: '2026-07-01 00:00:00',
            },
          ],
        }),
      }),
    } as unknown as D1Database

    const response = await app.request(
      '/api/reports',
      { headers: authenticatedHeaders },
      { ...baseBindings, DB: database },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      reports: [
        {
          id: 'report-1',
          title: '月次売上',
          status: 'published',
          createdAt: '2026-07-01 00:00:00',
        },
      ],
    })
  })
})
