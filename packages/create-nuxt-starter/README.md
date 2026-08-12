# Create Nuxt Starter Kit

Create a Nuxt starter project from the bundled registry.

```bash
npx @no-name-studio/create-nuxt-starter@latest my-app
```

V1 offers two audited profiles:

- `minimal` creates a small Nuxt application.
- `full-starter` downloads the full starter from its pinned source revision and replaces upstream deployment and branding defaults with neutral placeholders.

The registry engine supports feature dependencies and conflicts, but the current full starter is still an integrated application. Individual auth, content, PWA, and observability items will only be exposed after they can be generated independently.

## Safe upgrades

```bash
npx @no-name-studio/create-nuxt-starter@latest upgrade --check
npx @no-name-studio/create-nuxt-starter@latest diff full-starter --file app/app.vue
npx @no-name-studio/create-nuxt-starter@latest upgrade --apply
```

V1 upgrades are add-only. Existing files, deleted generated files, package/configuration files, environment files, schemas, and database migrations are always skipped. The command never overwrites, merges, deletes, installs dependencies, or changes configuration during an upgrade.
