# Nuxt Starter Kit

A modern, production-ready Nuxt 3 starter template with NuxtHub, Authentication, PWA support, and more.

![Nuxt](https://img.shields.io/badge/Nuxt-4.x-00DC82?style=flat&logo=nuxt.js&logoColor=white)
![Vue](https://img.shields.io/badge/Vue-3.x-4FC08D?style=flat&logo=vue.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.x-38B2AC?style=flat&logo=tailwind-css&logoColor=white)

## ✨ Features

- **🚀 Nuxt 4** - The latest Nuxt with improved performance and developer experience
- **🔐 Authentication** - Built-in auth with password and WebAuthn/Passkey support via `nuxt-auth-utils`
- **📱 PWA Ready** - Progressive Web App with offline support and installable experience
- **🎨 UI Components** - Pre-configured shadcn-vue components with Tailwind CSS v4
- **🗄️ Database** - SQLite with Drizzle ORM for type-safe database operations
- **☁️ NuxtHub** - Ready for deployment on Cloudflare with edge computing
- **🔒 Security** - Built-in security headers and rate limiting via `nuxt-security`
- **🎯 SEO** - Optimized with robots, sitemap, and schema.org support
- **🌙 Dark Mode** - Color mode switching with `@nuxtjs/color-mode`
- **📝 Content** - Markdown content management with `@nuxt/content`
- **🖼️ Image Optimization** - Automatic image optimization with `@nuxt/image`
- **🔤 Fonts** - Optimized font loading with `@nuxt/fonts`

## 📦 Tech Stack

### Frontend
- [Vue 3](https://vuejs.org/) - Progressive JavaScript Framework
- [Nuxt 4](https://nuxt.com/) - The Intuitive Vue Framework
- [Tailwind CSS 4](https://tailwindcss.com/) - Utility-first CSS framework
- [shadcn-vue](https://www.shadcn-vue.com/) - Re-usable UI components
- [Reka UI](https://reka-ui.com/) - Unstyled, accessible components for Vue
- [VueUse](https://vueuse.org/) - Collection of Vue Composition Utilities
- [Pinia](https://pinia.vuejs.org/) - State management
- [Motion V](https://motion.dev/) - Animation library
- [Lucide Icons](https://lucide.dev/) - Beautiful icons

### Backend
- [NuxtHub](https://hub.nuxt.com/) - Cloudflare deployment platform
- [Drizzle ORM](https://orm.drizzle.team/) - Type-safe SQL ORM
- [SQLite](https://www.sqlite.org/) - Embedded database (via better-sqlite3)
- [nuxt-auth-utils](https://github.com/Atinux/nuxt-auth-utils) - Authentication utilities
- [SimpleWebAuthn](https://simplewebauthn.dev/) - WebAuthn/Passkey support

### DevTools
- [ESLint](https://eslint.org/) - Code linting with @nuxt/eslint
- [TypeScript](https://www.typescriptlang.org/) - Type safety

## 🚀 Getting Started

### Prerequisites

- Node.js 18.x or higher
- npm, pnpm, or yarn

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

4. Generate database migrations:
```bash
npm run db:generate
```

5. Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:3000`.

## 📜 Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with PWA assets generation |
| `npm run build` | Build for production |
| `npm run generate` | Generate static site |
| `npm run preview` | Preview production build on port 4000 |
| `npm run lint` | Run ESLint with auto-fix |
| `npm run db:generate` | Generate Drizzle migrations |

## 📁 Project Structure

```
nuxt-template/
├── app/
│   ├── assets/css/        # Global styles and Tailwind CSS
│   ├── components/        # Vue components
│   │   ├── ui/            # shadcn-vue UI components
│   │   ├── admin/         # Admin-related components
│   │   └── nav/           # Navigation components
│   ├── composables/       # Vue composables
│   ├── constants/         # App constants and configurations
│   ├── layouts/           # Page layouts (default, dashboard, empty)
│   ├── lib/               # Utility functions
│   ├── middleware/        # Route middleware
│   ├── pages/             # File-based routing
│   │   ├── admin/         # Admin pages
│   │   ├── auth/          # Authentication pages (login, register)
│   │   └── dashboard.vue  # Dashboard page
│   └── plugins/           # Nuxt plugins
├── public/                # Static assets
├── server/
│   ├── api/               # API routes
│   │   ├── admin/         # Admin API endpoints
│   │   └── auth/          # Auth API endpoints
│   ├── database/          # Database schema and migrations
│   └── utils/             # Server utilities
├── types/                 # TypeScript type definitions
├── nuxt.config.ts         # Nuxt configuration
├── drizzle.config.ts      # Drizzle ORM configuration
├── pwa.config.ts          # PWA configuration
└── components.json        # shadcn-vue configuration
```

## 🔐 Authentication

This template includes a complete authentication system with:

- **Password-based authentication** - Traditional email/password login
- **WebAuthn/Passkeys** - Passwordless authentication support
- **Admin role management** - Built-in admin user support
- **Session management** - Secure session handling

### Database Schema

The authentication uses SQLite with the following tables:

- `users` - User accounts with username, password hash, and admin flag
- `credentials` - WebAuthn credentials for passkey authentication

## 🎨 UI Components

Pre-configured with [shadcn-vue](https://www.shadcn-vue.com/) using the New York style:

- Accordion, Alert, Avatar, Badge, Button, Card
- Checkbox, Dialog, Dropdown, Form, Input
- Progress, Select, Skeleton, Slider, Switch
- Table, Tabs, Tooltip, and more...

Add new components using:
```bash
npx shadcn-vue@latest add <component-name>
```

## ☁️ Deployment

### NuxtHub (Cloudflare)

This template is optimized for deployment on NuxtHub/Cloudflare:

1. Connect your repository to [NuxtHub](https://hub.nuxt.com/)
2. Configure environment variables
3. Deploy automatically on push

### Environment Variables

Create a `.env` file with the following variables:

```env
NUXT_SESSION_PASSWORD=your-secret-session-password-min-32-chars
```

## 🔒 Security

Built-in security features via `nuxt-security`:

- Content Security Policy (CSP)
- Cross-Origin policies
- Rate limiting on API routes (250 requests/minute in production)
- Secure headers

## 📱 PWA Features

- Auto-update service worker
- Offline caching with Workbox
- App manifest with shortcuts
- Install prompts
- Asset generation via `@vite-pwa/assets-generator`

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 👥 Author

**No Name Studio**  
📧 contact@nnsvn.me

---

Made with ❤️ using Nuxt
