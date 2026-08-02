import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from 'react-router'

import type { Route } from './+types/root'

import './app.css'

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta content="width=device-width, initial-scale=1" name="viewport" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export default function App() {
  return <Outlet />
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const notFound = isRouteErrorResponse(error) && error.status === 404

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl items-center px-6 py-16">
      <section className="w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold text-cyan-800">{notFound ? '404' : 'ERROR'}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
          {notFound ? 'ページが見つかりません' : '画面を表示できませんでした'}
        </h1>
        <Link
          className="mt-6 inline-flex min-h-10 items-center rounded-lg bg-cyan-800 px-4 font-semibold text-white transition-colors hover:bg-cyan-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-800"
          to="/app"
        >
          Lunch Voteへ戻る
        </Link>
      </section>
    </main>
  )
}
