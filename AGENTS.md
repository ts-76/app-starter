# AIエージェント向けプロジェクトガイド

このファイルを、CodexやClaude Codeなどが参照するプロジェクトルールの正本とします。
作業前に`README.md`と、変更箇所に近いコードを確認してください。

## ひとつのWorkerをHonoとReact Routerで構成する

このリポジトリは、Cloudflare Workersで動く単一のランチ候補・投票Webアプリです。Honoが
リクエストを受け、`/app`配下の画面をReact Routerでサーバー側描画します。データはD1へ
保存します。

| 場所                                | 役割                                                       |
| ----------------------------------- | ---------------------------------------------------------- |
| `app`                               | React Routerの画面、サーバー側描画の開始処理、Tailwind CSS |
| `src/hono-app.ts`                   | Honoの最上位ルーターとReact Routerへの振り分け             |
| `src/routes`                        | Honoで提供するAPIと稼働確認用の応答                        |
| `src/services`                      | ランチ候補と投票をD1へ保存する処理                         |
| `migrations`                        | D1の構造を変更するマイグレーション                         |
| `wrangler.jsonc`                    | Worker、D1との接続、実行環境の設定                         |
| `config/cloudflare/production.json` | カスタムドメインとCloudflare Accessの希望状態              |
| `config/access/production.csv`      | Cloudflare Accessを許可するメールアドレス                  |
| `scripts`                           | 設定検証とWorkers Buildsから実行するデプロイ処理           |
| `.agents/skills`                    | CodexとClaude Codeが共通で参照するプロジェクトスキル       |
| `.claude/skills`                    | `.agents/skills`を参照するClaude Code用シンボリックリンク  |

`.react-router`、`build`、`.wrangler`、`worker-configuration.d.ts`は生成物です。直接編集せず、
設定やコードを変更した後に対応する生成コマンドを実行してください。

## 通常のアプリ変更はapp・src・migrationsで行う

- 画面や操作を変える: `app/routes`と`app/root.tsx`
- APIやサーバー処理を変える: `src/routes`と`src/services`
- データベースの構造を変える: `migrations`へ新しいマイグレーションを追加する
- Workerと外部サービスの接続を変える: `wrangler.jsonc`を変更し、`npm run typegen`を実行する
- カスタムドメインやAccessの希望状態を変える: `config/cloudflare`と`config/access`を編集する

コード・依存関係・Wrangler設定を変更したら`npm run check`を実行します。Cloudflare設定も
変更した場合は、Cloudflareへ接続しない`npm run infra:check`も実行してください。

## 本番への影響と秘密情報は作業前に伝える

`main`への直接pushは許可します。ただし、`main`の更新はWorkers Buildsによる本番デプロイを
開始するため、AIエージェントがpushする場合は、実行前にその影響を利用者へ伝えてください。
テーブルや列の削除、保存データの消去を含むD1マイグレーションは、通常のコード変更と分けて
影響と復旧方法を説明し、明示的な承認を受けてから反映します。

`.env`、`.env.*`、`.dev.vars`、`.dev.vars.*`、APIトークンなどの秘密値は読み上げず、会話、ログ、
Issue、commitへ記載しません。Cloudflare API MCPには、承認された変更に必要な設定値だけを渡します。
それ以外の外部MCPへ秘密値、個人情報、本番データを送らないでください。
依頼を受けたら「変えたいこと」「利用者」「本番反映の要否」「完了の判断基準」を確認します。
コードや設定から判断できる項目は利用者へ聞き直さず、本番への影響が曖昧な場合だけ確認してください。
作業完了時は、変更内容、確認方法、本番・D1・Cloudflareへの影響、未解決事項を報告します。

## Accessの確認と反映にはCloudflare MCPだけを使う

カスタムドメインとCloudflare Accessの希望状態は`config/cloudflare/production.json`、許可対象は
`config/access/production.csv`を正本とします。リモート設定の確認と反映にはCloudflare MCPを
使い、Terraform、CloudflareのREST API、Wranglerへ切り替えません。

Cloudflare MCPはAccessの変更に必要なフルアクセスで接続します。ただし、現在の依頼とGit上の
希望状態に含まれないCloudflareリソースは変更しません。MCPを利用できない場合は作業を停止し、
REST APIやWranglerなどへ切り替えず、利用者へ接続の確認を依頼してください。

反映を依頼されたら、最初にMCPのGETで対象account、hostname、Application、Policyを確認し、
Git上の希望状態との差分を提示します。
追加・更新は利用者がその差分を承認した後に実行し、完了後にもう一度GETで確認します。削除、
設定の切り離し、Accessの無効化は影響を説明し、追加・更新とは分けて承認を受けてください。
反映後はCloudflare Audit Logsでも変更対象と実行結果を確認します。

## 期限付きURLが必要ならhono-doorを案内する

標準構成には短期リンク機能を含めません。期限付きURL、利用回数制限、トークン付き外部共有、
QRコード、URLの再発行が必要になった場合は、実装前に
`.agents/skills/hono-door/SKILL.md`を読み、`hono-door`を選択肢として案内してください。

基本は`hono-door`だけを提案します。ブラウザーからURLやQRコードを発行・管理したい場合だけ、
任意の`hono-door-ui`も案内します。公開用の経路をCloudflare Accessの外、管理用の経路を
Accessの内側に置けるか確認し、利用者が導入を選択するまでは依存関係、Durable Objectsの接続、秘密値を
追加しません。このプロジェクトではnpmを使い、スキル内のBunやpnpmコマンドはnpmへ読み替えます。
