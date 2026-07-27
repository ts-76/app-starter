# 運用スクリプト

## Workerのデプロイ方式

本番Workerのデプロイ方式は`config/cloudflare/production.json`で選択します。

```json
{
  "deployment": {
    "mode": "cloudflare-builds"
  }
}
```

| `deployment.mode`   | 実行元                    | GitHubに置くCloudflare secret |
| ------------------- | ------------------------- | ----------------------------- |
| `cloudflare-builds` | Cloudflare Workers Builds | 不要                          |
| `github-actions`    | GitHub Actions            | `CLOUDFLARE_DEPLOY_API_TOKEN` |

両方の導線は残しますが、実デプロイは設定した一方だけが行います。各コマンドは設定と実行元を照合し、一致しない場合はデプロイせず正常終了します。

ローカルやAIエージェントからの本番デプロイは禁止です。Workers BuildsではCloudflareが注入する`WORKERS_CI`、Build UUID、ブランチを検証し、GitHub Actionsでは`GITHUB_ACTIONS`とブランチを検証します。

## Cloudflare Workers BuildsをGUIで接続する

初回はCloudflare DashboardからGitHub Appを承認します。

1. `config/cloudflare/production.json`の`deployment.mode`は、接続確認が終わるまで現在の値を維持
2. CloudflareのWorkers & Pagesから対象Workerを選択
3. Settings > Builds > ConnectでGitHubを選択
4. Cloudflare Workers & Pages GitHub Appを、このリポジトリだけに限定して承認
5. Production branchを`main`に設定
6. Root directoryをリポジトリルートに設定
7. Build commandを`pnpm check`に設定
8. Deploy commandを次の形式に設定

```sh
pnpm deploy:builds -- --app <app-id>
```

例えば`apps/sales-report`の場合は次のコマンドです。

```sh
pnpm deploy:builds -- --app sales-report
```

この設定は`config/cloudflare/production.json`に登録したWorkerごとに行います。非本番ブランチのBuildは、必要になるまで無効にします。本番接続の確認後、後述の切替手順に従って`deployment.mode`を`cloudflare-builds`へ変更します。

Workers BuildsではCloudflare側のbuild tokenを使用します。GitHub Environmentへ`CLOUDFLARE_DEPLOY_API_TOKEN`を登録する必要はありません。

## Cloudflare Workers BuildsをAPIで設定する

GitHub Appの初回インストールと承認だけはGUIで行います。その後のリポジトリ接続、production trigger、build/deploy commandはWorkers Builds APIで設定できます。

API設定にはユーザースコープAPIトークンが必要です。

| 権限                         | レベル |
| ---------------------------- | ------ |
| Workers Builds Configuration | Edit   |
| Workers Scripts              | Read   |

アカウントスコープトークンはWorkers Builds APIでは使用できません。設定用トークンは1Passwordから一時的に注入し、リポジトリやenvファイルへ値を保存しません。接続後にAPIで保守しない場合は失効できます。

設定する値はGUI経路と同じです。

- Production branch: `main`
- Root directory: `/`
- Build command: `pnpm check`
- Deploy command: `pnpm deploy:builds -- --app <app-id>`
- Preview trigger: 初期状態では作成しない

APIの現在のエンドポイントとリクエスト形式は、Cloudflare公式の[Workers Builds API reference](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/)を参照します。

## GitHub ActionsをAPIトークンで接続する

`deployment.mode`を`github-actions`にし、GitHub Environment `production`へ次のsecretを設定します。

| 種類               | 名前                          | 内容                                           |
| ------------------ | ----------------------------- | ---------------------------------------------- |
| Environment secret | `CLOUDFLARE_DEPLOY_API_TOKEN` | デプロイ専用のCloudflareアカウント所有トークン |

トークンはCloudflare公式の`Edit Cloudflare Workers`テンプレートを起点に、対象アカウントへ限定します。Terraform用トークンとは分離します。

GitHub CLIで登録する場合、secret値は標準入力のプロンプトから入力します。

```sh
gh secret set CLOUDFLARE_DEPLOY_API_TOKEN --env production
```

