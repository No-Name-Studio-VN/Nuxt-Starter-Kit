import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { users } from '../../../layers/auth/server/db/schema.sqlite';
import userService from '../../../layers/auth/server/utils/database/user';

const ids = Array.from({ length: 125 }, (_, index) => index + 1);

afterEach(() => vi.unstubAllGlobals());

describe('bulk deletions on D1', () => {
  it('deletes more than 100 users in one statement and returns only deleted IDs', async () => {
    const client = createClient({ url: ':memory:' });
    let deletes = 0;
    try {
      await client.execute(`CREATE TABLE users (id INTEGER PRIMARY KEY)`);
      await client.execute(`
        WITH RECURSIVE ids(id) AS (SELECT 1 UNION ALL SELECT id + 1 FROM ids WHERE id < 126)
        INSERT INTO users SELECT id FROM ids
      `);
      const db = drizzle(client, {
        logger: {
          logQuery(query, params) {
            if (!query.startsWith('delete')) return;
            deletes += 1;
            if (params.length > 100) throw new Error('D1 bound parameter limit exceeded');
          },
        },
      });
      vi.stubGlobal('tables', { users });
      vi.stubGlobal('useDB', () => db);

      const deleted = await userService.bulkDelete([...ids, 1, 1000]);
      expect(deleted.sort((a, b) => a - b)).toEqual(ids);
      expect(deletes).toBe(1);
      expect(await db.select({ id: users.id }).from(users)).toEqual([{ id: 126 }]);
      expect(await userService.bulkDelete([])).toEqual([]);
      expect(deletes).toBe(1);
    } finally {
      client.close();
    }
  });
});
