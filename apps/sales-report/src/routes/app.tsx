import { Button, Page } from '@internal/ui'
import { Hono } from 'hono'

import type { AppContext } from '../types'

export const appRoutes = new Hono<AppContext>()

appRoutes.get('/', (c) => {
  const user = c.get('user')

  return c.html(
    <Page title="Sales Report">
      <section class="panel">
        <h1>Sales Report</h1>
        <p>{user.email} としてログイン中です。</p>
        <p>Cloudflare Access で守られた内部ツールの雛形です。</p>
        <Button href="/api/me">APIを確認</Button>
      </section>
    </Page>,
  )
})
