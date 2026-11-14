# {{name}}

{{description}}

## Getting started

Install dependencies and start the development server:

```sh
pnpm install
pnpm dev
```

Copy `.env.example` to `.env` and configure the values for your environment.
Update `site.config.ts` with your site's details before deploying.

## Modules

{{modules}}

Module source and configuration live in `layers/`. Files outside those layers
provide the shared base. Use the Nuxt SaaS CLI to add or remove modules and to
upgrade your project.

## Deployment

Configure your Cloudflare resources in `wrangler.jsonc`, then build and deploy:

```sh
pnpm build
pnpm deploy
```
