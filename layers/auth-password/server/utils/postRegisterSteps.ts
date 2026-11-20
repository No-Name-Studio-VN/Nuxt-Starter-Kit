import type {
  PostRegisterContext,
  PostRegisterResult,
  PostRegisterStep,
} from '#layers/auth-password/types/postRegister';

import { createOrderedRegistry } from '#layers/server-core/server/utils/orderedRegistry';

// Filled once by Nitro plugins; shared by every request.
const postRegisterSteps = createOrderedRegistry<PostRegisterStep>('Post-register step');

/** Throws when the id is taken, so no module can silently replace another's step. */
export function registerPostRegisterStep(step: PostRegisterStep): void {
  postRegisterSteps.register(step);
}

/**
 * Runs every registered step in ascending `order`. All of them run; when more
 * than one returns a redirect, the last one wins.
 */
export async function runPostRegisterSteps(ctx: PostRegisterContext): Promise<PostRegisterResult> {
  const steps = postRegisterSteps.list();
  let redirect: string | undefined;

  for (const step of steps) {
    const result = await step.run(ctx);
    if (result.redirect !== undefined) {
      redirect = result.redirect;
    }
  }

  return redirect === undefined ? {} : { redirect };
}
