# Sales Report

社内向け売上レポートアプリの Hono Worker 雛形です。

## ローカル開発

```sh
pnpm --filter @internal/sales-report dev
```

## 本番反映

PRをmainへマージすると、GitHub Actionsが自動デプロイします。ローカルからの直接デプロイは禁止です。

デプロイ対象とcustom domainは`config/cloudflare/production.json`の登録内容から自動的に解決されます。閲覧できるユーザーは`config/access/sales.csv`で管理します。
