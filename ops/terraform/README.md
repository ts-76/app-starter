# Terraform

Cloudflare Workers Custom Domain（DNS・証明書を含む）、Zero Trust Organization、Zero Trust Access Application、再利用可能なEMAIL List、Access Policyを生成する固定ロジックです。

通常の利用者やAIエージェントは、このディレクトリを編集しません。編集する入力は次の2か所です。

- `config/cloudflare/production.json`: project ID、Cloudflare Account ID、base domain、アプリとAccess Listの対応
- `config/access/*.csv`: アクセス可能なメールアドレス

## 入力から作られるもの

`config/cloudflare/production.json` のproject ID、アプリID、base domainから、Access認証ドメイン、hostname、リソース名を決定します。ポリシー名などを利用者が個別入力する必要はありません。Custom Domainの作成時に、CloudflareがDNSレコードと証明書も管理します。

`config/access/<list-id>.csv` はCloudflare Zero Trustの再利用可能なEMAIL Listになります。CSVは次の形式です。

```csv
value,description
alice@example.com,Sales owner
bob@example.com,Sales member
```

空のCSVは安全側に倒し、そのリストを使うアプリへ誰もアクセスできない状態を表します。

## 利用者向けコマンド

初回だけ、プロジェクトで固定したTerraformをmiseで用意します。

```sh
mise install
```

資格情報なしで設定だけを確認します。

```sh
pnpm infra:check
```

1Passwordの参照ファイルからCloudflare資格情報を一時的に渡し、planを表示します。

```sh
pnpm infra:plan
```

Terraform用のaccount-scoped tokenには、`Zero Trust Write`、`Access: Organizations, Identity Providers, and Groups Write`、`Access: Apps and Policies Write`、`Workers Scripts Write`（Custom Domain接続用）、`Zone Read`が必要です。リソース範囲は対象アカウントを基本としますが、Cloudflareのトークン画面で`Workers Scripts Write`を全アカウントにしか指定できない場合は、その制約に従います。

plan確認後、利用者が明示的に依頼した場合だけ、保存済みplanを適用します。

```sh
pnpm infra:apply -- --yes
```

`infra:apply` は削除を含むplanを拒否します。Terraform stateが空なのにリソースを作ろうとする場合も停止します。完全な新規環境だけは、内容を確認した上で `--allow-bootstrap` を追加できます。

```sh
pnpm infra:apply -- --yes --allow-bootstrap
```

Accessが未初期化のアカウントでは、`infra:apply`が公式APIでZero Trust Organizationを一度だけ作成してから、同じplanをTerraformへ引き渡します。2回目以降はTerraform stateで管理され、追加のGUI操作は不要です。

直接の `terraform apply` と `terraform destroy` は使いません。入力検証、削除防止、state確認を行う上記コマンドを入口にします。

## stateと既存リソース

local backendのstateは `.generated/terraform/production.tfstate` に保存され、Gitには追加されません。別のPCと共有する運用へ移行する場合は、applyを始める前にremote backendへ移行してください。

既存のAccess Application、Policy、Workers Custom DomainがCloudflare上にある場合、最初のapplyより先にimportが必要です。stateが空のまま既存リソースを新規作成しないでください。

Workers Custom Domainは対象Workerが存在してから作成します。新規アプリでは、まずmainへの反映によるGitHub ActionsのWorkerデプロイを成功させ、その後に`infra:apply`を実行します。

## Terraformコードを変更する場合

次の場合だけ `ops/terraform` を変更します。

- 管理するCloudflareリソースの種類を増減する
- 命名規則や安全ポリシーを変える
- Cloudflare Providerの新しいスキーマへ移行する

ユーザーやアプリを追加するだけならTerraformコードの変更は不要です。
