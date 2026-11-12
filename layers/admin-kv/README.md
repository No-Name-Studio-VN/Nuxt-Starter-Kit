# Admin KV browser

A browser for the `KV` namespace, built on the admin shell.

- The `/admin/kv` page: a table of every key with lazily loaded value previews, a JSON-aware value
  editor (CodeMirror), and create, edit, delete and clear-all controls. Keys with a known temporary
  prefix (such as WebAuthn challenges) are flagged before editing.
- The admin APIs under `/api/admin/kv` (list keys, load values, create, update, delete, clear the KV
  namespace and the server cache); the admin server middleware limits them to admins.
- Its card on the `/admin` landing page.
- Route constants in `shared/adminKvRoutes.ts` and request schemas in `shared/schemas/adminKvSchema.ts`.

No env keys to fill. The `KV` binding comes from server-core; configure it in `wrangler.jsonc` before
using the browser.
