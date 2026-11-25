# Nuxt SaaS Starter Kit

The ultimate starter for building full-stack Vue apps with Nuxt. **20+ handcrafted features** work together out of the box, so you can build on them instead of starting from scratch.

**Focus on your idea. The code is yours.** Every feature you choose lives in your project. Change the UI, rewrite a sign-in flow, or add something new. When the kit ships an update, preview the changes and decide what to bring into your app.

```bash
npm create nuxt-saas@latest my-app
```

## Features

Choose the modules you want in the terminal. The starter includes the pieces they depend on, and you can add more later.

| Category                  | What you can add                                                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🔑 **Accounts & sign-in** | Registration, password sign-in and reset, Google / GitHub / Discord sign-in, OpenID Connect, passkeys, email verification, and two-factor authentication. |
| 🖥️ **Dashboard & admin**  | An app dashboard with sidebar navigation and quick search, a protected admin area, user management, and a browser for key-value storage.                  |
| ✍️ **Publishing**         | A Markdown blog, documentation, content search, RSS feeds, and live editing with Nuxt Studio.                                                             |
| 🗄️ **Data & rollout**     | A SQLite database on Cloudflare D1, type-safe queries and migrations with Drizzle, and feature flags with an admin panel.                                 |
| 🛡️ **Bot protection**     | Protect public forms and API routes with Cloudflare Turnstile, or plug in your own verification provider.                                                 |
| 📱 **Installable app**    | A web app manifest, install prompts, and an offline fallback for people using your app on the go.                                                         |

## Kit Manager for macOS

See all your kit projects in one place: which version each runs, which modules it uses, and what the next update would change. Open a project to check for missing environment variables or review an upgrade file by file. Kit Manager shows the plan; the CLI applies it when you choose.

![Kit Manager overview showing projects and their update status](packages/kit-manager-macos/docs/screenshots/overview.png)

Download `KitManager.dmg` from the [latest kit release](https://github.com/No-Name-Studio-VN/Nuxt-Starter-Kit/releases/latest), open it, and drag **KitManager.app** to **Applications**. Requires macOS 26 or later and a local kit checkout with the CLI built.

The app is ad-hoc signed and not notarized. If macOS blocks the first launch and you trust the download, go to **System Settings → Privacy & Security → Open Anyway**. See the [Kit Manager guide](packages/kit-manager-macos/README.md) for CLI setup and screenshots.

## Run your app

Use Node.js 26+, Git, and pnpm 12.14.0 to follow along. After running the create command above, enter your project and install its dependencies:

```bash
cd my-app
pnpm install
```

Follow the CLI’s printed setup steps for the modules you chose. Fill in the requested `.env` values and, if your selection includes a database, run `pnpm db:generate`. Then start the app:

```bash
pnpm dev
```

Open [localhost:3000](http://localhost:3000).

## Make it yours

Your app starts with Nuxt 4, Vue 3, TypeScript, Tailwind CSS, and shadcn-vue. The starter copies your selected modules into `layers/` alongside your app code. For example, if you chose password sign-in, [PasswordLoginForm.vue](layers/auth-password/app/components/auth/PasswordLoginForm.vue) is the actual form in your project. Edit it directly to change what your users see.

You don’t have to choose everything on day one. To add password sign-in to an existing base app, run this from the project directory:

```bash
pnpm dlx create-nuxt-saas@latest add auth-password
```

To see what a kit update would change **without changing any files**, run:

```bash
pnpm dlx create-nuxt-saas@latest upgrade --check
```

Keep `.nuxt-saas.json` in version control so the CLI knows which kit version and modules your app uses. The [CLI guide](packages/create-nuxt-saas/README.md) covers adding and removing modules, applying updates, resolving conflicts, and undoing changes.

## Deployment

Cloudflare is the recommended target. For hosting options and provider-specific setup, see the [NuxtHub deployment guide](https://hub.nuxt.com/docs/getting-started/deploy).

## Working on the kit itself

To build **your own app**, use the create command at the top. To **contribute to the starter**, clone this repository instead; it includes every layer, the CLI, and the macOS app.

```bash
git clone https://github.com/No-Name-Studio-VN/Nuxt-Starter-Kit.git
cd Nuxt-Starter-Kit
pnpm install
cp .env.example .env
```

Fill in the required environment values, then run `pnpm db:generate` and `pnpm dev`. Issues and pull requests are welcome.

[Nuxt SaaS Starter Kit](https://nnsvn.me/products/nuxt-starter-kit) by No Name Studio · MIT License
