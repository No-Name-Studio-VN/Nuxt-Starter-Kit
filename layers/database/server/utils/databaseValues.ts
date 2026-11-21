import { sql } from 'drizzle-orm';

// SQLite expands the JSON within the statement, so even large IN lists use one D1 binding.
export function databaseValues(values: readonly (number | string)[]) {
  return sql`(select value from json_each(${JSON.stringify(values)}))`;
}
