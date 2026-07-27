# Terraform

Cloudflare Workers Custom Domain（DNS・証明書を含む）、Zero Trust Organization、メールのOne-time PIN認証、Zero Trust Access Application、再利用可能なEMAIL List、Access Policyを生成する固定ロジックです。

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

ログイン方式は追加設定が不要なメールのOne-time PINを固定で作成します。Access Listに登録されたメールアドレスを入力すると、Cloudflareからログインコードが送信されます。

## 利用者向けコマンド

初回だけ、プロジェクトで固定したTerraformをmiseで用意します。

```sh
mise install
```

資格情報なしで設定だけを確認します。

```sh
pnpm infra:check
```

1Passwordの参照ファイルからCloudflare資格情報とR2 state資格情報を一時的に渡し、planを表示します。

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

## R2 remote state

stateはCloudflare R2の次の場所へ保存します。接続先はプロジェクト設定から自動決定されるため、通常は編集しません。

```text
r2://<projectId>-terraform-state/<environment>/terraform.tfstate
```

このプロジェクトでは `r2://internal-tools-terraform-state/production/terraform.tfstate` です。R2は複数PCで同じstateを参照でき、`use_lockfile`による同時更新防止も有効にしています。日常の操作は変わらず、`infra:plan`と`infra:apply`だけを使います。

初回だけ、次の準備を行います。

1. 対象Cloudflareアカウントに `internal-tools-terraform-state` というR2 bucketを作成
2. そのbucketだけに `Object Read & Write` を持つR2 API tokenを作成
3. 1PasswordのCloudflare vaultにある `builds-api-token` 項目を開く
4. 取得したS3互換資格情報を `AWS_ACCESS_KEY_ID` と `AWS_SECRET_ACCESS_KEY` の2フィールドへ保存

資格情報は `.env.terraform.1password` の参照を通して実行中だけ環境変数へ入り、生成されるbackend設定、Terraform plan、Gitには保存しません。

既存のlocal stateから移行するときだけ、次を1回実行します。

```sh
pnpm infra:state:migrate -- --yes
```

同じコマンドを再実行してもstateは再コピーせず、R2上の移行済みstateを確認して終了します。

移行コマンドは次の安全確認を自動で行います。

- 移行前のlocal stateを `.generated/terraform/backups` へ保存
- 移行先が空、または同じresource内容・outputs・resource一覧であることを確認
- 別のstateがあるR2を上書きせず停止
- 移行後のresource内容・outputs・resource一覧が元と一致した場合だけlocal stateを退避

空のS3 backendへ初めて保存すると、Terraformは移行先に新しいlineageを採番し、serialを1から開始することがあります。そのためlineage・serialの同値ではなく、実際の管理内容を完全比較します。

移行後は別のPCでも同じ1Password項目を参照できれば、通常の`infra:*`コマンドから同じstateを利用できます。R2資格情報はTerraform操作専用であり、Workerの実行環境やGitHub Environmentには登録しません。

## stateと既存リソース

移行前のlocal backendのstateは `.generated/terraform/production.tfstate` にあり、Gitには追加されません。このファイルが残っている間、通常のplan/applyは誤って空のR2を使わないよう停止します。

既存のAccess Application、Policy、Workers Custom DomainがCloudflare上にある場合、最初のapplyより先にimportが必要です。stateが空のまま既存リソースを新規作成しないでください。

Workers Custom Domainは対象Workerが存在してから作成します。新規アプリでは、まずmainへの反映によるGitHub ActionsのWorkerデプロイを成功させ、その後に`infra:apply`を実行します。

## Terraformコードを変更する場合

次の場合だけ `ops/terraform` を変更します。

- 管理するCloudflareリソースの種類を増減する
- 命名規則や安全ポリシーを変える
- Cloudflare Providerの新しいスキーマへ移行する

ユーザーやアプリを追加するだけならTerraformコードの変更は不要です。
