# Web Security

The kit installs this layer by default on new projects and migrates the built-in policy when an existing project first upgrades to a kit with the layer. It registers Nuxt Security with the kit's Cloudflare-compatible policy. When Server Core or Admin is installed, it also sets the default API and admin seed rate limits. With Passkeys installed, it allows same-origin WebAuthn.

Use `security` and `routeRules` in your project's `nuxt.config.ts` to override the defaults. If you customized the old root `security` block, keep your custom settings in the root config, but remove the old `nuxt-security` entry from `modules`; the layer registers it now.

**Cloudflare static responses:** Prerendered HTML is served as an asset, not through the Worker. With the kit defaults, `/` and `/vi` receive global headers such as HSTS, `X-Content-Type-Options` and `X-Frame-Options`, but not the Worker's CSP, `Cross-Origin-Opener-Policy`, or `Permissions-Policy`. The kit leaves per-page SSG header export off: exporting every docs page's headers can exceed Cloudflare's `_headers` limits. If your deployment requires those headers on static documents, configure and verify response headers at the hosting edge, or serve the affected pages through SSR. Test both a prerendered page and a Worker-rendered page; headers on one do not prove coverage of the other.

To opt out, run `pnpm dlx create-nuxt-saas@latest remove web-security` or use **Remove Modules** in Kit Manager. Server features remain installed, but the kit's Nuxt Security policy and API rate limits no longer apply. If you need those protections, keep the layer or configure them separately. Subsequent kit upgrades respect the removal.
