import type { H3Event } from 'h3';
import type { User } from '#layers/auth/types/auth';

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
