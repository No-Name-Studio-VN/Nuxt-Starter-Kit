import { afterEach, describe, expect, it, vi } from 'vitest';
import { users } from '../../../layers/auth/server/db/schema.sqlite';
import userService from '../../../layers/auth/server/utils/database/user';

const safeFields = [
  'id',
  'username',
  'name',
  'email',
  'emailVerified',
  'isAdmin',
  'isLocked',
  'lastLoginAt',
  'createdAt',
  'updatedAt',
];

afterEach(() => vi.unstubAllGlobals());

describe('client-safe user responses', () => {
  it('selects every client-safe field', async () => {
    const all = vi.fn().mockResolvedValue([]);
    const from = vi.fn().mockReturnValue({ all });
    const select = vi.fn().mockReturnValue({ from });
    vi.stubGlobal('tables', { users });
    vi.stubGlobal('useDB', () => ({ select }));

    expect(await userService.getList()).toEqual([]);
    expect(select).toHaveBeenCalledOnce();
    const projection = select.mock.calls[0]?.[0];
    expect(Object.keys(projection).sort()).toEqual([...safeFields].sort());
    expect(from).toHaveBeenCalledWith(users);
    expect(all).toHaveBeenCalledOnce();
  });
});
