# 運用スクリプト

## デプロイ認証

本番デプロイは `.github/workflows/deploy.yml` が担当します。Cloudflare Workers BuildsとユーザースコープAPIトークンには依存しません。

GitHub Environment `production` に次の1項目を設定します。

| 種類               | 名前                          | 内容                                           |
| ------------------ | ----------------------------- | ---------------------------------------------- |
| Environment secret | `CLOUDFLARE_DEPLOY_API_TOKEN` | デプロイ専用のCloudflareアカウント所有トークン |

トークンはCloudflare公式の `Edit Cloudflare Workers` テンプレートを起点に、対象アカウントへ限定します。値はリポジトリやローカルのenvファイルに保存しません。非機密のAccount IDは`config/cloudflare/production.json`で管理します。

GitHub CLIで登録する場合、secret値は標準入力のプロンプトから入力します。

```sh
gh secret set CLOUDFLARE_DEPLOY_API_TOKEN --env production
```

## 自動デプロイ

`main`へのpush、またはGitHub上からの手動再実行で、登録済みのproductionアプリをすべて順番にデプロイします。

1. 依存関係を固定ロックファイルからインストール
2. `pnpm check`
3. `config/cloudflare/production.json`からproductionアプリを列挙
4. 各アプリのWorker本体を`wrangler deploy`でデプロイ
5. `wrangler deployments status`で状態を確認

Custom Domainと、それに伴いCloudflareが生成するDNS・証明書はTerraform側で管理します。Wranglerから同じdomainを作成しないため、管理元が競合しません。

`scripts/deploy-ci.ts`は、実デプロイをGitHub Actionsの`main`ブランチに限定しています。ローカルやAIエージェントからは実行できません。登録内容だけ確認する場合は次を使います。

```sh
pnpm deploy:ci -- --dry-run
```

新規アプリは`config/cloudflare/production.json`へ登録されるため、Workflowのmatrixや個別設定を追加する必要はありません。

## デプロイ状況の確認

Cloudflare APIトークンは不要です。GitHub Actionsの実行結果とログを確認します。

```sh
gh run list --workflow deploy.yml
gh run view <run-id> --log-failed
```

ローカルでCloudflareのデプロイ状態を詳しく確認するときは、`wrangler login`または`cf auth login`のOAuthを利用します。

## Cloudflare Workers Buildsからの移行

二重デプロイと停止期間を避けるため、次の順番で切り替えます。

1. `config/cloudflare/production.json`のaccount IDを確認し、GitHub Environment `production`へアカウント所有トークンを設定
2. `deploy.yml`をmainへマージし、GitHub ActionsのWorkerデプロイ成功を確認
3. `pnpm infra:plan`でCustom Domain・Accessを確認し、`pnpm infra:apply -- --yes`で反映
4. Cloudflareダッシュボードで対象WorkerのWorkers Builds接続を解除
5. Builds用のユーザートークンと不要になったbuild tokenを失効

GitHub Actionsの初回成功を確認するまでは、外部のWorkers Builds接続を先に解除しないでください。

## Doctor

```sh
pnpm doctor
```

ローカルツールと認証状態に加え、設定したAccount IDがWranglerのログイン先に含まれるか、GitHub Environment `production`にデプロイ用secretが登録されているかを、秘密値を表示せず確認します。

## Bootstrap Cloudflare Access（非常用）

通常のAccess設定は`config/access/*.csv`と`config/cloudflare/production.json`で管理し、`pnpm infra:plan`で確認してから明示承認のもとで反映します。このスクリプトはTerraformが使えない緊急時のみ使います。

```sh
op run --env-file .env.terraform.1password -- pnpm bootstrap:access -- --allowed-email you@example.com
```

トークンを読まずにプレビューできます。

```sh
pnpm bootstrap:access -- --domain sales-report.tslab.app --allowed-email you@example.com --dry-run
```

## 認証の役割分担

| 用途                         | 認証                                               |
| ---------------------------- | -------------------------------------------------- |
| 日常のローカル開発           | 不要                                               |
| ローカルでCloudflareを調査   | `wrangler login` / `cf auth login`のOAuth          |
| GitHub Actionsの本番デプロイ | GitHub Environmentのアカウント所有トークン         |
| Access・DNSのTerraform       | `.env.terraform.1password`のアカウント所有トークン |

ユーザースコープAPIトークンを常設する用途はありません。

Terraform用トークンは対象アカウントだけに限定し、`Zero Trust Edit`、`Workers Scripts Write`（Custom Domain接続用）、`Zone Read`を付与します。GitHubデプロイ用トークンとは役割を分けます。

## Access・DNSの反映

利用者が編集するのは`config/cloudflare/production.json`と`config/access/*.csv`だけです。

```sh
pnpm infra:check
pnpm infra:plan
pnpm infra:apply -- --yes
```

`infra:apply`は削除を含むplanと、stateが空の既存環境への適用を拒否します。Terraformの自動実行はありません。
