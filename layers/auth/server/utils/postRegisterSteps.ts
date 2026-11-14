import type {
  PostRegisterContext,
  PostRegisterResult,
  PostRegisterStep,
} from '#layers/auth/types/loginPolicies';

// Filled once by Nitro plugins; shared by every request.
const postRegisterSteps = new Map<string, PostRegisterStep>();

/** Throws when the id is taken, so no module can silently replace another's step. */
export function registerPostRegisterStep(step: PostRegisterStep): void {
  if (postRegisterSteps.has(step.id)) {
    throw new Error(`Post-register step "${step.id}" is already registered.`);
  }

  postRegisterSteps.set(step.id, step);
}

/**
 * Runs every registered step in ascending `order`. All of them run; when more
 * than one returns a redirect, the last one wins.
 */
export async function runPostRegisterSteps(ctx: PostRegisterContext): Promise<PostRegisterResult> {
  const steps = [...postRegisterSteps.values()].sort((a, b) => a.order - b.order);
  let redirect: string | undefined;

  for (const step of steps) {
    const result = await step.run(ctx);
    if (result.redirect !== undefined) {
      redirect = result.redirect;
    }
  }

  return redirect === undefined ? {} : { redirect };
}