`main`へのpush、またはGitHub上からの手動再実行で、登録済みのproductionアプリをすべて順番に処理します。

1. 依存関係を固定ロックファイルからインストール
2. `pnpm check`
3. `deployment.mode`を確認
4. `github-actions`の場合だけproductionアプリを列挙
5. 各Workerを`wrangler deploy`
6. `wrangler deployments status`で状態を確認

トークンを使わず、登録内容と実行予定だけを確認できます。

```sh
pnpm deploy:ci -- --dry-run
```

## デプロイ方式を安全に切り替える

### GitHub ActionsからWorkers Builds

1. `deployment.mode`を`github-actions`のまま、GUIまたはAPIでWorkers Buildsを接続
2. Deploy commandを`pnpm deploy:builds -- --app <app-id>`に設定
3. 接続テストではWorkers Builds側がモード不一致としてデプロイをスキップすることを確認
4. `deployment.mode`を`cloudflare-builds`へ変更してmainへマージ
5. 同じpushでGitHub Actionsがスキップし、Workers Buildsがデプロイしたことを確認
6. 不要ならGitHub Environmentのデプロイsecretを削除

### Workers BuildsからGitHub Actions

1. GitHub Environment `production`へデプロイsecretを設定
2. `deployment.mode`を`github-actions`へ変更してmainへマージ
3. 同じpushでWorkers Buildsがスキップし、GitHub Actionsがデプロイしたことを確認
4. 不要ならCloudflare側のBuild triggerを無効化

方式の切替と接続解除を同時に行わないことで、停止期間と二重デプロイを防ぎます。

## デプロイ状況の確認

GitHub Actionsの場合:

```sh
gh run list --workflow deploy.yml
gh run view <run-id> --log-failed
```

Workers Buildsの場合はCloudflare DashboardのBuild履歴とGitHubのCheckを確認します。ローカルでCloudflareのデプロイ状態を詳しく確認するときは、`wrangler login`または`cf auth login`のOAuthを利用します。

## Doctor

```sh
pnpm doctor
```

ローカルツール、認証状態、Account IDに加えて、現在の`deployment.mode`を表示します。`github-actions`の場合だけGitHub Environmentのデプロイsecretを必須判定します。`cloudflare-builds`の場合は、対象WorkerごとのGit接続をCloudflare側で確認するよう案内します。

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
| Workers BuildsのGUI接続      | GitHub Appの承認                                   |
| Workers BuildsのAPI設定      | 一時的なユーザースコープトークン                   |
| GitHub Actionsの本番デプロイ | GitHub Environmentのアカウント所有トークン         |
| Access・DNSのTerraform       | `.env.terraform.1password`のアカウント所有トークン |
| Terraform remote state       | `.env.terraform.1password`のbucket限定R2資格情報   |

Terraform用トークンは対象アカウントを基本範囲として、`Zero Trust Write`、`Access: Organizations, Identity Providers, and Groups Write`、`Access: Apps and Policies Write`、`Workers Scripts Write`（Custom Domain接続用）、`Zone Read`を付与します。Cloudflareのトークン画面で`Workers Scripts Write`を全アカウントにしか指定できない場合は、その制約に従います。GitHubデプロイ用トークンとは役割を分けます。

## Access・DNSの反映

利用者が編集するのは`config/cloudflare/production.json`と`config/access/*.csv`だけです。

```sh
pnpm infra:check
pnpm infra:plan
pnpm infra:apply -- --yes
```

`infra:apply`は削除を含むplanと、stateが空の既存環境への適用を拒否します。Terraformの自動実行はありません。
Access未初期化の新規アカウントでは、承認済みapplyの中でZero Trust Organizationだけを公式APIから初期化し、そのままTerraform stateの管理へ引き渡します。

Terraform stateはR2の `<projectId>-terraform-state` bucketへ保存します。R2の接続先はプロジェクト設定から自動生成され、利用者はbackendファイルを編集しません。初回セットアップと既存local stateの移行手順は[ops/terraform/README.md](../ops/terraform/README.md)を参照してください。
