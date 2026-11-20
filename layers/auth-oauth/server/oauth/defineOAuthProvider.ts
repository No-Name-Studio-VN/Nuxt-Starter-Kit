import { oauthCredentialsSchema, oauthProfileSchema } from '../../shared/schemas/oauthSchema';
import type {
  OAuthProvider,
  OAuthProviderDefinition,
  OAuthProviderId,
} from '../../types/providers';

export function defineOAuthProvider<Id extends OAuthProviderId, Result>(
  definition: OAuthProviderDefinition<Id, Result>,
): OAuthProvider<Id> {
  return {
    id: definition.id,
    credentialsSchema: definition.credentialsSchema ?? oauthCredentialsSchema,
    createHandler: ({ onSuccess, onError }) =>
      definition.createHandler({
        async onSuccess(event, result) {
          const account = oauthProfileSchema.safeParse(await definition.toAccount(result));
          if (!account.success) {
            return onError(event, {
              statusMessage: 'OAuth provider did not return a valid account identity.',
            });
          }

          return onSuccess(event, account.data);
        },
        onError,
      }),
  };
}
