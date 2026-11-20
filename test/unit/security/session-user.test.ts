import { globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import type { User } from '../../../layers/auth/types/auth';

const root = fileURLToPath(new URL('../../../', import.meta.url));

function calleeName(expression: ts.Expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return undefined;
}

describe('session user', () => {
  it('copies onboarding state and identity and preserves the optional lock-screen flag', async () => {
    const { toSessionUser } = await import('../../../layers/auth/server/utils/sessionUser');
    const user: User = {
      id: 42,
      username: 'member',
      name: 'Member',
      isAdmin: true,
      onboardingPending: true,
      onboardingCompletedSteps: ['profile'],
      email: 'member@example.test',
      emailVerified: false,
      isLocked: false,
      lastLoginAt: null,
      createdAt: null,
      updatedAt: null,
    };

    expect(toSessionUser(user, { skipLockOnInit: true })).toStrictEqual({
      id: 42,
      username: 'member',
      name: 'Member',
      isAdmin: true,
      onboardingPending: true,
      skipLockOnInit: true,
    });
    expect(toSessionUser({ ...user, onboardingPending: false })).toStrictEqual({
      id: 42,
      username: 'member',
      name: 'Member',
      isAdmin: true,
      onboardingPending: false,
    });
  });

  it('uses toSessionUser for every authenticated session write in the server code', () => {
    const violations: string[] = [];
    let userWrites = 0;
    const paths = globSync('{server,layers/**/server}/**/*.{ts,js,mts,mjs,cts,cjs}', { cwd: root });

    for (const path of paths) {
      const text = readFileSync(resolve(root, path), 'utf8');
      if (!/\b(?:setUserSession|replaceUserSession)\b/.test(text)) continue;

      const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
      function visit(node: ts.Node) {
        if (ts.isCallExpression(node)) {
          const name = calleeName(node.expression);
          if (name === 'setUserSession' || name === 'replaceUserSession') {
            const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
            const location = `${path}:${line + 1} (${name})`;
            const payload = node.arguments[1];
            if (!payload || !ts.isObjectLiteralExpression(payload)) {
              violations.push(`${location}: session fields must be explicit`);
            } else {
              for (const property of payload.properties) {
                const key = property.name;
                if (!key || (!ts.isIdentifier(key) && !ts.isStringLiteral(key))) {
                  violations.push(`${location}: session fields must be explicit`);
                } else if (key.text === 'user') {
                  userWrites += 1;
                  if (
                    !ts.isPropertyAssignment(property) ||
                    !ts.isCallExpression(property.initializer) ||
                    calleeName(property.initializer.expression) !== 'toSessionUser'
                  ) {
                    violations.push(`${location}: user must be built by toSessionUser`);
                  }
                }
              }
            }
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }

    expect(userWrites).toBeGreaterThan(0);
    expect(violations).toEqual([]);
  });
});
