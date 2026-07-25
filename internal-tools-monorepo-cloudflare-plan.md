# 社内アプリ基盤設計案：Hono + Cloudflare + pnpm モノレポ

作成日: 2026-06-19  
目的: AIエージェントを使って各チームが社内アプリを作るときに、自由度を残しながら、Cloudflare設定のずれを減らす。

---

## 1. 結論

この用途では、**pnpm workspace のモノレポ**を中心にして、アプリ開発と基盤管理を分けるのがよい。

各チームは `apps/*` の中で Hono アプリを作る。共通の認証確認、UI部品、設定、Claude Code hooks は `packages/*` とルート設定から使う。Cloudflare Access、DNS、本番公開のルールは、基盤側が Terraform で管理する。

重要なのは、すべてを一つの仕組みに押し込めないこと。

- アプリのコードは、各チームが触れるようにする
- 本番の入口、認証、DNS、権限は、基盤側でそろえる
- AIエージェントには本番デプロイ権限を持たせない
- Deploy to Cloudflare は、新規アプリの入口として使う
- Terraform は、Access や DNS などの共通設定を固定するために使う

この分け方にすると、チームは作りやすく、基盤側は運用を守りやすい。

---

## 2. 前提

今回の前提は次の通り。

- 社内向けの内部ツールを作る
- フレームワークは基本的に Hono を使う
- サーバー側の処理とUIを、同じWorkerで返す
- 認証の入口は Cloudflare Access で守る
- 各チームがAIエージェントを使ってアプリを作る
- 設定ずれを避けたい
- 本番はGitHubのmainから出る状態に寄せたい
- D1、KV、R2などのbindingsも扱う可能性がある

ここでいう「設定ずれ」は、たとえば次のようなもの。

- Accessで守られていないURLが残る
- `workers.dev` が公開されたままになる
- チームごとにbinding名が変わる
- 本番D1にローカルからmigrationを当てる
- GitHubのmainと実際の本番Workerがずれる
- AIエージェントが `wrangler deploy` を直接実行する

このあたりを仕組みで減らす。

---

## 3. 全体像

```txt
internal-tools/
  .github/
    dependabot.yml
    workflows/
      quality.yml
      dependency-review.yml
      codeql.yml

  apps/
    sales-report/
      src/
      migrations/
      wrangler.jsonc
      package.json
      README.md

    hr-admin/
      src/
      migrations/
      wrangler.jsonc
      package.json
      README.md

  packages/
    cloudflare-access/
    ui/
    config/
    quality-config/
    typescript-config/

  ops/
    terraform/
      modules/
        access-app/
        worker-domain/
      environments/
        prod/
        staging/

  config/
    cloudflare/
      production.json
    access/
      sales.csv

  .claude/
    settings.json
    hooks/
      block-dangerous-commands.js

  .oxlintrc.json
  .oxfmtrc.json
  .secretlintrc.json
  .secretlintignore
  lefthook.yml
  pnpm-workspace.yaml
  package.json
  pnpm-lock.yaml
  CLAUDE.md
  README.md
```

この構成では、`apps/*` が各アプリの置き場になる。`packages/*` は共通部品の置き場。`ops/terraform` は基盤側が管理する設定の置き場にする。`.github/*` とルートの設定ファイルは、品質チェックとセキュリティ確認をそろえるために置く。

---

## 4. 役割分担

### 各チームが触るもの

各チームは、基本的に自分たちのアプリ配下だけを触る。

```txt
apps/<app-name>/src
apps/<app-name>/migrations
apps/<app-name>/README.md
apps/<app-name>/package.json
```

ただし、`wrangler.jsonc` は自由に変えすぎると危ない。binding名やWorker名はテンプレートから大きく外さない。

### 基盤側が管理するもの

基盤側は、運用に関わる設定を管理する。

```txt
packages/cloudflare-access
packages/config
packages/quality-config
.claude/settings.json
.github/workflows
.github/dependabot.yml
lefthook.yml
.oxlintrc.json
.oxfmtrc.json
.secretlintrc.json
ops/terraform
GitHub branch protection
Cloudflare Access
DNS
本番デプロイ権限
```

この分け方にすると、各チームはアプリを作れる。基盤側は、本番公開の入口をそろえられる。

