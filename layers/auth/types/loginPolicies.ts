import type { H3Event } from 'h3';
import type { ApiErrorOptions } from '#layers/server-core/types/api';
import type { User } from '#layers/auth/types/auth';

export interface LoginPolicyContext {
  event: H3Event;
  /** The user whose username and password were just verified. */
  user: User;
  /** Same-origin path the sign-in continues to once every policy passes. */
  redirectTo: string;
}

/**
 * What a policy decided: let the sign-in go on, answer the request itself
 * (`body` is returned by the handler as-is, e.g. a redirect to a challenge), or
 * refuse it with an API error.
 */
export type LoginPolicyOutcome =
  | { kind: 'continue' }
  | { kind: 'respond'; body: unknown }
  | { kind: 'deny'; error: ApiErrorOptions };

/**
 * A check between the password check and the session. Policies run in ascending
 * `order`: email verification (100), the account lock (150, auth's own) and the
 * second factor (200).
 */
export interface LoginPolicy {
  id: string;
  order: number;
  run(ctx: LoginPolicyContext): Promise<LoginPolicyOutcome>;
}

export interface PostRegisterContext {
  event: H3Event;
  /** The account that was just created. */
  user: User;
  /** Same-origin path the new account should end up on after signing in. */
  redirectTo: string;
}

export interface PostRegisterResult {
  /** Where to send the new account instead of the sign-in page. */
  redirect?: string;
}

/** Work that runs once a password registration has created the account. */
export interface PostRegisterStep {
  id: string;
  order: number;
  run(ctx: PostRegisterContext): Promise<PostRegisterResult>;
}
