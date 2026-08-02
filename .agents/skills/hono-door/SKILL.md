---
name: hono-door
description: User manual for adding and operating `hono-door` short-lived public links in a Hono Cloudflare Worker. Use when integrating `hono-door` or `hono-door-ui`, configuring Wrangler Durable Object bindings, issuing or reissuing public URLs and QR codes, using the admin API, or deciding whether to install the optional browser admin UI.
---

# Hono Door

Use this skill as a user-facing manual for adding `hono-door` to a Hono
Cloudflare Worker and operating short-lived public links.

## Choose A Package

- Install `hono-door` when you only need middleware, public routes, Durable
  Objects, and bearer-protected admin APIs.
- Install `hono-door-ui` in addition to `hono-door` when you want the default
  browser admin UI for issuing URLs, showing QR codes, listing active links, and
  searching inactive archives, and reissuing links.
- Keep `hono-door-ui` optional. Core-only users should not need QR or browser UI
  dependencies.

```bash
bun add hono-door
```

```bash
bun add hono-door hono-door-ui
```

Read [references/ui.md](references/ui.md) when the user wants the browser admin
UI. Read [references/admin-requests.md](references/admin-requests.md) when the
task involves curl examples, CLI commands, request payloads, or live
verification steps.

## Minimal Worker

Use this as the minimal Worker with public links and admin API:

```ts
import { Hono } from 'hono'
import { createDoor, PublicLink, Registry, Room } from 'hono-door'

export { PublicLink, Registry, Room }

const app = new Hono()
const door = createDoor()

app.route('/l', door.public())
app.route('/admin', door.adminApi())

export default app
```

Add the browser UI only when needed:

```ts
import { createDoorUi } from 'hono-door-ui'

app.route('/admin', createDoorUi(door))
```

## Wrangler Setup

`createDoor()` uses these binding names by default:

- `PUBLIC_LINKS`: Durable Object namespace for `PublicLink`
- `ROOMS`: Durable Object namespace for `Room`
- `REGISTRY`: Durable Object namespace for server-side list candidates
- `ADMIN_API_TOKEN`: admin bearer secret
- `PUBLIC_BASE_URL`: base URL used when issuing public links

Configure Durable Objects like this:

```jsonc
{
  "durable_objects": {
    "bindings": [
      { "name": "PUBLIC_LINKS", "class_name": "PublicLink" },
      { "name": "ROOMS", "class_name": "Room" },
      { "name": "REGISTRY", "class_name": "Registry" }
    ]
  },
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["PublicLink", "Room"] },
    { "tag": "v2", "new_sqlite_classes": ["Registry"] }
  ],
  "vars": {
    "PUBLIC_BASE_URL": "https://example.workers.dev"
  }
}
```

Set `ADMIN_API_TOKEN` as a secret in production:

```bash
bunx wrangler secret put ADMIN_API_TOKEN
```

For local development, use `.dev.vars`:

```bash
printf 'ADMIN_API_TOKEN=local-admin-token\n' > .dev.vars
```

## Custom Binding Names

If the host app uses different binding names, pass resolvers:

```ts
import { Hono } from 'hono'
import {
  PublicLink,
  Registry,
  Room,
  createDoor,
  type ShortLinkVariables,
} from 'hono-door'

type AppEnv = {
  Bindings: {
    MY_PUBLIC_LINKS: DurableObjectNamespace<PublicLink>
    MY_ROOMS: DurableObjectNamespace<Room>
    MY_REGISTRY: DurableObjectNamespace<Registry>
    SHORT_LINK_ADMIN_TOKEN?: string
    SHORT_LINK_PUBLIC_BASE_URL?: string
  }
  Variables: ShortLinkVariables
}

const app = new Hono<AppEnv>()
const door = createDoor<AppEnv>({
  publicLinks: (c) => c.env.MY_PUBLIC_LINKS,
  rooms: (c) => c.env.MY_ROOMS,
  registry: (c) => c.env.MY_REGISTRY,
  adminToken: (c) => c.env.SHORT_LINK_ADMIN_TOKEN,
  publicBaseUrl: (c) => c.env.SHORT_LINK_PUBLIC_BASE_URL,
})
```

## Operating Model

- Admin API routes require `Authorization: Bearer <ADMIN_API_TOKEN>`.
- Issuing a link returns a public URL containing the raw token.
- The optional admin UI issues links for a `roomId`; it does not edit room
  content. Use the admin API, CLI, or application-specific UI to set room data.
- Treat `roomId` as a stable application-owned key. The same `roomId` maps to
  the same `Room` Durable Object and one Registry room row. Repeated writes
  update that room, so allocate a fresh `roomId` for each survey/event instead
  of reusing one.
- `door.public()` has only a minimal fallback page. Production integrations
  should pass a custom renderer for application content.
- Raw public tokens are returned only by issue/reissue responses.
- Durable Object storage keeps token hashes, not raw tokens.
- Browser access with `?token=` validates the token, sets an HTTP-only
  path-scoped cookie, and redirects to the same URL without the token query.
- Cookie and bearer access consume uses.
- `maxUses` limits consumed accesses; omit it for no use-count limit before
  expiry or revoke.
- Reissue requires an existing link, revokes active tokens, and returns one new
  raw token and URL.
- List endpoints return metadata and token hashes only; they cannot reconstruct
  old URLs or QR codes.
- Inactive archives include expired, revoked, and max-use reached links with no
  active token. Archive search matches link ID, room ID, token label, room
  title, and room body.
- Manual archive, revoke, and expiry do not change `roomId` or `tokenHash`.
  Reissue creates a new token and therefore a new `tokenHash`, while using the
  link's current `roomId`.
- Expired token rows are retained for future archive detail, but rows deleted by
  older cleanup behavior cannot be recovered.

## Common User Flows

For admin requests, load [references/admin-requests.md](references/admin-requests.md).

Typical setup and operation:

1. Configure Wrangler Durable Object bindings and `PUBLIC_BASE_URL`.
2. Set `ADMIN_API_TOKEN`.
3. Mount `door.public()` and `door.adminApi()`.
4. Optionally mount `createDoorUi(door)`.
5. Set room content.
6. Issue a public URL.
7. Share the returned URL or QR at issue time.
8. List active links, token metadata, or inactive archives when needed.
9. Reissue to revoke old active tokens and produce a replacement URL/QR.

## Production Notes

- Put admin routes behind Cloudflare Access or an equivalent network boundary
  for sensitive workflows.
- Do not log or persist raw public tokens.
- Do not hard-code real admin tokens in docs or scripts.
- Ensure `PUBLIC_BASE_URL` matches the actual deployed origin or custom domain.
- Use short TTLs and reissue rather than keeping long-lived public tokens active.
