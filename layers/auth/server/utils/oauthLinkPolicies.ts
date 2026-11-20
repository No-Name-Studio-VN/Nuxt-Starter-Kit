import type { OAuthLinkPolicy, OAuthLinkPolicyContext } from '#layers/auth/types/loginPolicies';
import { createOrderedRegistry } from '#layers/server-core/server/utils/orderedRegistry';

const oauthLinkPolicies = createOrderedRegistry<OAuthLinkPolicy>('OAuth link policy');

export function registerOAuthLinkPolicy(policy: OAuthLinkPolicy): void {
  oauthLinkPolicies.register(policy);
}

export async function runOAuthLinkPolicies(ctx: OAuthLinkPolicyContext): Promise<boolean> {
  const policies = oauthLinkPolicies.list();

  for (const policy of policies) {
    if (!(await policy.run(ctx)).allow) {
      return false;
    }
  }

  return true;
}
