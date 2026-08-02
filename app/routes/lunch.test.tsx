import { renderToStaticMarkup } from 'react-dom/server'
import { createRoutesStub } from 'react-router'
import { describe, expect, it } from 'vite-plus/test'

import { LunchOptionsContent } from './lunch'

function renderLunchOptions(
  lunchOptions: Parameters<typeof LunchOptionsContent>[0]['lunchOptions'],
) {
  const Stub = createRoutesStub([
    {
      path: '/',
      Component: () => <LunchOptionsContent lunchOptions={lunchOptions} />,
    },
  ])

  return renderToStaticMarkup(<Stub />)
}

describe('Lunch Vote app', () => {
  it('取得したランチ候補を得票数とともにSSRする', () => {
    const html = renderLunchOptions([
      {
        id: 'lunch-1',
        name: 'スパイスカレー',
        suggestedBy: 'トマ',
        votes: 3,
        createdAt: '2026-08-02 12:00:00',
      },
    ])

    expect(html).toContain('スパイスカレー')
    expect(html).toContain('トマさんの提案')
    expect(html).toContain('3')
  })

  it('候補がないときに次の操作を案内する', () => {
    const html = renderLunchOptions([])

    expect(html).toContain('まだ候補はありません')
    expect(html).toContain('最初の「食べたい！」を追加')
  })
})
