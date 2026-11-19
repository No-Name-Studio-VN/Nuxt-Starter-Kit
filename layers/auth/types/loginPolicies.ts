import type { H3Event } from 'h3';
import type { ApiErrorOptions } from '#layers/server-core/types/api';
import type { User } from '#layers/auth/types/auth';

export interface LoginPolicyContext {
  event: H3Event;
  /** The user who just proved who they are. */
  user: User;
  /** The sign-in method the user proved it with, e.g. 'password'. */
  method: string;
  /** Same-origin path the sign-in continues to once every policy passes. */
  redirectTo: string;
}

/**
 * What a policy decided: let the sign-in go on, answer the request itself
 * (the handler can call `respond` if it supports the challenge), or
 * refuse it with an API error.
 */
export type LoginPolicyOutcome =
  | { kind: 'continue' }
  | { kind: 'respond'; respond: () => unknown }
  | { kind: 'deny'; error: ApiErrorOptions };

/**
 * A check between the proof of identity and the session. Policies run in
 * ascending `order`. Auth's account lock runs at 150; installed layers choose
 * whether their checks run before or after it.
 */
export interface LoginPolicy {
  id: string;
  order: number;
  /** Sign-in method ids the policy applies to; absent means every method. */
  methods?: string[];
  run(ctx: LoginPolicyContext): Promise<LoginPolicyOutcome>;
}
