/** What the seed did with the default admin account. */
export interface SeedAdminResult {
  created: boolean;
  verified: boolean;
  username: string;
}

/** What one registered seed task did. */
export interface SeedTaskResult {
  /** Property of the seed summary that holds `counts`, e.g. 'featureFlags'. */
  key: string;
  /** Starts each logged count: 'Feature flags' logs "Feature flags created: 1". */
  label: string;
  /** Returned under `key` in the seed summary and logged one line per entry. */
  counts: Record<string, number>;
}

/** Work that runs after the seed has created the admin account, e.g. a module's default rows. */
export interface SeedTask {
  id: string;
  order: number;
  run(): Promise<SeedTaskResult>;
}
