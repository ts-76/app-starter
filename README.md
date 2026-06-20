# Internal Tools

Hono、Cloudflare Workers、pnpm workspace を使う社内アプリ基盤です。

## 構成

- `apps/*`: 各チームの Hono Worker アプリ
- `packages/*`: 共通認証、UI、設定、TypeScript 設定
- `ops/terraform`: Cloudflare Access、DNS、custom domain などの基盤設定
- `.github/*`: 品質、依存関係、CodeQL の CI
- `.claude/*`: AI エージェント向けの安全柵

## 開発

```sh
pnpm install
pnpm --filter @internal/sales-report dev
```

## チェック

```sh
pnpm check
```

## 本番反映

本番は Cloudflare Workers Builds から `main` 経由で反映します。ローカルや AI エージェントからの直接デプロイは禁止です。
