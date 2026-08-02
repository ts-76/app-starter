import { data, Form, redirect, useNavigation } from 'react-router'

import { cloudflareContext } from '../../src/react-router-context'
import {
  createLunchOption,
  type LunchOption,
  listLunchOptions,
  voteForLunchOption,
} from '../../src/services/lunch-options'
import type { Route } from './+types/lunch'

export function meta(): Route.MetaDescriptors {
  return [
    { title: 'Lunch Vote' },
    { name: 'description', content: 'みんなでランチ候補を決めるアプリ' },
  ]
}

export async function loader({ context }: Route.LoaderArgs) {
  return { lunchOptions: await listLunchOptions(context.get(cloudflareContext).env.DB) }
}

function readFormText(formData: FormData, name: string) {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

export async function action({ request, context }: Route.ActionArgs) {
  const db = context.get(cloudflareContext).env.DB
  const formData = await request.formData()
  const intent = formData.get('intent')

  if (intent === 'add') {
    const name = readFormText(formData, 'name')
    const suggestedBy = readFormText(formData, 'suggestedBy') || 'みんな'

    if (!name || name.length > 80) {
      return data({ error: 'お店や食べたいものを80文字以内で入力してください。' }, { status: 400 })
    }

    if (suggestedBy.length > 40) {
      return data({ error: '提案者は40文字以内で入力してください。' }, { status: 400 })
    }

    await createLunchOption(db, { name, suggestedBy })
    return redirect('/app')
  }

  if (intent === 'vote') {
    const optionId = readFormText(formData, 'optionId')
    if (!optionId || !(await voteForLunchOption(db, optionId))) {
      return data({ error: '投票する候補が見つかりません。' }, { status: 404 })
    }

    return redirect('/app')
  }

  return data({ error: '操作を確認できませんでした。' }, { status: 400 })
}

export default function LunchPage({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation()
  const submittingIntent = navigation.formData?.get('intent')
  const votingId = submittingIntent === 'vote' ? navigation.formData?.get('optionId') : null
  const adding = submittingIntent === 'add'

  return (
    <main className="lunch-shell">
      <header className="lunch-header">
        <div className="brand-lockup">
          <span aria-hidden="true" className="brand-mark">
            🍱
          </span>
          <span>Lunch Vote</span>
        </div>
        <div className="header-copy">
          <p>今日のお昼、どうする？</p>
          <h1>食べたいものに、気軽に一票。</h1>
          <p className="header-description">
            候補を出し合って、みんなの気分が一番集まったランチを選びましょう。
          </p>
        </div>
      </header>

      <div className="lunch-layout">
        <section aria-labelledby="add-option-heading" className="add-panel">
          <div>
            <h2 id="add-option-heading">ランチ候補を追加</h2>
            <p>お店の名前でも、「カレー」のような気分でもOKです。</p>
          </div>

          <Form className="add-form" key={loaderData.lunchOptions.length} method="post">
            <input name="intent" type="hidden" value="add" />
            <label htmlFor="option-name">お店・食べたいもの</label>
            <input
              autoComplete="off"
              id="option-name"
              maxLength={80}
              name="name"
              placeholder="例: 駅前のスパイスカレー"
              required
            />
            <label htmlFor="suggested-by">
              提案者 <span>任意</span>
            </label>
            <input
              autoComplete="name"
              id="suggested-by"
              maxLength={40}
              name="suggestedBy"
              placeholder="例: トマ"
            />
            <button disabled={adding} type="submit">
              {adding ? '追加中…' : '候補に追加'}
            </button>
          </Form>

          {actionData?.error ? (
            <p className="form-error" role="alert">
              {actionData.error}
            </p>
          ) : null}
        </section>

        <section aria-labelledby="lunch-options-heading" className="options-panel">
          <div className="options-heading">
            <div>
              <h2 id="lunch-options-heading">みんなの候補</h2>
              <p>得票の多い順に並んでいます。</p>
            </div>
            <span aria-label={`${loaderData.lunchOptions.length}件の候補`} className="option-count">
              {loaderData.lunchOptions.length}件
            </span>
          </div>
          <LunchOptionsContent lunchOptions={loaderData.lunchOptions} votingId={votingId} />
        </section>
      </div>
    </main>
  )
}

export function LunchOptionsContent({
  lunchOptions,
  votingId = null,
}: {
  lunchOptions: LunchOption[]
  votingId?: FormDataEntryValue | null
}) {
  if (lunchOptions.length === 0) {
    return (
      <div className="empty-lunch">
        <span aria-hidden="true">🥢</span>
        <div>
          <h3>まだ候補はありません</h3>
          <p>最初の「食べたい！」を追加してみましょう。</p>
        </div>
      </div>
    )
  }

  return (
    <ol className="option-list">
      {lunchOptions.map((option, index) => {
        const isVoting = votingId === option.id

        return (
          <li key={option.id}>
            <span aria-label={`${index + 1}位`} className="option-rank">
              {index + 1}
            </span>
            <div className="option-details">
              <h3>{option.name}</h3>
              <p>
                {option.suggestedBy}さんの提案 ・ <time>{option.createdAt}</time>
              </p>
            </div>
            <Form method="post">
              <input name="intent" type="hidden" value="vote" />
              <input name="optionId" type="hidden" value={option.id} />
              <button aria-label={`${option.name}に投票`} disabled={isVoting} type="submit">
                <span aria-hidden="true">👍</span>
                <strong>{option.votes}</strong>
                <span>{isVoting ? '投票中…' : '票'}</span>
              </button>
            </Form>
          </li>
        )
      })}
    </ol>
  )
}
