import type {
  LoginPolicy,
  LoginPolicyContext,
  LoginPolicyOutcome,
} from '#layers/auth/types/loginPolicies';

// Filled once by Nitro plugins; shared by every request.
const loginPolicies = new Map<string, LoginPolicy>();

/** Throws when the id is taken, so no module can silently replace another's policy. */
export function registerLoginPolicy(policy: LoginPolicy): void {
  if (loginPolicies.has(policy.id)) {
    throw new Error(`Login policy "${policy.id}" is already registered.`);
  }

  loginPolicies.set(policy.id, policy);
}

/**
 * Runs the registered policies in ascending `order`. Only `continue` moves on to
 * the next policy; any other outcome, including one the host does not know, is
 * returned at once. A policy that throws fails the sign-in.
 */
export async function runLoginPolicies(ctx: LoginPolicyContext): Promise<LoginPolicyOutcome> {
  const policies = [...loginPolicies.values()].sort((a, b) => a.order - b.order);

  for (const policy of policies) {
    const outcome = await policy.run(ctx);
    if (outcome.kind === 'continue') {
      continue;
    }

    return outcome;
  }

  return { kind: 'continue' };
}
