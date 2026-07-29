# 運用スクリプト

## WorkerはCloudflare Workers Buildsで反映する

本番WorkerはCloudflare Workers Buildsだけからデプロイします。GitHub Actionsに
Cloudflare API tokenを登録しません。

Cloudflare DashboardでWorkerのSettings > Builds > ConnectからGitHubを選び、次を設定します。

| 項目              | 値                   |
| ----------------- | -------------------- |
| Repository        | このリポジトリ       |
| Production branch | `main`               |
| Root directory    | `/`                  |
| Build command     | `pnpm check`         |
| Deploy command    | `pnpm deploy:builds` |
| Preview builds    | 無効                 |

GitHub Appはこのリポジトリだけに限定して承認します。Workers Builds側のデプロイ資格情報を
利用するため、GitHub EnvironmentやRepository SecretsへCloudflare tokenを置きません。

`pnpm deploy:builds`は次の条件をすべて満たす場合だけ実行できます。

- Cloudflareが`WORKERS_CI=1`を設定している
- production branchが`main`
- Build UUIDがある

デプロイ後はWranglerのdeployment statusを確認し、未認証の`/health`が
`*.cloudflareaccess.com`へリダイレクトされることも確認します。

実際のデプロイを行わず、対象だけ確認できます。

```sh
pnpm deploy:builds -- --dry-run
```

## デプロイ状況

Cloudflare DashboardのBuild履歴とGitHub Checkで確認します。main更新後にBuildが作られない
場合は、GitHub Appのリポジトリアクセス、Production branch、Build watch pathsを確認します。

## Doctor

```sh
pnpm doctor
```

Node、pnpm、GitHub、Wrangler、Terraform、単一アプリ設定、Cloudflare Account IDを確認します。
1Password CLIとTerraform資格情報は、DNS・Accessを扱うときだけ任意で必要です。

## 認証の役割分担

| 用途                       | 認証                                             |
| -------------------------- | ------------------------------------------------ |
| 日常のローカル開発         | 不要                                             |
| ローカルでCloudflareを調査 | `wrangler login`のOAuth                          |
| Worker本番デプロイ         | Cloudflare Workers Builds側のデプロイ資格情報    |
| Access・DNSのTerraform     | `.env.terraform.1password`のCloudflare token     |
| Terraform remote state     | `.env.terraform.1password`のbucket限定R2資格情報 |

Terraform用トークンは対象アカウントへ限定し、Zero Trust、Access Application、
Workers Custom Domain、Zone Readに必要な最小権限だけを付与します。Workerデプロイ資格情報とは
分離します。

## Access・DNS

利用者が通常編集するのは次の2ファイルです。

- `config/cloudflare/production.json`
- `config/access/production.csv`

```sh
pnpm infra:check
pnpm infra:plan
pnpm infra:apply -- --yes
```

`infra:check`は資格情報なしで実行できます。`infra:plan`は現在の会話で確認・反映を依頼された
場合だけ実行し、`infra:apply`はplan確認後の明示承認がある場合だけ実行します。

`infra:apply`は削除を含むplanと、stateが空の既存環境への適用を拒否します。Terraform stateは
R2の`<projectId>-terraform-state` bucketへ保存します。

## Bootstrap Cloudflare Access（非常用）

Terraformが使えない緊急時だけ利用します。通常は`infra:*`を使います。

```sh
pnpm bootstrap:access -- --dry-run
op run --env-file .env.terraform.1password -- pnpm bootstrap:access
```

dry-runと本実行のどちらも、単一アプリのhostnameと
`config/access/production.csv`を既定値として使用します。