---

## 5. pnpm workspace を使う理由

pnpm workspace を使うと、1つのリポジトリの中で複数アプリと共通パッケージを管理できる。Cloudflare Workers でも、モノレポ内のWorkerごとにroot directoryを指定できるので、`apps/sales-report` のような単位でビルド対象を分けられる。

pnpm は `workspace:` という書き方も使える。これを使うと、共通パッケージをnpm上の別パッケージではなく、同じモノレポ内のものとして参照できる。共通部品のずれを減らせる。

`pnpm-workspace.yaml` の例。

```yaml
packages:
  - "apps/*"
  - "packages/*"

catalog:
  hono: "^4"
  wrangler: "^4"
  typescript: "^5"
  zod: "^3"
  oxlint: "^1"
  oxfmt: "^0"
  secretlint: "^12"
  lefthook: "^1"
```

`catalog` を使うと、依存バージョンを1か所に寄せられる。チームごとにHonoやWranglerのバージョンがずれることを減らせる。

各アプリの `package.json` は、たとえばこうする。

```json
{
  "name": "@internal/sales-report",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "check": "tsc --noEmit",
    "deploy": "wrangler deploy"
  },
  "dependencies": {
    "hono": "catalog:",
    "zod": "catalog:",
    "@internal/cloudflare-access": "workspace:*",
    "@internal/ui": "workspace:*"
  },
  "devDependencies": {
    "wrangler": "catalog:",
    "typescript": "catalog:"
  }
}
```

---

## 6. Honoアプリの基本形

HonoはCloudflare Workersで動かしやすい。UIもAPIも同じWorkerから返せるので、内部ツールには向いている。

アプリの中は、画面、API、認証、外部サービス呼び出しを分ける。

```txt
apps/sales-report/
  src/
    index.tsx
    routes/
      app.tsx
      api.ts
      health.ts
    components/
      layout.tsx
      button.tsx
    middleware/
      require-access-user.ts
      require-role.ts
    services/
      reports.ts
    types.ts
```

`src/index.tsx` のイメージ。

```ts
import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import { csrf } from 'hono/csrf'
import { appRoutes } from './routes/app'
import { apiRoutes } from './routes/api'
import { requireAccessUser } from './middleware/require-access-user'

type Bindings = {
  DB: D1Database
  ASSETS_BUCKET: R2Bucket
}

type Variables = {
  user: {
    email: string
    name?: string
  }
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

app.use('*', secureHeaders())
app.use('*', csrf())
app.use('*', requireAccessUser())

app.route('/app', appRoutes)
app.route('/api', apiRoutes)

app.get('/health', (c) => c.text('ok'))

export default app
```

Cloudflare Accessで入口を守っていても、アプリ側でユーザー情報を扱うなら、Access由来の情報を確認するmiddlewareを共通化する。これにより、チームごとに認証まわりの実装がばらばらになることを避ける。

---

## 7. 選択可能な本番デプロイ

本番デプロイは`config/cloudflare/production.json`の`deployment.mode`で、Cloudflare Workers BuildsまたはGitHub Actionsの一方を選択する。どちらも`main`へのpushを検知し、品質チェック後にproduction Workerをデプロイする。

両方の実行経路はリポジトリに残すが、デプロイスクリプトが設定と実行元を照合するため、同時にはデプロイしない。

```txt
cloudflare-builds:
  GitHub App: 対象リポジトリだけを承認
  Deploy: pnpm deploy:builds -- --app <app-id>
  Production branch: main

github-actions:
  GitHub Environment: production
  Secret: CLOUDFLARE_DEPLOY_API_TOKEN（account-owned）
  Deploy: pnpm deploy:ci
  Production branch: main
```

GitHub Actionsは登録済みアプリをまとめて反映する。Workers Buildsは対象Workerごとに同じリポジトリを接続する。どちらも共通configを読み、選択されていない経路は正常終了でスキップする。

---

## 8. wrangler.jsonc の方針

各アプリには `wrangler.jsonc` を必ず置く。Cloudflareの設定はダッシュボードだけに置かず、リポジトリにも残す。

例。

