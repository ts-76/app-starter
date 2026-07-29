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

## 使用ツール

| ツール          | 必要になる場面              | バージョン・導入元                   |
| --------------- | --------------------------- | ------------------------------------ |
| Git             | すべての開発作業            | OSまたは公式配布                     |
| mise            | 開発環境の準備              | OSまたは公式配布                     |
| Node.js         | すべての開発作業            | `mise.toml`の固定バージョン          |
| pnpm / Corepack | 依存関係とスクリプトの実行  | `package.json`の`packageManager`     |
| Vite+           | format・lint・型・test      | リポジトリの`devDependencies`        |
| Wrangler        | Workerの開発と状態確認      | リポジトリの`devDependencies`        |
| GitHub CLI      | GitHub認証、PR、Checkの確認 | OSまたは公式配布                     |
| Terraform       | DNS・Accessのplanとapply    | `mise.toml`の固定バージョン          |
| 1Password CLI   | Terraform資格情報の一時注入 | OSまたは公式配布。インフラ操作時のみ |

AIエージェントへ作業を依頼する場合、利用者がこれらを事前に一つずつ導入する必要はありません。
エージェントは不足するツールを確認し、固定バージョンとlockfileに従って準備します。
Vite+とWranglerはグローバルに導入せず、このリポジトリの依存関係を使います。

GitHub、Cloudflare、1Passwordへのログインには利用者の操作が必要です。エージェントはログイン
画面やコマンドまで案内できますが、パスワード、認証コード、API tokenを受け取りません。
管理者権限を伴うシステム全体へのインストールが必要な場合も、実行前に利用者へ確認します。

## セットアップ

Node.js 22.6以上23未満、pnpm 11.8.0、mise、Gitを使います。
AIエージェントには「このリポジトリの開発環境をセットアップしてください」と依頼すれば、
ツール確認、依存関係の導入、Doctorまで実行します。

手動で準備する場合は次を実行します。

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
- Build command: `pnpm run check`
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
pnpm run check
pnpm infra:check
```

`pnpm run check`はVite+の`vp check`と`vp test`、secretlintを実行します。`vp check`には
Oxfmt、Oxlint、型チェックが含まれます。D1・R2・Cloudflare Accessを含む挙動を変えた
場合は、上記の認証あり・なしのローカル確認も実施してください。
