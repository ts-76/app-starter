# Hono Door Admin Requests

Read this file when writing or reviewing curl examples, CLI commands, API
request payloads, operator instructions, or live verification steps.

## Environment Variables

Use these names for examples:

```bash
export SHORT_LINK_ADMIN_BASE_URL=http://localhost:8787
export SHORT_LINK_ADMIN_TOKEN=local-admin-token
```

For deployed Workers, set `SHORT_LINK_ADMIN_BASE_URL` to the Worker origin, for
example:

```bash
export SHORT_LINK_ADMIN_BASE_URL=https://example.workers.dev
```

Do not hard-code real production admin tokens in docs, scripts, or examples.

## Curl Pattern

Admin JSON routes use bearer auth:

```bash
curl -sS "$SHORT_LINK_ADMIN_BASE_URL/admin/links" \
  -H "Authorization: Bearer $SHORT_LINK_ADMIN_TOKEN"
```

For JSON bodies, include `Content-Type: application/json`:

```bash
curl -sS -X POST "$SHORT_LINK_ADMIN_BASE_URL/admin/rooms/room-a" \
  -H "Authorization: Bearer $SHORT_LINK_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Summer Event","body":"Welcome"}'
```

## Issue Token

Issue a token for a link:

```bash
curl -sS -X POST "$SHORT_LINK_ADMIN_BASE_URL/admin/links/summer-event/tokens" \
  -H "Authorization: Bearer $SHORT_LINK_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ttl":"1h","roomId":"room-a","label":"staff","role":"viewer","maxUses":10}'
```

Payload notes:

- `ttl` defaults to `1h`; accepts duration strings such as `15m`, `1h`, `1d`,
  or a positive integer number of seconds.
- `roomId` changes the link's current room when present. Treat it as a stable
  application-owned key and allocate a fresh ID for each survey/event.
- `label` is an operator memo, not an auth field.
- `role` defaults to `viewer` and is exposed in `shortLink.role`.
- `maxUses` accepts a positive integer as a number or string; omit it for no
  use-count limit before expiry/revoke.

The response includes `url`, raw `token`, `tokenHash`, `expiresAt`, and `roomId`.
The raw token is not stored and cannot be recovered later.

## List And Status

List active links:

```bash
curl -sS "$SHORT_LINK_ADMIN_BASE_URL/admin/links" \
  -H "Authorization: Bearer $SHORT_LINK_ADMIN_TOKEN"
```

Read one link status:

```bash
curl -sS "$SHORT_LINK_ADMIN_BASE_URL/admin/links/summer-event" \
  -H "Authorization: Bearer $SHORT_LINK_ADMIN_TOKEN"
```

List active token metadata for a link:

```bash
curl -sS "$SHORT_LINK_ADMIN_BASE_URL/admin/links/summer-event/tokens" \
  -H "Authorization: Bearer $SHORT_LINK_ADMIN_TOKEN"
```

List and token metadata endpoints never return raw tokens and cannot reconstruct
old public URLs or QR codes.

## Issue Policy And Reissue

Read the current issue policy:

```bash
curl -sS "$SHORT_LINK_ADMIN_BASE_URL/admin/links/summer-event/issue-policy" \
  -H "Authorization: Bearer $SHORT_LINK_ADMIN_TOKEN"
```

Update the issue policy:

```bash
curl -sS -X PUT "$SHORT_LINK_ADMIN_BASE_URL/admin/links/summer-event/issue-policy" \
  -H "Authorization: Bearer $SHORT_LINK_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ttl":"15m","label":"reissued","role":"viewer","maxUses":3}'
```

Use `null` for `label` or `maxUses` to clear them.

Reissue URL and QR-ready URL:

```bash
curl -sS -X POST "$SHORT_LINK_ADMIN_BASE_URL/admin/links/summer-event/reissue" \
  -H "Authorization: Bearer $SHORT_LINK_ADMIN_TOKEN"
```

Reissue requires an existing link. It revokes currently active tokens, issues
one replacement token using the stored issue policy and current room, and
returns the new raw token only in that response.

## Archive Search

Search inactive archives:

```bash
curl -sS "$SHORT_LINK_ADMIN_BASE_URL/admin/links/archive?q=summer" \
  -H "Authorization: Bearer $SHORT_LINK_ADMIN_TOKEN"
```

Get archived link detail:

```bash
curl -sS "$SHORT_LINK_ADMIN_BASE_URL/admin/links/archive/summer-event" \
  -H "Authorization: Bearer $SHORT_LINK_ADMIN_TOKEN"
```

Archive search returns links with no active tokens, including expired, revoked,
and max-use reached links. Detail responses include room title/body snapshots
and token metadata, but not old raw tokens.
For custom systems, use `linkId` and `roomId` from archive detail to load
application-owned survey, response, or snapshot data from DO/D1 storage.

Manual archive before TTL:

```bash
curl -sS -X POST "$SHORT_LINK_ADMIN_BASE_URL/admin/links/summer-event/archive" \
  -H "Authorization: Bearer $SHORT_LINK_ADMIN_TOKEN"
```

Manual archive revokes active tokens without issuing a replacement and does not
change `roomId` or existing token hashes.

## Switch Room And Revoke

Switch a stable public link to another room:

```bash
curl -sS -X POST "$SHORT_LINK_ADMIN_BASE_URL/admin/links/summer-event/switch-room" \
  -H "Authorization: Bearer $SHORT_LINK_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"roomId":"room-b"}'
```

Revoke one token by hash:

```bash
curl -sS -X POST "$SHORT_LINK_ADMIN_BASE_URL/admin/links/summer-event/revoke" \
  -H "Authorization: Bearer $SHORT_LINK_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tokenHash":"<sha-256-hash-from-issue-response>"}'
```

## Sample Repo CLI

This repository's sample CLI wraps only part of the admin API. Do not describe
these commands as package-provided CLI commands unless the target project has
copied or exposed the same scripts.

```bash
SHORT_LINK_ADMIN_BASE_URL=http://localhost:8787 \
SHORT_LINK_ADMIN_TOKEN=local-admin-token \
bun run token:issue --link summer-event --ttl 1h --room room-a --label staff --max-uses 10
```

```bash
SHORT_LINK_ADMIN_BASE_URL=http://localhost:8787 \
SHORT_LINK_ADMIN_TOKEN=local-admin-token \
bun run room:set --room room-a --title "Summer Event" --body "Welcome"
```

```bash
SHORT_LINK_ADMIN_BASE_URL=http://localhost:8787 \
SHORT_LINK_ADMIN_TOKEN=local-admin-token \
bun run link:switch --link summer-event --room room-b
```

Current CLI wrappers are `token:issue`, `room:set`, and `link:switch`.
Use curl for status, token listing, archive search, manual archive,
issue-policy, reissue, and revoke unless new CLI wrappers have been added.

## Verification Flow

For live verification, use a disposable link ID:

1. Set room content.
2. Issue a token.
3. Open the returned URL and confirm it redirects to the tokenless path.
4. List links and token metadata.
5. Update issue policy.
6. Reissue.
7. Confirm the old URL is rejected.
8. Confirm the new URL works.
9. Confirm list metadata matches the new active token.