```jsonc
{
  "name": "sales-report",
  "main": "src/index.tsx",
  "compatibility_date": "2026-06-19",
  "workers_dev": false,
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "sales-report-prod",
      "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    }
  ],
  "r2_buckets": [
    {
      "binding": "ASSETS_BUCKET",
      "bucket_name": "sales-report-assets-prod"
    }
  ],
  "vars": {
    "APP_ENV": "production"
  }
}
```

ポイントは次の通り。

- `workers_dev` は原則 `false` にする
- 本番URLはAccessで守ったcustom domainに寄せる
- binding名は共通ルールにする
- D1 migrationは `migrations/` に置く
- secretはリポジトリに書かない

`workers.dev` を残すと、Accessで守ったcustom domainとは別の入口ができる可能性がある。内部ツールでは、入口を増やさないほうがよい。

---

## 9. Deploy to Cloudflare の位置づけ

Deploy to Cloudflare は、新規アプリを作る入口として使う。

たとえば、テンプレートリポジトリにボタンを置く。

```md
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/example/internal-hono-template)
```

Deploy to Cloudflare は、公開されたGitHub/GitLabリポジトリをもとに、利用者のアカウント側へアプリを作る導線として使える。

ただし、これだけで設定ずれを完全に防げるわけではない。Access、DNS、権限、本番公開ルールは、基盤側の管理に寄せる。

位置づけはこうする。

```txt
Deploy to Cloudflare
  → 新規アプリ作成の入口
  → Honoひな型、bindings、初期Worker作成を補助

Terraform
  → Access、DNS、共通ポリシーを固定

GitHub branch protection
  → mainに入る変更を制御

Cloudflare権限設計
  → ローカルやAIエージェントから本番直デプロイできないようにする
```

---

## 10. Terraform の使い方

この前提では、Terraformは採用したほうがよい。ただし、利用者やAIエージェントが通常編集する入力と、固定されたTerraformコードを分離する。

Terraformで管理するもの。

```txt
- Cloudflare Access application
- Cloudflare Access policy
- DNS record
- custom domain
- 共通の命名ルール
- 本番公開に必要な基盤設定
```

Terraformで管理しなくてもよいもの。

```txt
- Honoアプリの画面実装
- API実装
- 小さなUI修正
- 日々のアプリ開発
```

利用者がTerraformコードを直接編集すると手順が重くなる。`ops/terraform`は固定ロジックとし、利用者とAIエージェントは`config/cloudflare/production.json`と`config/access/*.csv`だけを編集する。

---

## 11. アプリ登録制

Cloudflareの画面で個別にAccessを作るのではなく、リポジトリの利用者向け設定を更新する。

例。

```json
{
  "projectId": "internal-tools",
  "accountId": "0123456789abcdef0123456789abcdef",
  "baseDomain": "internal.example.com",
  "environment": "production",
  "deployment": {
    "mode": "cloudflare-builds"
  },
  "apps": {
    "sales-report": {
      "accessList": "sales"
    }
  }
}
```

閲覧可能なユーザーは`config/access/sales.csv`へ`value,description`形式で記載する。TerraformはZero Trustの再利用可能なEMAIL Listを作り、Access Policyから参照する。

流れはこう。

```txt
1. 利用者とAIエージェントが apps/<app-name> にHonoアプリを作る
2. config/cloudflare/production.jsonへアプリを登録する
3. config/access/<list-id>.csvへ閲覧ユーザーを登録する
4. Pull Requestを出し、mainマージで選択中のCI/CDからWorkerをデプロイする
5. pnpm infra:planでDNS・Accessの差分を確認する
6. 利用者が明示承認し、pnpm infra:apply -- --yesで反映する
```

これにより、チームはCloudflareの細かい設定を直接触らなくてよくなる。

---

## 12. GitHubの運用

本番をGitHubのmainから出すなら、mainを守る必要がある。

最低限、次を入れる。

```txt
- mainへの直接pushを禁止
- Pull Request必須
- レビュー必須
- check必須
- CODEOWNERSで基盤ファイルのレビュー担当を固定
```

このリポジトリでは、存在しないチーム名を仮置きせず、現在のリポジトリオーナーを指定する。

