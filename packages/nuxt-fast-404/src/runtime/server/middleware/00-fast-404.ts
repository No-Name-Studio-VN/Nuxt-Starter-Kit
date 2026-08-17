import { defineEventHandler, getHeader } from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime';
import {
  apiPrefixes,
  cacheMaxAge,
  enabled,
  exclude,
  pageCaseSensitive,
  pageRoutePatterns,
  serverRoutePatterns,
} from '#internal/nuxt-fast-404-routes';
import { createFast404RouteMatcher, normalizeFast404RequestPath } from '../../matcher';
import { createFast404Response } from '../../response';

const routeMatcher = createFast404RouteMatcher(
  pageRoutePatterns,
  serverRoutePatterns,
  pageCaseSensitive,
  exclude,
);

export default defineEventHandler((event) => {
  if (!enabled || !routeMatcher.ready) return;

  const path = normalizeFast404RequestPath(event.path, useRuntimeConfig(event).app.baseURL);
  if (routeMatcher.matches(path)) return;

  return createFast404Response(path, event.method, getHeader(event, 'accept'), {
    apiPrefixes,
    cacheMaxAge,
  });
});
