# 運用スクリプト

## Workers Buildsだけが本番へデプロイする

`npm run deploy`と`npm run deploy:builds`は同じ安全なデプロイスクリプトを実行します。次の条件を
すべて満たさない限り、本番デプロイは始まりません。

- `WORKERS_CI=1`
- production branchが`main`
- Workers BuildsのBuild UUIDが存在する

Workers BuildsにはBuild commandを`npm run check`、Deploy commandを`npm run deploy:builds`として
設定します。デプロイ処理はVite production build、D1 migration、Worker更新の順に実行し、
最後にdeployment statusを確認します。ローカルではdry-runだけを実行できます。

```sh
npm run deploy -- --dry-run
```

## 設定を確認する

```sh
npm run infra:check
npm run doctor
```

`infra:check`は資格情報を使わず、Custom DomainとAccessの設定を検証します。両方とも未設定なら、
MCP管理対象のないデフォルト構成として正常終了します。設定されている場合は、安全なMCP反映順序も
表示します。このコマンドはCloudflareへ接続しません。

`doctor`は外部サービスへ接続せず、次のローカル状態を確認します。

- Node.jsがこのプロジェクトの対応versionであること
- npmがversion 11以上であること
- projectにWrangler packageがインストールされていること
- `config/cloudflare/production.json`とAccess用CSVが正しいこと
- Git repository内で実行していること
- `.mcp.json`と`.codex/config.toml`のMCP server名・URLが一致していること
- 任意のGitHub CLIを実行できること

GitHub認証、Wrangler認証、Cloudflare account、Workers Builds、MCPの接続状態もローカルのdoctorでは
確認しません。Cloudflareの現在値は、反映を依頼された会話でMCPのGETにより確認します。

## 任意インフラはCloudflare MCPで反映する

Custom DomainまたはAccessのリモート確認・反映は、利用者が現在の会話で依頼した場合だけ行います。
ローカルのplan/applyコマンドやCloudflare API tokenは使いません。

CodexはCloudflare MCPのGETで現状を取得し、Git上の設定との差分をplanとして提示します。
createまたはupdateはplanの明示承認後だけ実行し、削除・detach・Access無効化は別途承認を必要と
します。反映後はGETで再確認します。詳しい作業規則は`AGENTS.md`を参照してください。
