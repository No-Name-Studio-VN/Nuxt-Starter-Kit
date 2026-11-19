/** What one registered seed task did. */
export interface SeedTaskResult {
  /** Property of the seed summary that holds `counts`, e.g. 'featureFlags'. */
  key: string;
  /** Starts each logged count: 'Feature flags' logs "Feature flags created: 1". */
  label: string;
  /** Returned under `key` in the seed summary and logged one line per entry. */
  counts: Record<string, number>;
}

/**
 * The seed's response body: each registered task's counts under its `key`.
 * Task keys are known only once modules register their tasks.
 */
export type SeedSummary = Record<string, SeedTaskResult['counts']>;

/**
 * Work the seed runs, e.g. a module's default rows. `key` and `label` are
 * declared up front so a clash with another task's summary key fails at
 * registration, before any seed runs.
 */
export interface SeedTask extends Pick<SeedTaskResult, 'key' | 'label'> {
  id: string;
  order: number;
  run(): Promise<SeedTaskResult['counts']>;
}
