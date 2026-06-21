# Bootstrap Scripts

## Doctor

```sh
pnpm doctor
```

Checks local tools and authentication without printing secret values.

Recommended secret injection:

```sh
op run --env-file .env.1password -- pnpm doctor
```

Required for Builds API automation:

```txt
CLOUDFLARE_BUILDS_API_TOKEN
DOMAIN
```

`CLOUDFLARE_BUILDS_API_TOKEN` must be a user-scoped Cloudflare API token with Workers Builds Configuration edit access and Workers Scripts read access.

Optional:

```txt
CLOUDFLARE_BUILD_TOKEN_UUID
CLOUDFLARE_BUILD_TOKEN_NAME
CLOUDFLARE_ACCOUNT_ID
```

If exactly one Cloudflare build token exists, the bootstrap script auto-selects it via the Builds API. If multiple exist, set either `CLOUDFLARE_BUILD_TOKEN_UUID` or `CLOUDFLARE_BUILD_TOKEN_NAME` explicitly.

If Wrangler is logged in and returns exactly one Cloudflare account, `CLOUDFLARE_ACCOUNT_ID` is auto-detected from `wrangler whoami --json`. If multiple accounts are available, set `CLOUDFLARE_ACCOUNT_ID` or pass `--account-id`.

`DOMAIN` is used for the Worker custom domain. During initial bootstrap, the script runs `wrangler deploy --domain <DOMAIN>`. For Cloudflare Builds, it stores `DOMAIN` as a non-secret build environment variable and uses `pnpm exec wrangler deploy --domain $DOMAIN`.

## Bootstrap Cloudflare Builds

Dry run:

```sh
op run --env-file .env.1password -- pnpm bootstrap:builds -- --dry-run
```

Create or sync the Cloudflare Builds trigger:

```sh
op run --env-file .env.1password -- pnpm bootstrap:builds
```

If the Worker does not exist yet, a platform operator can explicitly allow the initial Wrangler deploy:

```sh
op run --env-file .env.1password -- pnpm bootstrap:builds -- --deploy
```

Preview the initial deploy path without creating resources:

```sh
op run --env-file .env.1password -- pnpm bootstrap:builds -- --dry-run --deploy --build-token-uuid <uuid>
```

With Wrangler 4.45 or newer, D1 and R2 resources can be provisioned automatically from binding-only `wrangler.jsonc` entries during the first deploy.

After a trigger exists, push and let Cloudflare Builds deploy:

```sh
op run --env-file .env.1password -- pnpm bootstrap:builds -- --push
```

Trigger a manual Cloudflare build:

```sh
op run --env-file .env.1password -- pnpm bootstrap:builds -- --trigger-build
```

List recent Cloudflare Builds for the Worker:

## Bootstrap Cloudflare Access

Create or update the Access application and inline allow policy for the protected domain:

```sh
op run --env-file .env.1password -- pnpm bootstrap:access -- --allowed-email you@example.com
```

`bootstrap:access` uses `CLOUDFLARE_BUILDS_API_TOKEN` as a temporary operator token. That token needs `Access: Apps and Policies Edit` in addition to the Builds permissions. At least one include rule is required: pass `--allowed-email`, `--allowed-domain`, or `--allow-everyone`.

The script leaves `same_site_cookie_attribute` unset by default. Setting it to `strict` can cause login redirect loops for self-hosted apps because the Access cookie may not be sent after returning from the Cloudflare Access login domain.

Preview without reading the token:

```sh
pnpm bootstrap:access -- --domain sales-report.tslab.app --allowed-email you@example.com --dry-run
```

```sh
op run --env-file .env.1password -- pnpm bootstrap:builds -- --list-builds --build-token-uuid <uuid>
```

Get logs for a specific build:

```sh
op run --env-file .env.1password -- pnpm bootstrap:builds -- --build-logs <build_uuid> --build-token-uuid <uuid>
```

The script does not create GitHub personal access tokens, authorize the Cloudflare GitHub App, or create Cloudflare build tokens. It detects those missing prerequisites and stops with the next action.
