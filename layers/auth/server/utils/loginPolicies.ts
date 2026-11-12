import type {
  LoginPolicy,
  LoginPolicyContext,
  LoginPolicyOutcome,
} from '#layers/auth/types/loginPolicies';

// Filled once by Nitro plugins; shared by every request.
const loginPolicies = new Map<string, LoginPolicy>();

export function registerLoginPolicy(policy: LoginPolicy): void {
  loginPolicies.set(policy.id, policy);
}

/**
 * Runs the registered policies in ascending `order` and returns the first
 * outcome that is not `continue`. A policy that throws fails the sign-in.
 */
export async function runLoginPolicies(ctx: LoginPolicyContext): Promise<LoginPolicyOutcome> {
  const policies = [...loginPolicies.values()].sort((a, b) => a.order - b.order);

  for (const policy of policies) {
    const outcome = await policy.run(ctx);
    if (outcome.kind !== 'continue') {
      return outcome;
    }
  }

  return { kind: 'continue' };
}