```txt
/ops/terraform/ @ts-76
/packages/cloudflare-access/ @ts-76
/packages/quality-config/ @ts-76
/.github/ @ts-76
/.claude/ @ts-76
/lefthook.yml @ts-76
/.oxlintrc.json @ts-76
/.oxfmtrc.json @ts-76
/.secretlintrc.json @ts-76
/pnpm-workspace.yaml @ts-76
/pnpm-lock.yaml @ts-76
/apps/ @ts-76
```

組織チームを作成した場合だけ、実在してwrite権限を持つチームへ置き換える。


### 12.1 GitHub側でそろえるセキュリティ設定

GitHub側では、branch保護だけでなく、依存関係とworkflowの権限もそろえる。

```txt
- Dependabotで依存更新のPull Requestを作る
- Dependency Reviewで危険な依存追加をPull Request上で止める
- CodeQLでJavaScript / TypeScriptとGitHub Actions workflowを検査する
- GitHub Secret scanningを有効にする
- GITHUB_TOKENは最小権限にする
```

Dependabotは、pnpmでも `package-ecosystem: "npm"` を使う。モノレポでは `directories` に `/`、`/apps/*`、`/packages/*` を指定しておく。

`.github/dependabot.yml` の例。

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directories:
      - "/"
      - "/apps/*"
      - "/packages/*"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "09:00"
      timezone: "Asia/Tokyo"
    groups:
      js-dependencies:
        patterns:
          - "*"
        group-by: "dependency-name"

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "09:30"
      timezone: "Asia/Tokyo"

  - package-ecosystem: "terraform"
    directory: "/ops/terraform"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "10:00"
      timezone: "Asia/Tokyo"
```

Dependency Reviewは、新しく追加される依存に既知の問題がある場合にPull Requestで止めるために使う。

`.github/workflows/dependency-review.yml` の例。

```yaml
name: Dependency Review

on:
  pull_request:

permissions:
  contents: read
  pull-requests: read

jobs:
  dependency-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/dependency-review-action@v4
        with:
          fail-on-severity: moderate
```

CodeQLは、まずJavaScript / TypeScriptとGitHub Actions workflowを対象にする。

`.github/workflows/codeql.yml` の例。

```yaml
name: CodeQL

on:
  pull_request:
  push:
    branches:
      - main
  schedule:
    - cron: "0 18 * * 0"

permissions:
  contents: read
  security-events: write

jobs:
  analyze:
    name: Analyze
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        language:
          - javascript-typescript
          - actions
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v4
        with:
          languages: ${{ matrix.language }}
      - uses: github/codeql-action/analyze@v4
```

Rulesetsでは、`Quality`、`Dependency Review`、`CodeQL` をmainへの必須checkにする。GitHubのSecret scanningは、リポジトリの全履歴やPull Requestなどから秘密情報を探す機能なので、GitHub側のセキュリティ設定として有効化する。ローカルのsecretlintとは役割が違うため、両方使う。

---

## 13. 品質チェック、secret lint、pre-commit hook

AIエージェントを使う前提では、レビューだけで品質を守るのは難しい。人が見落とす前提で、ローカルとGitHubの両方で同じ検査を走らせる。

この構成では、リンターとフォーマッターはOxc系に寄せる。JavaScriptやTypeScriptのコードの問題を見つけるものを **Oxlint**、コードの見た目をそろえるものを **Oxfmt** として使う。秘密情報の混入は **secretlint** で検査する。Gitのcommit前に走る処理は、設定ファイルで管理しやすい **Lefthook** に寄せる。

### 13.1 使うツール

基本は次の組み合わせにする。

```txt
- Oxlint: JavaScript / TypeScript のlint
- Oxfmt: JavaScript / TypeScript / JSON / Markdown などのformat
- secretlint: APIキー、トークン、認証情報の混入検知
- Lefthook: pre-commit / pre-push などのGit hooks管理
```

OxfmtはPrettierに近い流れで使えるが、完全に同じではない。既存プロジェクトでPrettier pluginに強く依存している場合だけ、移行前に差分を見る。新規のHono内部ツールでは、最初からOxfmtへ寄せてよい。

### 13.2 ルートpackage.jsonの例

品質チェックは、各アプリにばらばらに置かず、ルートから実行できるようにする。

```json
{
  "scripts": {
    "lint": "oxlint .",
    "lint:fix": "oxlint . --fix",
    "format": "oxfmt . --write",
    "format:check": "oxfmt . --check",
    "secretlint": "secretlint \"**/*\"",
    "typecheck": "pnpm -r --if-present typecheck",
    "check": "pnpm format:check && pnpm lint && pnpm secretlint && pnpm typecheck",
    "prepare": "lefthook install"
  },
  "devDependencies": {
    "oxlint": "catalog:",
    "oxfmt": "catalog:",
    "secretlint": "catalog:",
    "@secretlint/secretlint-rule-preset-recommend": "latest",
    "lefthook": "catalog:"
  }
}
```

`prepare` でLefthookを入れておくと、`pnpm install` 後にGit hooksを入れやすい。ただし、CIではhookに頼らず、必ず `pnpm check` を直接実行する。

### 13.3 Oxlint設定

ルートに `.oxlintrc.json` を置く。

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "categories": {
    "correctness": "error",
    "suspicious": "error",
    "perf": "warn"
  },
  "plugins": ["typescript", "oxc", "unicorn", "import"],
  "ignorePatterns": [
    "node_modules/**",
    "dist/**",
    ".wrangler/**",
    "coverage/**"
  ]
}
```

