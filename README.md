# Sales Report

Hono、Cloudflare Workers、Vite+で構成する単一アプリの社内向け売上レポートです。
本番WorkerはCloudflare Workers BuildsがGitHubの`main`を検知して自動反映し、
公開hostnameはCloudflare Zero Trust Accessで保護します。

## 構成

- `src`: Workerの画面、API、認証middleware、サービス
- `migrations`: D1 migration
- `wrangler.jsonc`: Worker binding、`workers.dev`無効化、Access JWT検証用の公開設定
- `config/cloudflare/production.json`: productionのCloudflare Account、hostname、アプリID
- `config/access/production.csv`: Accessを許可するメールアドレス
- `ops/terraform`: Custom DomainとZero Trust Access
- `scripts`: 入力検証、Workers Buildsデプロイ、Terraformの安全な実行入口
- `vite.config.ts`: Vite+のlint、format、型チェック、test、staged-file設定

このリポジトリは1リポジトリ1アプリです。別の社内アプリは別リポジトリとして作成し、
このリポジトリへアプリ一覧や共通デプロイ処理を追加しません。

## セットアップ

Node.js 22.6以上23未満、pnpm 11.8.0、mise、Gitを使います。

```sh
mise install
mise exec -- corepack enable
mise exec -- corepack prepare pnpm@11.8.0 --activate
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm exec vp --version
mise exec -- pnpm doctor
```

miseのshell連携が有効なら、以後の`mise exec --`は省略できます。
ローカル起動だけならTerraformと1Password CLIは不要です。

## ローカルで動かす

初回はD1 migrationをローカルDBへ適用します。

```sh
pnpm exec wrangler d1 migrations apply DB --local
pnpm dev
```

ローカルのD1とR2は`.wrangler/state`へ保存されます。サンプルデータが必要な場合だけ、
別ターミナルからローカルDBへ追加します。

```sh
pnpm exec wrangler d1 execute DB --local --command "INSERT OR REPLACE INTO reports (id, title, status) VALUES ('local-sample', 'ローカル確認用レポート', 'draft')"
```

本番ではCloudflare Access JWTを検証します。ローカルではJWTを発行できないため、
`APP_ENV=local`のときだけ認証済みメールヘッダーを明示して確認します。

```sh
curl -i http://127.0.0.1:8787/health
curl -i -H 'cf-access-authenticated-user-email: local@example.com' http://127.0.0.1:8787/health
curl -i -H 'cf-access-authenticated-user-email: local@example.com' http://127.0.0.1:8787/api/me
curl -i -H 'cf-access-authenticated-user-email: local@example.com' http://127.0.0.1:8787/api/reports
```

ヘッダーなしは`401`、ヘッダー付きは`200`になります。

## 本番反映

Cloudflare DashboardでこのリポジトリをWorkerへ接続し、次を設定します。

- Production branch: `main`
- Root directory: `/`
- Build command: `pnpm check`
- Deploy command: `pnpm deploy:builds`
- Preview builds: 無効

mainへのpushをWorkers Buildsが検知してデプロイします。GitHub ActionsへCloudflare API
tokenを保存しません。デプロイスクリプトはWorkers Buildsのmain実行だけを受け付け、
デプロイ後に未認証の`/health`がCloudflare Accessへ転送されることも確認します。

`wrangler.jsonc`では`workers_dev`と`preview_urls`を無効化しています。本番Workerは
Custom Domain以外から公開しません。

## Zero TrustとCustom Domain

通常の変更箇所は次の2つです。

- `config/cloudflare/production.json`: 単一アプリのIDとhostname
- `config/access/production.csv`: 許可メールアドレス

資格情報なしで設定を検証できます。

```sh
pnpm infra:check
```

DNS・Accessの反映依頼を受けた場合だけ、1Passwordから資格情報を一時注入してplanを
確認します。plan確認後の明示承認がある場合だけapplyします。

```sh
pnpm infra:plan
pnpm infra:apply -- --yes
```

TerraformはAccess Applicationを先に作り、その後Custom Domainを接続します。
stateはR2で共有し、直接のTerraformコマンドは使いません。詳細は
[ops/terraform/README.md](ops/terraform/README.md)を参照してください。

## チェック

```sh
pnpm check
pnpm infra:check
```

`pnpm check`はVite+の`vp check`と`vp test`、secretlintを実行します。`vp check`には
Oxfmt、Oxlint、型チェックが含まれます。D1・R2・Cloudflare Accessを含む挙動を変えた
場合は、上記の認証あり・なしのローカル確認も実施してください。
