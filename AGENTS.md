# AIエージェント作業規則

## 1. 適用範囲と正本

- このファイルを、CodexやClaude Codeなどが参照するプロジェクトルールの正本とする。
- 作業開始時に`README.md`と変更対象に近いコードを確認する。
- このリポジトリ内で指示が競合する場合は、利用者の明示指示、`AGENTS.md`、対象Skill、
  `README.md`の順に優先する。
- このリポジトリは共同作業の仕組みを示すスターターである。現在のランチ投票機能はサンプルであり、
  利用者の目的に応じて置き換えてよい。

## 2. アーキテクチャ

単一のCloudflare Workerを、Hono、React Router、Vite、Tailwind CSS、D1で構成する。

| パス                                | 責務                                                       |
| ----------------------------------- | ---------------------------------------------------------- |
| `app`                               | React Routerの画面、SSRの開始処理、Tailwind CSS            |
| `src/hono-app.ts`                   | Honoの最上位ルーター、共通middleware、React Routerへの転送 |
| `src/routes`                        | HonoのAPIと稼働確認用ルート                                |
| `src/services`                      | D1を利用するサーバー処理                                   |
| `migrations`                        | D1 schema migration                                        |
| `wrangler.jsonc`                    | Worker、binding、環境変数の設定                            |
| `config/cloudflare/production.json` | Custom DomainとCloudflare Accessの希望状態                 |
| `config/access/production.csv`      | Accessを有効にする場合の許可メールアドレス                 |
| `scripts`                           | 設定検査とWorkers Builds用デプロイ処理                     |
| `.agents/skills`                    | AIエージェント共通のプロジェクトSkill                      |
| `.claude/skills`                    | `.agents/skills`を参照するClaude Code用symbolic link       |

次は生成物である。直接編集しない。

- `.react-router`
- `build`
- `.wrangler`
- `worker-configuration.d.ts`

## 3. 変更先の選択

| 依頼内容                          | 主な変更先                                        | 追加作業                        |
| --------------------------------- | ------------------------------------------------- | ------------------------------- |
| 画面、文言、操作、見た目          | `app/routes`、`app/root.tsx`、`app/app.css`       | 画面とSSRの動作を確認する       |
| API、middleware、サーバー処理     | `src/routes`、`src/services`、`src/hono-app.ts`   | API testを追加または更新する    |
| 保存データの構造                  | `migrations`                                      | 新しいmigrationを追加する       |
| Worker、D1、外部サービスとの接続  | `wrangler.jsonc`                                  | `npm run typegen`を実行する     |
| Custom DomainとAccessの希望状態   | `config/cloudflare/production.json`               | `npm run infra:check`を実行する |
| Accessを許可するメールアドレス    | `config/access/production.csv`                    | 下記のMCP手順に従う             |
| AIエージェントの共通ルール        | `AGENTS.md`                                       | `CLAUDE.md`へ規則を複製しない   |
| CodexとClaude Codeが参照するSkill | `.agents/skills`と`.claude/skills`のsymbolic link | 両方から参照できるか確認する    |

`config/access/production.csv`がない場合は、
`config/access/production.example.csv`から作成する。許可対象を推測して追加しない。

### Skillの選択

- React Routerのroute、route module、loader、action、Form、SSR、SPA、middlewareを変更する前に、
  `.agents/skills/react-router/SKILL.md`を読む。現在の構成はFramework Modeとして扱い、
  インストール済み`react-router` packageのdocsを正本とする。
- 画面の新規設計、再設計、UI監査、視覚調整、アクセシビリティ改善を行う前に、
  `.agents/skills/impeccable/SKILL.md`を読む。
- Impeccableのhooks、pin、live機能は、利用者が明示的に依頼した場合だけ有効化または実行する。
- Skillの手順とこのファイルが競合する場合は、このファイルを優先する。

## 4. 標準作業フロー

1. 利用者の依頼、`README.md`、変更対象、関連testを確認する。
2. コードや設定から判断できる内容は質問せず、必要な変更を進める。
3. 本番影響や完了条件が曖昧で、結果を大きく左右する場合だけ確認する。
4. 実装とtestを同じ作業で更新する。
5. 変更内容に応じて次の検査を実行する。
6. 完了報告の形式に従って結果を返す。

### 必須検査

