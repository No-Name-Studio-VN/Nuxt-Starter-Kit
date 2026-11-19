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
        onSuccess(event, result) {
          const account = oauthProfileSchema.safeParse(definition.toAccount(result));
          if (!account.success) {
            return onError(event, {
              statusMessage: 'OAuth provider did not return a valid account ID and email.',
            });
          }

          return onSuccess(event, account.data);
        },
        onError,
      }),
  };
}
