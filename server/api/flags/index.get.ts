import { success } from '~~/server/utils/apiResponse';
import type { FlagContext } from '~~/types/featureFlags';
import { getAllFlags, getUserFlagContext } from '~~/server/utils/featureFlags';

/**
 * Public evaluation API: returns all flag values for the current session user.
 * If no user session exists, evaluates with empty context (most flags will be off).
 * This endpoint is called by the client composable during SSR.
 */
export default defineEventHandler(async (event) => {
  // Build context from session (if available)
  let context: FlagContext = {};

  try {
    const session = await getUserSession(event);
    if (session?.user) {
      context = getUserFlagContext(session.user);
    }
  } catch {
    // No session — that's fine, evaluate with empty context
  }

  const flags = await getAllFlags(context);
  return success(flags);
});
