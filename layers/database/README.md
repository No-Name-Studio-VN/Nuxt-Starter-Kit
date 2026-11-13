# Database

Adds a Cloudflare D1 (SQLite) database through NuxtHub (`hub.db: 'sqlite'`) and Drizzle ORM.

- Server utils: `useDB()` and `tables` (`server/utils/db.ts`), plus the `IDatabaseService` base class
  (`types/db/database-service.ts`).
- No tables of its own: each module that needs tables declares them in its layer's
  `server/db/schema.sqlite.ts`, and NuxtHub merges them into `hub:db` and `hub:db:schema`.

Bindings: the `DB` D1 database in `wrangler.jsonc`. No env keys to fill.

Follow-up commands:

- `pnpm db:generate` after selecting modules or changing a schema, to generate your migrations.
- `pnpm deploy:db` to apply them to the remote D1 database after `pnpm deploy`.

Running `pnpm deploy` then `pnpm deploy:db` applies migrations after the new code is live.
For a schema-changing release, either apply migrations first or keep the changes
backwards-compatible.