| 変更内容                   | 必須コマンド                                            |
| -------------------------- | ------------------------------------------------------- |
| コード、test、依存関係     | `npm run check`                                         |
| `wrangler.jsonc`           | `npm run typegen`、`npm run check`                      |
| Cloudflare希望状態         | `npm run infra:check`                                   |
| 本番用bundleに影響する変更 | `npm run build`                                         |
| デプロイ前                 | `npm run check`、`npm run infra:check`、`npm run build` |

検査を実行できない場合は、未実行のコマンド、理由、残るリスクを報告する。

## 5. 本番操作と安全境界

### `main`へのpush

- `main`への直接pushを許可する。
- `main`の更新はWorkers Buildsによる本番デプロイを開始する。
- AIエージェントがpushする場合は、実行前に本番デプロイが始まることを利用者へ伝える。
- ローカル環境から本番Workerを直接デプロイしない。

### D1

- 通常のschema変更は、新しいmigrationとして追加する。
- テーブルや列の削除、保存データの消去を伴う操作は、通常変更と分離する。
- destructive migrationは、影響範囲と復旧方法を説明し、明示的な承認後に実行する。

### 秘密情報と外部サービス

- `.env`、`.env.*`、`.dev.vars`、`.dev.vars.*`、API tokenなどの秘密値を、会話、ログ、
  Issue、commitへ記載しない。
- 秘密値を出力するコマンドを避ける。確認が必要な場合も値そのものを読み上げない。
- Cloudflare API MCPには、承認済みの変更に必要な設定値だけを渡す。
- Cloudflare以外の外部MCPへ、秘密値、個人情報、本番データを送らない。

## 6. 検索公開の既定値

### 不変条件

- `wrangler.jsonc`の`ALLOW_INDEXING`は、利用者が検索公開を明示するまで`false`を維持する。
- `false`では、Honoが全応答へ`X-Robots-Tag`を付け、`robots.txt`でクローラーを拒否する。
- この設定を認証やアクセス制限として扱わない。
- 非公開情報を扱う場合はCloudflare Accessが必要だと案内する。

### 検索公開を許可する場合

1. 利用者が検索登録を許可したことを確認する。
2. `wrangler.jsonc`の`ALLOW_INDEXING`を`true`へ変更する。
3. `npm run typegen`を実行する。
4. `npm run check`を実行する。
5. 検索公開が有効になることを完了報告へ記載する。

## 7. Cloudflare Access管理

### 正本

- Custom DomainとAccessの希望状態: `config/cloudflare/production.json`
- Accessの許可対象: `config/access/production.csv`
- 初期状態: Custom Domainなし、Accessなし

### 使用可能な経路

- リモート設定の確認と反映にはCloudflare MCPだけを使う。
- Terraform、Cloudflare REST API、Wranglerへ切り替えない。
- Cloudflare MCPはAccess変更に必要なフルアクセスで接続する。
- フルアクセスであっても、現在の依頼とGit上の希望状態に含まれないリソースは変更しない。
- MCPを利用できない場合は停止し、利用者へ接続確認を依頼する。

### 変更手順

1. MCPのGETで対象account、hostname、Access Application、Policyの現在値を取得する。
2. Git上の希望状態と比較する。
3. 対象、変更前、変更後、影響を含む差分を利用者へ提示する。
4. 追加または更新は、差分の承認後に実行する。
5. 削除、設定の切り離し、Accessの無効化は、追加・更新とは分けて承認を受ける。
6. MCPのGETで反映結果を再取得する。
7. Cloudflare Audit Logsで変更対象と実行結果を確認する。
8. Git上の希望状態、Cloudflareの現在値、Audit Logsが一致するか報告する。

## 8. 条件付き機能: hono-door

次の要件が出た場合だけ、`.agents/skills/hono-door/SKILL.md`を読む。

- 期限付きURL
- 利用回数制限
- token付き外部共有
- QR code
- URLの再発行

導入手順は次のとおりとする。

1. `hono-door`を選択肢として利用者へ案内する。
2. ブラウザー上の発行・管理画面も必要な場合だけ`hono-door-ui`を案内する。
3. 公開用routeをCloudflare Accessの外、管理用routeをAccessの内側に置けるか確認する。
4. 利用者が導入を選択するまで、依存関係、Durable Objects binding、秘密値を追加しない。
5. Skill内のBunまたはpnpmコマンドは、このプロジェクトではnpmへ読み替える。

## 9. 完了報告

作業完了時は、次の順で簡潔に報告する。

1. 変更した内容
2. 利用者が確認する方法
3. 実行した検査と結果
4. 本番、D1、Cloudflare設定への影響
5. 未解決事項または未実行作業
