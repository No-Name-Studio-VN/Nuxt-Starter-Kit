import type { EmailChangedContext, EmailChangedHook } from '#layers/auth/types/loginPolicies';
import { createOrderedRegistry } from '#layers/server-core/server/utils/orderedRegistry';

const emailChangedHooks = createOrderedRegistry<EmailChangedHook>('Email-changed hook');

export function registerEmailChangedHook(hook: EmailChangedHook): void {
  emailChangedHooks.register(hook);
}

export async function runEmailChangedHooks(ctx: EmailChangedContext): Promise<void> {
  const hooks = emailChangedHooks.list();

  for (const hook of hooks) {
    await hook.run(ctx);
  }
}
