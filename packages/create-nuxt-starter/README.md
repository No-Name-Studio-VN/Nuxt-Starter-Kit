# create-nuxt-starter

Create and upgrade modular Nuxt Starter Kit projects.

```bash
npx @no-name-studio/create-nuxt-starter@latest init my-app
```

## Commands

- `init [--dir <path>] [--modules a,b] [--yes]` — generate a project from selected modules.
  Dependencies are pulled in automatically, so `--modules admin-users` also installs what it needs.
- `modules` — list the modules in the registry.

Useful flags for both: `--registry <path>` to use an alternative registry, and (for `init`)
`--kit <path>` to render from a local kit checkout instead of downloading one.

Generated projects carry `.nuxt-starter/manifest.json`, recording the modules installed and the kit
revision they came from. Do not delete it — upgrades depend on it.

## Authoring markers

Shared kit files delimit module fragments with markers, in whatever comment syntax the file uses:

```ts
// <nsk:content>
content: {},
// </nsk:content>
```

```html
<!-- <nsk:pwa> -->
<meta name="theme-color" content="#000000" />
<!-- </nsk:pwa> -->
```

Every block needs a matching close, blocks cannot nest, and each block belongs to exactly one
module. Generating a project deletes the blocks of modules that were not selected and keeps the
rest untouched, markers included.

## Development

```bash
npm install
npm test          # vitest
npm run typecheck # tsc --noEmit, strict
npm run build     # unbuild -> dist/
```

Tests render a miniature fixture kit in `test/fixtures/`, so they never download the real kit.

## Roadmap

`upgrade` (three-way merge of upstream changes into projects, including files you have edited) and
`add` / `remove` are specified in `docs/superpowers/specs/2026-08-12-modular-cli-design.md` and land
in the next plans. The registry currently ships a single `full-starter` module; splitting the kit
into `base`, `pwa`, `content`, `database`, `auth`, and `admin-users` is Plan 3.
