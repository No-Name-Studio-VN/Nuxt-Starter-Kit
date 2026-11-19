# Content

Adds documentation, a blog, RSS, and search.
Requires only the base app; Markdown and landing YAML stay in root `content/`.
Collections resolve that directory explicitly from this layer.
Configure docs options in `docs.config.ts`.
Install the [Nuxt Studio](../content-studio/README.md) module if you want to edit content in the browser.
Run `pnpm dev` to preview content and `pnpm build` to prerender it.
Header links, search, and the landing hero register through base extension points.
