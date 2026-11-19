# OAuth sign-in

Set `auth.oauth` in `site.config.ts` to the provider IDs you want, in button order. For example,
`oauth: ['github']` enables GitHub. Set the matching `NUXT_OAUTH_*_CLIENT_ID` and
`NUXT_OAUTH_*_CLIENT_SECRET` values from `.env.example`. Register `/api/auth/<provider>` on your site
as the callback URL with the provider.

The supported IDs are `google`, `github`, `discord`, and `oidc`. For `oidc`, set
`NUXT_OAUTH_OIDC_OPENID_CONFIG` to the discovery URL for one issuer. The issuer's UserInfo endpoint
must return `sub` and `email`. Don't change issuers after linking accounts, since the issuer defines
what an existing `sub` means.

The login and registration pages show only providers with credentials. The server logs missing
configuration at startup. Google One Tap is not mounted.

To add a provider, define its handler and account mapping in `server/oauth/providers/`. Add it to
`server/oauth/registry.ts` and add its label and icon to `shared/constants/oauthProviders.ts`.
List its environment keys in `.env.example` and claim them in `module.json`.
