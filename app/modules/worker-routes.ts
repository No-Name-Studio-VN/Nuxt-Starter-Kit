/**
 * Nuxt Module: Worker Routes
 *
 * Content pages are prerendered, so the Cloudflare Worker is only needed for the
 * server handlers and the pages that cannot be static (auth, dashboards, ...).
 * Without this module, any path without a static file (bots probing /.env,
 * /wp-login.php, ...) reached the Worker and fell through to the catch-all docs
 * page, paying a full SSR plus content queries per request and blowing the
 * Workers CPU limit.
 *
 * After prerendering, this module lists the server handlers and the pages without
 * a static file, and:
 * - writes them to `assets.run_worker_first` together with
 *   `not_found_handling: "404-page"`, so Cloudflare answers every other miss with
 *   the prerendered 404.html without invoking the Worker at all;
 * - exposes the same routes as `#worker-routes` for server/plugins/worker-gate.ts,
 *   which hands anything else that still reaches the Worker back to the assets.
 *
 * Catch-all pages (`[...slug].vue`) never run on the Worker: every path they
 * serve must be prerendered (crawled or listed in `nitro.prerender.routes`).
 * Routes listed in `nitro.prerender.routes` that fail to prerender stay on the
 * Worker (rendered per request, as before) and are reported as a build warning.
 *
 * Non-GET/HEAD requests to unknown paths get 405 from the asset layer, not 404.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { addServerTemplate, addTypeTemplate, defineNuxtModule } from '@nuxt/kit';
import type { Nitro } from 'nitropack';
import type { NuxtPage } from 'nuxt/schema';

// Cloudflare caps `run_worker_first` at 100 entries of under 100 characters each.
const MAX_WORKER_FIRST_RULES = 100;
const MAX_WORKER_FIRST_RULE_LENGTH = 100;

/**
 * Handlers that must not be reachable from the edge: Nuxt's error page render,
 * server component islands (unused here) and @nuxt/content's query endpoints.
 * Browsers query content through WASM SQLite on the prerendered dumps; the few
 * without WebAssembly (e.g. Safari Lockdown Mode) lose client-side content
 * queries, which is accepted to keep the endpoint off the Worker.
 */
function isInternalRoute(route: string): boolean {
  return (
    route === '/__nuxt_error' ||
    route.startsWith('/__nuxt_island') ||
    route.startsWith('/__nuxt_content/')
  );
}

