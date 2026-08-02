# Hono Door UI Reference

Read this file when the user wants to add, configure, or operate the optional
`hono-door-ui` browser admin UI.

## Package Role

`hono-door-ui` provides the default browser admin UI. It is intentionally
separate from `hono-door` so core-only users do not pay for QR/UI dependencies.

Mount it under the same admin prefix as the core admin API:

```ts
import { createDoor } from 'hono-door'
import { createDoorUi } from 'hono-door-ui'

const door = createDoor()

app.route('/admin', door.adminApi())
app.route('/admin', createDoorUi(door))
```

This creates:

- `GET /admin/ui`: issue UI shell
- `POST /admin/ui`: non-JS fallback issue flow
- `GET /admin/ui/links`: active-link list shell
- `GET /admin/ui/client.js`: generated browser client bundle
- `/admin/ui/api/*`: UI-only JSON proxy routes

## Authentication

- UI shell routes return HTML even without a session.
- UI data/action routes under `/admin/ui/api/*` require a signed UI session.
- `POST /admin/ui/api/session` accepts the admin token once and creates the
  signed HttpOnly session cookie.
- The cookie is scoped to `/admin/ui`, uses `SameSite=Lax`, and is not readable
  by browser JavaScript.
- CLI and direct clients should keep using bearer-protected `/admin/*` JSON
  routes instead of UI proxy routes.

## Browser Client

The default UI is served from the Worker. Users do not need a separate frontend
hosting target.

Use these pages:

- `/admin/ui`: issue URLs and QR codes
- `/admin/ui/links`: list active links and open details
- `/admin/ui/archive`: search inactive archives and open admin-only previews

The UI proxy APIs are under `/admin/ui/api/*` and are intended for the browser
UI session, not CLI clients.

## User-Facing Behavior

- Keep the initial issue flow step-based; do not show every step at once.
- Keep the list page compact initially: show link ID, current room, active token
  count, and latest active expiry; reveal token detail and QR only after the
  operator opens details or reissues.
- Do not attempt to reconstruct old URLs or QR codes from list endpoints. Raw
  tokens are not stored.
- Treat `roomId` as the stable application-owned key. The UI passes it through
  and archive previews use `linkId` and `roomId`; custom survey data should live
  in the host app's DO/D1 storage keyed by `roomId`.
- Manual archive from the UI revokes active tokens before TTL without creating a
  replacement token, changing `roomId`, or changing existing token hashes.
- Reissue from the UI should:
  - disable the reissue button while the request is in flight,
  - display the new URL and QR returned by the reissue response,
  - refresh active token detail after reissue so revoked tokens are not shown as
    active,
  - refresh the active-link list without collapsing the current context.
- If a list refresh clears detail state, reload any still-open details so the UI
  does not stay stuck on a loading message.

## QR And Layout Rules

- QR SVG must render in a square box with `aspect-ratio: 1 / 1`.
- Prevent horizontal page scrolling on mobile.
- Use grid/flex gaps for spacing between sections, forms, status messages,
  details, and result blocks.
- Keep URL inputs `overflow-wrap`-safe through parent `min-width: 0` and input
  `width: 100%`.

## Security Notes

- Never store the admin token in localStorage, sessionStorage, or a
  JavaScript-readable cookie.
- Never expose raw public tokens from list or token metadata endpoints.
- Treat generated QR as shareable only at issue/reissue time.
- Keep `/admin/ui/client.js` cache disabled or deliberately versioned; current
  behavior uses `Cache-Control: no-store`.
