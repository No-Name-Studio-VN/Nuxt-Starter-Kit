# Releasing create-nuxt-saas

Publishing runs on [npm trusted publishing][tp]: GitHub mints a short-lived OIDC
token for `.github/workflows/cli-release.yml` and npm exchanges it for publish
rights. There is no `NPM_TOKEN` in this repository, and there should never be one.

npm is closing the alternative. From **early August 2026** granular access tokens
that bypass 2FA lose account, package and organization management; from
**January 2027** they cannot publish at all, only read private packages and stage
a publish for a human to approve. ([changelog][gat])

## Cutting a release

```bash
cd packages/create-nuxt-saas
npm version 1.0.1 --no-git-tag-version   # or 1.1.0 / 2.0.0
git commit -am "release: create-nuxt-saas 1.0.1"
git tag cli-v1.0.1
git push origin main --tags
```

The workflow refuses to publish unless the tag version and `package.json` agree,
so the tag, the committed version and the version on npm cannot drift apart.

`workflow_dispatch` runs the whole pipeline and stops at `npm pack --dry-run`,
which is the way to check a release without publishing one.

## One-time setup

Three things cannot be scripted from this repository. Each is done once.

### 1. Bootstrap the package on npm

npm will not let you configure a trusted publisher for a package that does not
exist yet — that is what stops someone claiming a name they do not own. So the
very first version has to come from a logged-in machine:

```bash
cd packages/create-nuxt-saas
npm login          # completes 2FA in the browser
npm run build
npm publish        # prompts for your 2FA code
```

Every release after this one goes through the workflow.

### 2. Register the trusted publisher

On npmjs.com → the package → **Settings** → **Trusted publisher**, or from the
CLI (npm 11.15.0+, requires 2FA):

```bash
npm trust github create-nuxt-saas \
  --file cli-release.yml \
  --repo No-Name-Studio-VN/Nuxt-Starter-Kit \
  --env npm-publish
```

| Field | Value |
| --- | --- |
| Organization or user | `No-Name-Studio-VN` |
| Repository | `Nuxt-Starter-Kit` |
| Workflow filename | `cli-release.yml` — the filename alone, not a path |
| Environment | `npm-publish` |

The environment must match the `environment:` key in the workflow. If you drop
one, drop both, or the OIDC claim will not match and the publish will be refused.

Once this is in place, delete any npm token that still exists for this package —
including the `NPM_TOKEN` repository secret, which the workflow no longer reads.

### 3. Add the human approval step

The workflow already runs in a `npm-publish` environment, which GitHub creates on
its first run. To make a person approve each publish:

**Settings** → **Environments** → **npm-publish** → enable **Required reviewers**
and add yourself. Optionally restrict deployment branches to `main` and the
`cli-v*` tag pattern.

Until a reviewer is configured the environment exists but gates nothing, so the
workflow publishes unattended. That is safe — the OIDC token is scoped to this
one workflow — but the approval step is what the npm changelog recommends
alongside it.

## The trap worth knowing about

Do not add `registry-url` to `actions/setup-node`. It writes
`//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}` into `.npmrc`, and with no
token set that expands to an empty value. npm reads it as "auth is already
configured", never starts the OIDC exchange, and fails with `ENEEDAUTH` — at the
moment you are trying to ship. npm's own documented example still carries this
([npm/documentation#1960][bug]), and `setup-node` has no opt-out for the line as
of v4. registry.npmjs.org is the default registry, so the input is not needed.

## Verifying it worked

```bash
npm view create-nuxt-saas         # version and dist-tags
npm audit signatures              # inside a project that installed it
```

The npm package page shows a provenance badge linking back to the workflow run
that built the tarball. Trusted publishing generates those attestations
automatically, which is why the workflow passes neither `--provenance` nor
`--access`; `publishConfig.access` in `package.json` covers the latter.

[tp]: https://docs.npmjs.com/trusted-publishers
[gat]: https://github.blog/changelog/2026-07-08-npm-install-time-security-and-gat-bypass2fa-deprecation/
[bug]: https://github.com/npm/documentation/issues/1960
