import { describe, expect, it } from 'vite-plus/test'

import { createApp } from './hono-app'

const app = createApp(async () => new Response('React Router SSR'))

const baseBindings = {
  APP_ENV: 'local' as const,
}

describe('Lunch Vote Worker', () => {
  it('healthを認証なしで返す', async () => {
    const response = await app.request('/health', {}, baseBindings)

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe('ok')
  })

  it('D1の行をlunch-options APIのレスポンスへ変換する', async () => {
    const database = {
      prepare: () => ({
        all: async () => ({
          results: [
            {
              id: 'lunch-1',
              name: 'スパイスカレー',
              suggested_by: 'トマ',
              votes: 3,
              created_at: '2026-08-02 12:00:00',
            },
          ],
        }),
      }),
    }

    const response = await app.request(
      '/app/api/lunch-options',
      {},
      { ...baseBindings, DB: database },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      lunchOptions: [
        {
          id: 'lunch-1',
          name: 'スパイスカレー',
          suggestedBy: 'トマ',
          votes: 3,
          createdAt: '2026-08-02 12:00:00',
        },
      ],
    })
  })

  it('ドメイン直下を内部アプリへリダイレクトする', async () => {
    const response = await app.request('/', {}, baseBindings)

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/app')
  })

  it('React Routerのマニフェスト取得をSSR処理へ渡す', async () => {
    const response = await app.request(
      '/__manifest?paths=/app&version=test',
      {},
      baseBindings,
      {} as ExecutionContext,
    )

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe('React Router SSR')
  })

  it('未定義のパスは404を返す', async () => {
    const response = await app.request('/sales-report', {}, baseBindings)

    expect(response.status).toBe(404)
  })
})
