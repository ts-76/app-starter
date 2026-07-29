import type { Child } from 'hono/jsx'

export function Page(props: { title: string; children: Child }) {
  return (
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{props.title}</title>
        <style>{styles}</style>
      </head>
      <body>
        <main>{props.children}</main>
      </body>
    </html>
  )
}

export function Button(props: { href: string; children: Child }) {
  return (
    <a class="button" href={props.href}>
      {props.children}
    </a>
  )
}

const styles = `
:root {
  color-scheme: light;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #17202a;
  background: #f7f8fa;
}
body {
  margin: 0;
}
main {
  width: min(960px, calc(100vw - 32px));
  margin: 48px auto;
}
.panel {
  border: 1px solid #d8dee6;
  border-radius: 8px;
  background: #ffffff;
  padding: 24px;
}
.button {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 0 14px;
  border-radius: 6px;
  background: #176b87;
  color: #ffffff;
  text-decoration: none;
  font-weight: 600;
}
`
