import type {
  LoginPolicy,
  LoginPolicyContext,
  LoginPolicyOutcome,
} from '#layers/auth/types/loginPolicies';

import { createOrderedRegistry } from '#layers/server-core/server/utils/orderedRegistry';

// Filled once by Nitro plugins; shared by every request.
const loginPolicies = createOrderedRegistry<LoginPolicy>('Login policy');

/** Throws when the id is taken, so no module can silently replace another's policy. */
export function registerLoginPolicy(policy: LoginPolicy): void {
  loginPolicies.register(policy);
}

/**
 * Runs the policies that apply to `ctx.method` in ascending `order`. Only
 * `continue` moves on to the next policy; any other outcome, including one the
 * host does not know, is returned at once. A policy that throws fails the sign-in.
 */
export async function runLoginPolicies(ctx: LoginPolicyContext): Promise<LoginPolicyOutcome> {
  const policies = loginPolicies.list().filter((policy) => !policy.methods || policy.methods.includes(ctx.method));

  for (const policy of policies) {
    const outcome = await policy.run(ctx);
    if (outcome.kind === 'continue') {
      continue;
    }

    return outcome;
  }

  return { kind: 'continue' };
}
