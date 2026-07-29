# Terraform

単一のCloudflare Workerに対して、Custom DomainとZero Trust Accessを管理します。

## 管理対象

- Zero Trust Organization
- メールのOne-time PIN Identity Provider
- `config/access/production.csv`から生成するEMAIL List
- 単一hostnameのAccess ApplicationとAllow policy
- WorkerのCustom Domain

Access Applicationを先に作成し、その後Custom Domainを接続します。新規hostnameがAccessの
ない状態で一時公開されることを防ぐため、依存順序を逆にしないでください。

通常の変更箇所はTerraformコードではなく次の2ファイルです。

- `config/cloudflare/production.json`
- `config/access/production.csv`

## 検証と反映

初回だけ、プロジェクトで固定したTerraformをmiseで用意します。

```sh
mise install
```

資格情報なしで設定を検証します。

```sh
pnpm infra:check
```

利用者が現在の会話でDNS・Accessの確認または反映を依頼した場合だけplanを実行します。

```sh
pnpm infra:plan
```

plan確認後、利用者が明示的に承認した場合だけ保存済みplanを適用します。

```sh
pnpm infra:apply -- --yes
```

`infra:apply`は削除を含むplanを拒否します。stateが空なのにリソースを作ろうとする場合も
停止します。完全な新規環境だけは、内容を確認した上で`--allow-bootstrap`を指定できます。

```sh
pnpm infra:apply -- --yes --allow-bootstrap
```

直接の`terraform apply`と`terraform destroy`は使いません。

## R2 remote state

stateは次の場所へ保存します。

```text
r2://<projectId>-terraform-state/<environment>/terraform.tfstate
```

このプロジェクトでは
`r2://internal-tools-terraform-state/production/terraform.tfstate`です。
R2は複数PCで同じstateを参照でき、`use_lockfile`で同時更新も防ぎます。

初回だけ次を準備します。

1. `internal-tools-terraform-state` R2 bucketを作成
2. そのbucketだけにObject Read & Writeを持つR2 API tokenを作成
3. Cloudflare Terraform tokenとR2資格情報を1Passwordの専用項目へ保存
4. `.env.terraform.1password`の`op://`参照先を専用項目へ合わせる

資格情報は`op run`の子プロセスだけへ入り、backend設定、plan、Gitには保存しません。

既存local stateから移行するときだけ、次を1回実行します。

```sh
pnpm infra:state:migrate -- --yes
```

移行スクリプトはlocal stateをバックアップし、移行先が空または同一内容であることを確認し、
移行後のresource・outputs・addressが一致した場合だけlocal stateを退避します。

## 複数アプリ版からのstate移行

単一アプリ化に伴い、EMAIL List、Access Application、Custom Domainをmodule/`for_each` address
から単一resource addressへ移します。`moved` blockを削除せず、最初の`infra:plan`で削除が
0件であることを確認してください。

期待する主な移行は次のとおりです。

- `cloudflare_zero_trust_list.email["sales"]` → `cloudflare_zero_trust_list.email`
- `module.access["sales-report"]...` → `cloudflare_zero_trust_access_application.this`
- `module.worker_domain["sales-report"]...` → `cloudflare_workers_custom_domain.this`

## Terraformコードを変更する場合

次の場合だけ`ops/terraform`を変更します。

- 管理するCloudflareリソースを増減する
- Access policyや公開順序を変える
- Cloudflare Providerの新しいスキーマへ移行する

hostnameや許可ユーザーの変更だけならTerraformコードは編集しません。
