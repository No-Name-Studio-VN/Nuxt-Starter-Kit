# Content

Adds documentation, a blog, RSS, search, and Nuxt Studio.
Requires only the base app; Markdown and landing YAML stay in root `content/`.
Collections resolve that directory explicitly from this layer.
Fill `STUDIO_GITHUB_CLIENT_ID` and `STUDIO_GITHUB_CLIENT_SECRET` for Studio editing.
Configure the repository in `nuxt.config.ts` and docs options in `docs.config.ts`.
Run `pnpm dev` to preview content and `pnpm build` to prerender it.
Header links, search, and the landing hero register through base extension points.
