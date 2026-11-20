import { sql } from 'drizzle-orm';
import type { SQLWrapper } from 'drizzle-orm';
import type { User } from '#layers/auth/types/auth';

export function hasPassword(user: Pick<User, 'password'>): boolean {
  return user.password.trim().length > 0;
}

// SQLite trim() defaults to spaces only. Match the whitespace handled by String.trim().
const passwordWhitespace = ' \t\n\r\v\f\u00A0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF';

export function passwordIsSet(password: SQLWrapper) {
  return sql<boolean>`length(trim(${password}, ${passwordWhitespace})) > 0`;
}
