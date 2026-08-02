import { Hono } from 'hono'

import { createLunchOption, listLunchOptions, voteForLunchOption } from '../services/lunch-options'
import type { AppContext } from '../types'

export const apiRoutes = new Hono<AppContext>()
  .get('/lunch-options', async (c) => {
    const lunchOptions = await listLunchOptions(c.env.DB)

    return c.json({ lunchOptions })
  })
  .post('/lunch-options', async (c) => {
    const body = await c.req.json<{ name?: unknown; suggestedBy?: unknown }>().catch(() => null)
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    const suggestedBy =
      typeof body?.suggestedBy === 'string' && body.suggestedBy.trim()
        ? body.suggestedBy.trim()
        : 'みんな'

    if (!name || name.length > 80 || suggestedBy.length > 40) {
      return c.json({ error: '候補名は1〜80文字、提案者は40文字以内で入力してください。' }, 400)
    }

    const id = await createLunchOption(c.env.DB, { name, suggestedBy })
    return c.json({ id }, 201)
  })
  .post('/lunch-options/:id/votes', async (c) => {
    const voted = await voteForLunchOption(c.env.DB, c.req.param('id'))

    if (!voted) {
      return c.json({ error: '候補が見つかりません。' }, 404)
    }

    return c.json({ ok: true })
  })

export type ApiRoutes = typeof apiRoutes
