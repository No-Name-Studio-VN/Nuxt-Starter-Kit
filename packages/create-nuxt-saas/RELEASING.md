# Releasing create-nuxt-saas

## 3.0.0: clean break

3.0.0 copies selected Nuxt layers instead of editing module fragments in shared files. Module
metadata lives in each layer's `module.json`; dependency versions and configuration values stay in
the kit's root files. The CLI renders two revisions and uses one three-way text merge for
add/remove/upgrade, including `package.json`.

Project state is now `.nuxt-saas.json` (`version: 3`), with a full kit commit SHA and tracked
conflicts, not per-file hashes. Conflicts advance state to the target and exit 1. `--yes` without
`--modules` generates base only. `status`, `diff`, `--registry` and `--base-kit` are removed;
`upgrade --check` previews transitions. Local kits use `--allow-dirty-kit`, but still render a
committed tree. Generated projects do not include kit migrations; users run `pnpm db:generate`.

There is **no migration of 2.x projects**. When only the old `.nuxt-saas/manifest.json` exists, project
commands stop with this exact message:

> This project was created by create-nuxt-saas 2.x, which this version cannot manage. Generate a new project with `npm create nuxt-saas@latest` and move your code across.

Keep this release on major version 3; do not publish it as a 2.x update. The CLI and kit version
numbers are separate: `cli-v3.0.0` releases the CLI, while plain `v*` tags use the kit release workflow.

## Cutting a release

The CLI package already declares `3.0.0`. After the change is reviewed and merged to `main`, verify
that version and tag the release commit:

```bash
pnpm --dir packages/create-nuxt-saas test
pnpm --dir packages/create-nuxt-saas run typecheck
pnpm --dir packages/create-nuxt-saas run build
node -p "require('./packages/create-nuxt-saas/package.json').version"
git tag cli-v3.0.0
git push origin cli-v3.0.0
```

For later releases, update `packages/create-nuxt-saas/package.json` and the workspace lockfile with
pnpm, commit both, then tag the matching version. Do not change the root kit version for a CLI-only
release. Never bypass commit hooks.

`.github/workflows/cli-release.yml` runs for `cli-v*` tags and manual dispatches. It:

1. Uses Node 26 and pnpm 12.14.0; ensures npm is at least 11.5.1 for trusted publishing.
2. Installs with `pnpm --filter create-nuxt-saas install --frozen-lockfile`.
3. Checks that the tag version equals the CLI package version (on tag runs).
4. Runs CLI tests, typecheck and build. Runtime dependencies are bundled into `dist/`.
5. Packs the package, installs the tarball outside the checkout and runs a base-only init from the
   checked-out kit, asserting `.nuxt-saas.json` exists.
6. On tag runs, clears stale npm auth lines, checks the registry and runs `npm publish`.
   Manual dispatch instead ends with `npm pack --dry-run`, without publishing.

The tarball contains `bin/`, `dist/` and the README, not the kit or a bundled module catalog.
The separate CLI matrix checks generated module combinations; confirm it is green before tagging.
A manual release-workflow run is the way to validate packaging and the smoke test without publishing.

## Trusted publishing setup

Publishing uses [npm trusted publishing][tp]. GitHub mints a short-lived OIDC identity for the workflow;
there is no `NPM_TOKEN` to maintain. The job has `id-token: write` and uses the `npm-publish` environment.

For an existing npm package, configure its **Settings → Trusted publisher** with:

| Field                | Value                             |
| -------------------- | --------------------------------- |
| Organization or user | `No-Name-Studio-VN`               |
| Repository           | `Nuxt-Starter-Kit`                |
| Workflow filename    | `cli-release.yml` (filename only) |
| Environment          | `npm-publish`                     |

The environment must match the workflow. In GitHub repository **Settings → Environments →
npm-publish**, configure required reviewers if a human should approve each publish. Merely naming
the environment does not enable an approval gate. Remove obsolete npm publish-token secrets once
trusted publishing is configured.

Only a brand-new package needs an initial authenticated publish before its trusted publisher can be
configured. This package already exists; do not repeat that bootstrap for 3.0.0.

Do not add `registry-url` to `actions/setup-node`. It writes an npm auth-token entry that can interfere
with OIDC authentication when no token is set. The default npm registry is already correct. See
[npm/documentation#1960][bug]. `publishConfig.access` supplies public access; the workflow does not
pass `--access` or `--provenance` (trusted publishing supplies provenance).

## Verifying a release

```bash
npm view create-nuxt-saas version dist-tags
```

Check that the package's provenance links to the expected workflow run, then smoke-test the published
version in a fresh directory. Users regenerate 2.x projects rather than running a 3.0.0 upgrade in them.

[tp]: https://docs.npmjs.com/trusted-publishers
[bug]: https://github.com/npm/documentation/issues/1960
