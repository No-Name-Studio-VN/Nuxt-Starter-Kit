# Nuxt SaaS Starter Kit

Fully equipped Technical Starter Pack for busy Nuxters.

A comprehensive, production-ready SaaS starter kit built with Nuxt 4, featuring authentication, admin dashboard, AI integration, and modern UI components.

![Nuxt](https://img.shields.io/badge/Nuxt-4.x-00DC82?style=flat&logo=nuxt.js&logoColor=white)
![Vue](https://img.shields.io/badge/Vue-3.x-4FC08D?style=flat&logo=vue.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.x-38B2AC?style=flat&logo=tailwind-css&logoColor=white)

## ✨ Features

### 🔐 Authentication & User Management
- **nuxt-auth-utils** - Modern authentication system
- Google OAuth integration
- Session management with database persistence
- User profile management
- Passwordless authentication with WebAuthn/Passkeys

### 🎨 Modern UI/UX
- **Tailwind CSS v4** - Latest utility-first styling
- **shadcn/ui** components - Accessible, customizable
- **Reka UI** primitives - Unstyled, accessible components
- Dark/light theme support with smooth transitions
- Responsive design with mobile-first approach
- Loading skeletons and optimistic UI updates

### 🗄️ Database & Storage
- **Drizzle ORM** - Type-safe database toolkit
- **Cloudflare R2** - Scalable file storage with zero egress fees
- Database migrations with Drizzle Kit

### 🎯 SEO
- Pre-configured SEO with `@nuxtjs/seo`
- Dynamic meta tags and Open Graph support
- Sitemap generation
- Robots.txt configuration

### 📱 PWA Features
- Auto-update service worker
- Offline caching with Workbox
- App manifest with shortcuts
- Install prompts
- Asset generation via `@vite-pwa/assets-generator`

### Content
- Blog and documentation system with `@nuxt/content`
- Markdown support with custom components
- SEO-friendly content structure
- Multi-language support with locale-based content

## 📦 Tech Stack

- **Framework**: Nuxt 4 with Vue 3
- **Language**: TypeScript with strict mode
- **Styling**: Tailwind CSS v4 + shadcn-vue
- **Database**: Sqlite + Drizzle ORM
- **Authentication**: nuxt-auth-utils + SimpleWebAuthn
- **Payments**: dodopayment
- **Storage**: Cloudflare R2
- **Analytics**: Sentry
- **Deployment**: Nuxthub -> Cloudflare (recommended) / Vercel / Netlify ...

## 🚀 Getting Started

### Prerequisites

- Node.js 18.x or higher
- npm, pnpm, yarn or bun

### Installation

1. Clone the repository:
```bash
git clone https://github.com/No-Name-Studio-VN/nuxt-template.git
cd nuxt-template
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```
Fill in the required environment variables in the `.env` file.

4. Generate database migrations:
```bash
npm run db:generate
```

5. Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:3000`.

## 📁 Project Structure

```
nuxt-template/
├── app/
│   ├── assets/css/        # style sheets and Tailwind config
│   ├── components/        # Vue components
│   ├── composables/       # Vue composables
│   ├── constants/         # App constants and configurations
│   ├── layouts/           # Page layouts (default, dashboard, empty)
│   ├── lib/               # Utility functions
│   ├── middleware/        # Route middleware
│   ├── pages/             # File-based routing
│   └── plugins/           # Nuxt plugins
├── public/                # Static assets
├── server/
│   ├── api/               # API routes
│   ├── database/          # Database schema and migrations
│   └── utils/             # Server utilities
├── types/                 # TypeScript type definitions
├── nuxt.config.ts         # Nuxt configuration
├── pwa.config.ts          # PWA configuration
```

## ☁️ Deployment

This template uses [NuxtHub](https://hub.nuxt.com/) version 0.10x, which allows deploying to multiple providers. We recommend deploying to Cloudflare for best performance and zero egress fees, but you can also deploy to Vercel or Netlify.

Follow the [NuxtHub deployment guide](https://hub.nuxt.com/docs/getting-started/deploy) to host a full-stack Nuxt application with minimal configuration.

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 👥 Author

**No Name Studio**  
📧 contact@nnsvn.me