最初から厳しすぎるルールにしない。内部ツールでは、まず壊れやすいコードを止める。命名や細かい書き方の強制は、運用が落ち着いてから増やす。

### 13.4 Oxfmt設定

ルートに `.oxfmtrc.json` を置く。

```json
{
  "$schema": "./node_modules/oxfmt/configuration_schema.json",
  "printWidth": 100,
  "singleQuote": true,
  "semi": false,
  "trailingComma": "all",
  "sortImports": true,
  "sortPackageJson": true,
  "ignorePatterns": [
    "node_modules/**",
    "dist/**",
    ".wrangler/**",
    "coverage/**",
    "pnpm-lock.yaml"
  ]
}
```

`pnpm-lock.yaml` は人が整形するものではないので、format対象から外す。lockfileはpnpmに任せる。

### 13.5 secretlint設定

ルートに `.secretlintrc.json` と `.secretlintignore` を置く。

```json
{
  "rules": [
    {
      "id": "@secretlint/secretlint-rule-preset-recommend"
    }
  ]
}
```

`.secretlintignore` の例。

```gitignore
node_modules/**
dist/**
.wrangler/**
coverage/**
pnpm-lock.yaml
```

secretlintは、commit前だけでなくCIでも走らせる。commit前だけにすると、hookを入れていない人やAIエージェントの作業を通してしまう可能性がある。

### 13.6 Lefthook設定

ルートに `lefthook.yml` を置く。commit前は軽い検査、push前やCIでは重い検査を走らせる。

```yaml
pre-commit:
  parallel: true
  commands:
    format:
      glob: "*.{js,jsx,ts,tsx,json,jsonc,md,mdx,yml,yaml}"
      run: pnpm exec oxfmt --check {staged_files}

    lint:
      glob: "*.{js,jsx,ts,tsx}"
      run: pnpm exec oxlint {staged_files}

    secretlint:
      run: pnpm exec secretlint {staged_files}

pre-push:
  commands:
    check:
      run: pnpm check
```

pre-commitで全プロジェクトの型チェックまで走らせると、開発体験が重くなる。型チェックはpre-pushとCIに寄せる。commit前は「明らかなミス」と「秘密情報」だけ止める。

### 13.7 GitHub Actionsの品質CI

GitHubにも同じ検査を入れる。ローカルのhookは補助であり、mergeを止める本命はCIにする。

`.github/workflows/quality.yml` の例。

```yaml
name: Quality

on:
  pull_request:
  push:
    branches:
      - main

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          run_install: false

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile
      - run: pnpm check
```

Rulesetsでは、この `Quality` のcheckをmainへの必須条件にする。これにより、AIエージェントがhookを無視しても、mainには入らない。

---

## 14. AIエージェント向けの安全柵

AIエージェントには、危険な操作を実行させない。

Claude Code hooksで止めたい操作。

