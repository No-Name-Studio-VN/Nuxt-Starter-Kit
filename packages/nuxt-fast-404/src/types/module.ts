export interface Fast404ModuleOptions {
  enabled: boolean;
  apiPrefixes: string[];
  exclude: string[];
  cacheMaxAge: number;
}

export interface Fast404PageRoute {
  path: string;
  alias?: string | string[];
  children?: Fast404PageRoute[];
}

export interface Fast404RouteSource {
  middleware?: boolean;
  route?: string;
}

export interface Fast404Manifest {
  enabled: boolean;
  pageCaseSensitive: boolean;
  pageRoutePatterns: string[];
  serverRoutePatterns: string[];
  exclude: string[];
  apiPrefixes: string[];
  cacheMaxAge: number;
}

export interface Fast404ResponseOptions {
  apiPrefixes: readonly string[];
  cacheMaxAge: number;
}
