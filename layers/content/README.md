# Content

Adds documentation, a blog, RSS, and search.
Requires only the base app; Markdown and landing YAML stay in root `content/`.
Collections resolve that directory explicitly from this layer.
Configure docs options in `docs.config.ts`.
Install the [Nuxt Studio](../content-studio/README.md) module if you want to edit content in the browser.
Run `pnpm dev` to preview content and `pnpm build` to prerender it.
Header links, search, and the landing hero register through base extension points.

## Blog URLs

The blog is served at `/blogs` by default. Set its public path in your root `nuxt.config.ts` and rebuild:

```ts
export default defineNuxtConfig({
  blog: { basePath: '/news' },
});
```

Keep the Markdown in `content/blogs/` and translated posts in `content/<locale>/blogs/`. With `i18n.strategy: 'no_prefix'`, translations can also stay in `content/blogs/<locale>/`; their public article URLs use `/news/<locale>/<slug>` while default-language posts use `/news/<slug>`. Locale codes are reserved as the first slug segment in this mode. Add your own legacy redirects and update any site-owned nav or links when changing the public base.

Content navigation accepts `navigation: false` to hide a page, `navigation: true` to include it, or a map with fields such as `title`, `redirect`, and `target`.
