import { describe, expect, it } from 'vite-plus/test'

import { createLunchOption, listLunchOptions, voteForLunchOption } from './lunch-options'

describe('lunch option service', () => {
  it('得票順で取得したD1の行を変換する', async () => {
    const db = {
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
    } as unknown as D1Database

    await expect(listLunchOptions(db)).resolves.toEqual([
      {
        id: 'lunch-1',
        name: 'スパイスカレー',
        suggestedBy: 'トマ',
        votes: 3,
        createdAt: '2026-08-02 12:00:00',
      },
    ])
  })

  it('ランチ候補をD1へ追加する', async () => {
    let values: unknown[] = []
    const db = {
      prepare: () => ({
        bind: (...input: unknown[]) => {
          values = input
          return { run: async () => ({ meta: { changes: 1 } }) }
        },
      }),
    } as unknown as D1Database

    const id = await createLunchOption(db, { name: '蕎麦', suggestedBy: 'ミナ' })

    expect(id).toEqual(expect.any(String))
    expect(values).toEqual([id, '蕎麦', 'ミナ'])
  })

  it('候補の票を1つ増やす', async () => {
    const db = {
      prepare: () => ({
        bind: () => ({ run: async () => ({ meta: { changes: 1 } }) }),
      }),
    } as unknown as D1Database

    await expect(voteForLunchOption(db, 'lunch-1')).resolves.toBe(true)
  })
})
