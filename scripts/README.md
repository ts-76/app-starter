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

After a trigger exists, push and let Cloudflare Builds deploy:

```sh
op run --env-file .env.1password -- pnpm bootstrap:builds -- --push
```

Trigger a manual Cloudflare build:

```sh
op run --env-file .env.1password -- pnpm bootstrap:builds -- --trigger-build
```

The script does not create GitHub personal access tokens, authorize the Cloudflare GitHub App, or create Cloudflare build tokens. It detects those missing prerequisites and stops with the next action.