```txt
- wrangler deploy
- wrangler delete
- wrangler d1 migrations apply --remote
- 直接のterraform apply
- terraform destroy
- git push origin main
- cloudflare API tokenの表示
- .envやsecretの読み取り、出力
```

ただし、hooksだけに頼らない。hooksは最後の安全柵にする。

本当に大事なのは、次の方針。

```txt
- ローカルに本番デプロイ用APIトークンを置かない
- AIエージェントにWorkerの直接デプロイ権限を渡さない
- 本番はmainに接続したWorkers BuildsまたはGitHub Actionsからだけ出す
- AccessとDNSは検証付きinfraコマンドからだけ反映する
```

`CLAUDE.md` には、方針を短く明記する。

```md
# AIエージェント作業ルール

このリポジトリでは、本番に直接反映する操作は禁止です。

禁止:
- wrangler deploy
- wrangler d1 migrations apply --remote
- 直接のterraform apply
- terraform destroy
- git push origin main

許可:
- ローカル開発
- 型チェック
- テスト
- Pull Request作成
- apps/<app-name>/src 配下の実装修正

Cloudflare Access、DNS、Terraform、共通認証パッケージを変更する場合は、利用者の明示確認が必要です。
```

---

## 15. 既存プロジェクトへの差し込み手順

すでに進行中のプロジェクトは、一気に作り直さない。入口から順番にそろえる。

手順。

```txt
1. 既存アプリの棚卸し
2. workers.dev や未保護URLがないか確認
3. wrangler.jsonc をリポジトリに追加する
4. Worker名、binding名、D1 database_id を現状に合わせる
5. Workers BuildsまたはGitHub Actionsのデプロイ方式を選ぶ
6. 選択した方式からmainを本番へ出せる状態にする
7. AccessとDNSをTerraform管理に寄せる
8. Claude Code hooksを入れる
9. main保護とCODEOWNERSを入れる
```

最初からD1やAccessを全部作り直すと危ない。今動いている本番に合わせて、少しずつGitHubとTerraformに寄せる。

---

## 16. 最小開始構成

最初から完璧にしようとすると重い。まずはこの構成で始める。

```txt
必須:
- pnpm workspace
- Oxc系のlint/format設定
- secretlint
- Lefthookによるpre-commit hook
- GitHub ActionsのQuality CI
- Dependabot
- Dependency Review
- CodeQL
- GitHub Secret scanning
- apps/* のHonoアプリ構成
- packages/cloudflare-access
- wrangler.jsonc
- `deployment.mode`による排他的なProduction Deploy
- Workers BuildsのGit接続、またはCloudflareのデプロイ専用account-owned token
- main保護
- Rulesetsで必須checkを指定
- Claude Code hooks
- Accessで守ったcustom domain
- workers_dev false

早めに入れる:
- ops/terraformでAccessとDNS管理
- アプリ登録yaml
- CODEOWNERS
- GitHub Actions権限の最小化
- binding命名ルール

後でよい:
- 共通UIの充実
- アプリ作成CLI
- Deploy to Cloudflareボタンの整備
- 本番D1 migrationの承認フロー自動化
```

この順番なら、すぐ始められる。かつ、あとから基盤を強くしやすい。

---

## 17. 推奨する最終形

最終的には、次の形を目指す。

```txt
各チーム
  → apps/* でアプリを作る
  → AIエージェントはローカル開発とPull Request作成まで
  → 本番デプロイ権限は持たない

GitHub
  → mainを保護
  → CODEOWNERSで基盤変更をレビュー
  → Quality、Dependency Review、CodeQLを必須checkにする
  → DependabotとSecret scanningを有効化する
  → checksが通ったものだけmerge

Production Deploy
  → Workers BuildsまたはGitHub Actionsをconfigで選択
  → mainからWorkerへ自動デプロイ
  → 選択されていない経路はデプロイをスキップ
  → GitHub Actionsの場合だけアカウント所有トークンをEnvironmentに保管

Cloudflare Access
  → custom domainを保護
  → チームや部署ごとに許可
  → workers.devは原則閉じる

Terraform
  → Access、DNS、再利用可能なEMAIL Listを決定的に生成
  → 通常はconfigだけを編集し、Terraformコードは触らない
```

