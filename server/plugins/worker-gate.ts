import { workerPagePattern, workerRoutePatterns } from '#worker-routes';

/**
 * Hands every request that no server handler or Worker-rendered page answers
 * back to Cloudflare's asset layer, which serves the prerendered 404.html.
 * Without this, such requests fall through to the Nuxt renderer and pay a full
 * SSR of the catch-all docs page.
 *
 * Normally the asset layer never routes them to the Worker in the first place
 * (see app/modules/worker-routes.ts). This keeps the Worker cheap if one gets
 * here anyway: when deployed with a config that lacks `run_worker_first`, under
 * a prefix the module merged into one rule, or when a Worker route is called
 * with a method its handler does not accept.
 */
export default defineNitroPlugin((nitroApp) => {
  const patterns = workerRoutePatterns;
  if (import.meta.dev || import.meta.prerender || !patterns) return;

  const localFetch = nitroApp.localFetch;

  nitroApp.localFetch = (input, init) => {
    // Only requests arriving from the edge carry the Cloudflare platform context.
    const cloudflare = init?.context?._platform?.cloudflare;
    if (!cloudflare) {
      // Nuxt renders error pages through an in-process `/__nuxt_error` request,
      // a full Vue SSR. Only Worker-rendered pages get it; for failing handlers
      // and junk paths, failing it makes Nuxt answer with its static template.
      const path = String(input);
      if (path.startsWith('/__nuxt_error')) {
        const url = new URL(path, 'http://localhost').searchParams.get('url') ?? '';
        if (!workerPagePattern?.test(new URL(url, 'http://localhost').pathname)) {
          return Promise.reject(new Error('Error page is not rendered for this path'));
        }
      }
      return localFetch(input, init);
    }

    const { request, env, url } = cloudflare;
    const method = request.method === 'HEAD' ? 'get' : request.method.toLowerCase();
    if (patterns['*']?.test(url.pathname) || patterns[method]?.test(url.pathname)) {
      return localFetch(input, init);
    }

    if (env.ASSETS && (request.method === 'GET' || request.method === 'HEAD')) {
      return env.ASSETS.fetch(request);
    }
    return Promise.resolve(new Response('Not Found', { status: 404 }));
  };
});
