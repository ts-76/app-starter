import { describe, expect, it } from 'vite-plus/test'

import { setWorkersDev } from './wrangler.ts'

describe('Wrangler production config', () => {
  it('Custom Domain向けにworkers.devを無効にする', () => {
    expect(setWorkersDev('{ "workers_dev": true }', false)).toBe('{ "workers_dev": false }')
  })

  it('workers_devがなければ設定生成を拒否する', () => {
    expect(() => setWorkersDev('{}', false)).toThrow('workers_dev を明示してください')
  })
})
