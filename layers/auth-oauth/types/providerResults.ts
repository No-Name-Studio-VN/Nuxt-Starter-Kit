type HandlerResult<Config extends { onSuccess: (event: never, result: never) => unknown }> =
  Parameters<Config['onSuccess']>[1];

export type GitHubOAuthResult = HandlerResult<Parameters<typeof defineOAuthGitHubEventHandler>[0]>;
export interface OidcOAuthResult {
  user: {
    sub?: unknown;
    email?: unknown;
    name?: unknown;
    preferred_username?: unknown;
    picture?: unknown;
  };
}

export interface GoogleOAuthResult {
  user: { sub?: unknown; email?: unknown; name?: unknown; picture?: unknown };
}

export interface DiscordOAuthResult {
  user: {
    id?: unknown;
    email?: unknown;
    global_name?: unknown;
    username?: unknown;
    avatar?: unknown;
  };
}
