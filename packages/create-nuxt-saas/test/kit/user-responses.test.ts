import { afterEach, describe, expect, it, vi } from 'vitest';
import { users } from '../../../../layers/auth/server/db/schema.sqlite';
import userService from '../../../../layers/auth/server/utils/database/user';

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
  it('selects every existing non-secret field, without selecting the password hash', async () => {
    const all = vi.fn().mockResolvedValue([]);
    const from = vi.fn().mockReturnValue({ all });
    const select = vi.fn().mockReturnValue({ from });
    vi.stubGlobal('tables', { users });
    vi.stubGlobal('useDB', () => ({ select }));

    expect(await userService.getList()).toEqual([]);
    expect(select).toHaveBeenCalledOnce();
    const projection = select.mock.calls[0]?.[0];
    expect(Object.keys(projection).sort()).toEqual([...safeFields].sort());
    expect(projection).not.toHaveProperty('password');
    expect(from).toHaveBeenCalledWith(users);
    expect(all).toHaveBeenCalledOnce();
  });

  it('keeps the full row available internally for password authentication', async () => {
    const row = { id: 1, password: 'internal-hash' };
    const get = vi.fn().mockResolvedValue(row);
    const where = vi.fn().mockReturnValue({ get });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    vi.stubGlobal('tables', { users });
    vi.stubGlobal('useDB', () => ({ select }));

    expect(await userService.getById(1)).toEqual(row);
    expect(select).toHaveBeenCalledWith();
  });
});