この形だと、AIエージェントを使って各チームが開発しても、本番の入口と権限は中央でそろう。

---

## 18. 判断

今回の前提では、**モノレポ + pnpm + Hono + 選択可能なCI/CD + Cloudflare Access + Terraform** がよい。

ただし、Terraformコードは通常の編集対象にしない。利用者とAIエージェントは検証済みのconfigと安全なラッパーコマンドを使う。

表にするとこう。

| 項目 | 方針 |
| --- | --- |
| アプリ実装 | Hono |
| リポジトリ | pnpm workspace のモノレポ |
| UI | Hono JSX、必要に応じて軽いクライアントJS |
| デプロイ | Cloudflare Workers BuildsまたはGitHub Actions + Wrangler |
| 新規作成導線 | Deploy to Cloudflare |
| 認証入口 | Cloudflare Access |
| Access/DNS管理 | Terraform |
| 本番反映 | GitHub main経由 |
| 品質チェック | Oxlint + Oxfmt + TypeScript |
| 秘密情報チェック | secretlint + GitHub Secret scanning |
| Git hooks | Lefthook |
| 依存関係チェック | Dependabot + Dependency Review |
| コードセキュリティ | CodeQL |
| AIエージェント | PR作成、設定検証、明示承認後のinfra反映 |
| 危険操作の防止 | 権限設計 + Claude Code hooks |

大事なのは、「作るところは簡単にする」「守るところは中央でそろえる」という分け方。

これで、非エンジニアやAIエージェントが関わっても、設定ずれを減らしながらアプリを増やせる。

---

## 19. 参考にした公式情報

- Hono: Web標準に基づく軽量フレームワーク。Cloudflare Workersでも使える。  
  https://hono.dev/

- Hono: Cloudflare Workersでの使い方。  
  https://hono.dev/docs/getting-started/cloudflare-workers

- Hono JSX / hono/jsx/dom。  
  https://hono.dev/docs/guides/jsx  
  https://hono.dev/docs/guides/jsx-dom

- Cloudflare WorkersをGitHub Actionsからデプロイする。
  https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/

- Cloudflare Workers BuildsでGitリポジトリからデプロイする。
  https://developers.cloudflare.com/workers/ci-cd/builds/

- Cloudflare Workers: bindings。  
  https://developers.cloudflare.com/workers/runtime-apis/bindings/

- Cloudflare Wrangler設定。  
  https://developers.cloudflare.com/workers/wrangler/configuration/

- Deploy to Cloudflare buttons。  
  https://developers.cloudflare.com/workers/platform/deploy-buttons/

- Cloudflare Zero Trust: APIとTerraform。  
  https://developers.cloudflare.com/cloudflare-one/api-terraform/

- Cloudflare AccessをTerraformで公開・保護する例。  
  https://developers.cloudflare.com/learning-paths/clientless-access/terraform/publish-apps-with-terraform/

- pnpm workspaces。  
  https://pnpm.io/workspaces

- pnpm catalogs。  
  https://pnpm.io/catalogs


- Oxlint: 設定ファイルとCLI。  
  https://oxc.rs/docs/guide/usage/linter/config  
  https://oxc.rs/docs/guide/usage/linter/cli

- Oxfmt: 設定ファイルとCLI。  
  https://oxc.rs/docs/guide/usage/formatter/config.html  
  https://oxc.rs/docs/guide/usage/formatter/cli.html

- secretlint。  
  https://github.com/secretlint/secretlint  
  https://github.com/secretlint/secretlint/blob/master/docs/configuration.md

- Lefthook。  
  https://lefthook.dev/

- GitHub Dependabot設定。  
  https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference

- GitHub Dependency Review。  
  https://docs.github.com/en/code-security/concepts/supply-chain-security/dependency-review

- GitHub Secret scanning。  
  https://docs.github.com/en/code-security/concepts/secret-security/secret-scanning

- GitHub CodeQL code scanning。  
  https://docs.github.com/en/code-security/code-scanning/introduction-to-code-scanning/about-code-scanning-with-codeql

- GitHub ActionsのGITHUB_TOKEN権限。  
  https://docs.github.com/en/actions/tutorials/authenticate-with-github_token
