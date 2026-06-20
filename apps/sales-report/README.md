# Sales Report

社内向け売上レポートアプリの Hono Worker 雛形です。

## ローカル開発

```sh
pnpm --filter @internal/sales-report dev
```

## Cloudflare Workers Builds

- Root directory: `apps/sales-report`
- Build command: `pnpm install --frozen-lockfile && pnpm check`
- Deploy command: `pnpm deploy`
- Production branch: `main`

## Build watch paths

Include:

- `apps/sales-report/**`
- `packages/cloudflare-access/**`
- `packages/ui/**`
- `packages/config/**`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`

Exclude:

- `docs/**`