/** Same filter Nitro applies when bundling handlers (`env: 'dev'`, `'prerender'`, ...). */
function isBundled(nitro: Nitro, env: string | string[] | undefined): boolean {
  const envs = (Array.isArray(env) ? env : [env]).filter(Boolean);
  return envs.length === 0 || envs.includes('prod') || envs.includes(nitro.options.preset);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Converts a Nitro handler route (`/a/:id`, `/b/**`) to an exact regexp source. */
function routeToRegExpSource(route: string): string {
  let source = '';
  for (const segment of route.split('/').slice(1)) {
    if (segment.startsWith('**')) return `${source}(?:/.*)?`;
    if (segment.startsWith(':')) {
      source += segment.endsWith('?') ? '(?:/[^/]+)?' : '/[^/]+';
    } else if (segment === '*') {
      source += '/[^/]+';
    } else {
      source += `/${escapeRegExp(segment)}`;
    }
  }
  return source || '/';
}

/**
 * Converts a Nitro handler route to Cloudflare `run_worker_first` globs, where
 * `*` matches any characters across segments. Globs are coarser than the route;
 * the worker gate re-checks the exact route.
 */
function routeToGlobs(route: string): string[] {
  const glob = route.replace(/\/\*\*.*$/, '/*').replace(/\/:[^/]+/g, '/*');
  const optional = /\/:[^/]+\?$/.test(route) ? [route.replace(/\/:[^/]+\?$/, '') || '/'] : [];
  // Nitro's router ignores a trailing slash; the asset layer would 404 it.
  return [glob, ...optional].flatMap((g) => (g.endsWith('*') || g === '/' ? [g] : [g, `${g}/`]));
}

/** Drops rules that a `/prefix/*` rule already covers, which wrangler rejects as redundant. */
function dropRedundantGlobs(globs: string[]): string[] {
  const prefixes = globs.filter((glob) => glob.endsWith('*')).map((glob) => glob.slice(0, -1));
  return globs.filter(
    (glob) => !prefixes.some((prefix) => glob !== `${prefix}*` && glob.startsWith(prefix)),
  );
}

/**
 * Merges rules under their first path segment (`/api/a`, `/api/b` -> `/api/*`),
 * largest group first, until they fit Cloudflare's limit. Unknown paths under a
 * merged prefix then reach the Worker, where the gate turns them away cheaply.
 */
function fitGlobs(globs: string[]): string[] {
  let result = dropRedundantGlobs(globs);
  while (result.length > MAX_WORKER_FIRST_RULES) {
    const groups = new Map<string, number>();
    for (const glob of result) {
      const segment = glob.split('/')[1];
      if (!glob.startsWith('/') || !segment || glob === `/${segment}/*`) continue;
      if (glob.startsWith(`/${segment}/`)) groups.set(segment, (groups.get(segment) ?? 0) + 1);
    }
    const [largest] = [...groups].filter(([, size]) => size > 1).sort((a, b) => b[1] - a[1]);
    if (!largest) break;
    result = dropRedundantGlobs([...result, `/${largest[0]}/*`]);
  }
  return result;
}

/**
 * Converts a vue-router page path (`/users/:id()`, `/blog/:slug?`) to a Nitro-style
 * route; `null` for catch-alls (`/:slug(.*)*`), which are left to prerendering.
 * Redirect route rules show up as pages too, with and without a trailing slash.
 */
function pagePathToRoute(path: string): string | null {
  if (path.includes('(.*)')) return null;
  return path.replace(/\(\)/g, '').replace(/(.)\/$/, '$1') || '/';
}

/** Full paths of every page, children included. */
function listPagePaths(pages: NuxtPage[], parent = ''): string[] {
  return pages.flatMap((page) => {
    const path = page.path.startsWith('/') ? page.path : `${parent}/${page.path}`;
    return [path, ...listPagePaths(page.children ?? [], path)];
  });
}

/** Every file in the public output dir as a URL path (`/robots.txt`). */
async function listStaticPaths(publicDir: string): Promise<string[]> {
  const entries = await readdir(publicDir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map(
      (entry) => `/${relative(publicDir, join(entry.parentPath, entry.name)).split(sep).join('/')}`,
    );
}

/**
 * Source paths of the static redirects in `_redirects` (written by
 * app/modules/navigation-redirects.ts), which the asset layer answers itself.
 */
async function listRedirectSources(publicDir: string): Promise<Set<string>> {
  const contents = await readFile(join(publicDir, '_redirects'), 'utf8').catch(() => '');
  return new Set(
    contents
      .split('\n')
      .map((line) => line.trim().split(/\s+/)[0] ?? '')
      .filter((source) => source.startsWith('/'))
      .map((source) => source.replace(/(.)\/$/, '$1')),
  );
}

interface WorkerRoutes {
  globs: string[];
  /** Regexp sources by lowercase HTTP method; `*` holds handlers for any method. */
  regExpSources: Record<string, string[]>;
  /** Regexp sources of the pages the Worker renders. */
  pageRegExpSources: string[];
}

function listWorkerRoutes(
  nitro: Nitro,
  staticPaths: string[],
  redirectSources: Set<string>,
  pagePaths: string[],
  unrendered: string[],
): WorkerRoutes {
  const globs = new Set<string>();
  const regExpSources: Record<string, Set<string>> = {};
  const pageRegExpSources = new Set<string>();
  const addRoute = (route: string, method = '*') => {
    (regExpSources[method] ??= new Set()).add(routeToRegExpSource(route));
    for (const glob of routeToGlobs(route)) globs.add(glob);
  };
  const addPage = (route: string) => {
    pageRegExpSources.add(routeToRegExpSource(route));
    addRoute(route, 'get');
  };

  // Pages that failed to prerender keep being rendered by the Worker.
  for (const route of unrendered) addPage(route);

  // Pages without a static file (auth, dashboards, `ssr: false` SPA shells, ...).
  const staticPages = staticPaths
    .filter((path) => path.endsWith('.html'))
    .map((path) => path.replace(/(?:\/index)?\.html$/, '') || '/');
  for (const path of pagePaths) {
    const route = pagePathToRoute(path);
    if (!route || redirectSources.has(route)) continue;
    const matcher = new RegExp(`^${routeToRegExpSource(route)}/?$`);
    const prerendered = staticPages.filter((page) => matcher.test(page));
    if (prerendered.length > 0) {
      if (!/[:*]/.test(route)) continue;
      // Prerendered instances of a dynamic page stay static.
      for (const page of prerendered) {
        globs.add(`!${page}`);
        if (page !== '/') globs.add(`!${page}/`);
      }
    }
    addPage(route);
  }

  for (const { route, method, middleware, env } of [
    ...nitro.scannedHandlers,
    ...nitro.options.handlers,
  ]) {
    // Middleware and the Nuxt renderer ('/**') run for every path; pages are static.
    if (!route || middleware || route === '/**' || isInternalRoute(route)) continue;
    if (!isBundled(nitro, env)) continue;

    const matcher = new RegExp(`^${routeToRegExpSource(route)}/?$`);
    const prerendered = staticPaths.filter((path) => matcher.test(path));
    if (prerendered.length > 0) {
      // Prerendered to a static file (robots.txt, ...): the asset layer answers it.
      if (!/[:*]/.test(route)) continue;
      // A dynamic handler keeps answering the paths without a file (e.g. i18n
      // messages requested by a tab still on the previous build's hash), while
      // its prerendered files stay static.
      // Precompressed siblings (`.gz`, `.br`) are never requested by URL.
      for (const path of prerendered) {
        if (!/\.(?:gz|br)$/.test(path)) globs.add(`!${path}`);
      }
    }

    addRoute(route, method?.toLowerCase());
  }

  return {
    globs: fitGlobs([...globs]).sort(),
    regExpSources: Object.fromEntries(
      Object.entries(regExpSources).map(([method, sources]) => [method, [...sources].sort()]),
    ),
    pageRegExpSources: [...pageRegExpSources].sort(),
  };
}

/** Wrangler rejects these only at deploy time; fail the build instead. */
function assertValidGlobs(globs: string[]): void {
  const problems: string[] = [];
  if (!globs.some((glob) => glob.startsWith('/'))) problems.push('no Worker routes');
  if (globs.length > MAX_WORKER_FIRST_RULES) {
    problems.push(`${globs.length} rules exceed the limit of ${MAX_WORKER_FIRST_RULES}`);
  }
  for (const glob of globs) {
    if (glob.length >= MAX_WORKER_FIRST_RULE_LENGTH) {
      problems.push(`'${glob}' is ${MAX_WORKER_FIRST_RULE_LENGTH} characters or longer`);
    }
  }
  if (problems.length > 0) {
    throw new Error(`[worker-routes] Invalid run_worker_first: ${problems.join('; ')}.`);
  }
}

export default defineNuxtModule({
  meta: {
    name: 'worker-routes',
    configKey: 'workerRoutes',
  },

  defaults: {
    enabled: true,
  },

  setup(options, nuxt) {
    // `null` until the routes are known on a Cloudflare build; the gate then stays off.
    let workerRoutes: WorkerRoutes | null = null;

    addServerTemplate({
      filename: '#worker-routes',
      getContents: () => {
        if (!workerRoutes) {
          return 'export const workerRoutePatterns = null;\nexport const workerPagePattern = null;\n';
        }
        const toRegExp = (sources: string[]) =>
          sources.length > 0
            ? `new RegExp(${JSON.stringify(`^(?:${sources.join('|')})/?$`)})`
            : 'null';
        const patterns = Object.entries(workerRoutes.regExpSources).map(
          ([method, sources]) => `  ${JSON.stringify(method)}: ${toRegExp(sources)},`,
        );
        return [
          `export const workerRoutePatterns = {\n${patterns.join('\n')}\n};`,
          `export const workerPagePattern = ${toRegExp(workerRoutes.pageRegExpSources)};`,
          '',
        ].join('\n');
      },
    });

    addTypeTemplate(
      {
        filename: 'types/worker-routes.d.ts',
        getContents: () =>
          [
            "declare module '#worker-routes' {",
            '  /**',
            '   * Paths a server handler answers on the Worker, by lowercase HTTP method',
            "   * (`'*'` for any method); `null` when routing is not restricted.",
            '   */',
            '  export const workerRoutePatterns: Record<string, RegExp> | null;',
            '  /** Pages the Worker renders (not prerendered); `null` when there are none. */',
            '  export const workerPagePattern: RegExp | null;',
            '}',
            '',
          ].join('\n'),
      },
      { nitro: true, nuxt: true },
    );

    if (!options.enabled || nuxt.options.dev) return;

    // Hooked once every module is set up, so it runs after the hooks that add
    // routes (i18n registers its locale routes from `modules:done` too).
    let pagePaths: string[] = [];
    nuxt.hook('modules:done', () => {
      nuxt.hook('pages:resolved', (pages) => {
        pagePaths = [...new Set(listPagePaths(pages))];
      });
    });

    nuxt.hook('nitro:init', (nitro) => {
      // Pages presets have no `assets.run_worker_first`.
      if (!['cloudflare-module', 'cloudflare-durable'].includes(nitro.options.preset)) return;

      let unrendered: string[] = [];

      nitro.hooks.hook('prerender:done', ({ prerenderedRoutes }) => {
        const prerendered = new Set(prerenderedRoutes.map((route) => route.route));
        unrendered = nitro.options.prerender.routes.filter((route) => !prerendered.has(route));
        if (unrendered.length > 0) {
          console.warn(
            `[worker-routes] ${unrendered.length} routes failed to prerender (see the errors ` +
              'above). They stay on the Worker and cost CPU on every request:\n  ' +
              unrendered.join('\n  '),
          );
        }
      });

      // Runs once every module has finished prerendering (the sitemap writes its
      // files from its own prerender:done hook), the public dir has been copied
      // and the PWA service worker written, and before the preset writes
      // wrangler.json from `nitro.options.cloudflare.wrangler` in `compiled`.
      nuxt.hook('nitro:build:public-assets', async () => {
        const { publicDir } = nitro.options.output;
        const staticPaths = await listStaticPaths(publicDir);
        const redirectSources = await listRedirectSources(publicDir);
        workerRoutes = listWorkerRoutes(nitro, staticPaths, redirectSources, pagePaths, unrendered);
        assertValidGlobs(workerRoutes.globs);

        // An array (even a short one) is what makes Cloudflare apply
        // not_found_handling to every request, not only browser navigations.
        const wrangler = ((nitro.options.cloudflare ??= {}).wrangler ??= {});
        wrangler.assets = {
          ...wrangler.assets,
          not_found_handling: '404-page',
          run_worker_first: workerRoutes.globs,
        };

        console.log(`[worker-routes] Worker handles ${workerRoutes.globs.length} route patterns:`);
        for (const glob of workerRoutes.globs) console.log(`[worker-routes]   ${glob}`);
      });
    });
  },
});
