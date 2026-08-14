import { CliError } from '../errors';

/**
 * A commit id, short or full. Anything else — `main`, `next`, `v2.2.1` — is a ref
 * whose meaning depends on when you ask.
 *
 * Seven hex characters is git's own threshold for an abbreviated id, so a branch
 * named `deadbeef` reads as a commit here. Git is ambiguous in exactly the same
 * way, and the cost is a pinned project rather than a wrong one.
 */
const COMMIT_ID = /^[0-9a-f]{7,40}$/;

export function isCommitId(revision: string): boolean {
  return COMMIT_ID.test(revision);
}

/** `github:owner/repo` and `github:owner/repo/subdir`, with an optional `#ref`. */
const GITHUB_TEMPLATE = /^github:([^/#]+\/[^/#]+)/;

export interface ResolveRevisionOptions {
  /** The giget template the registry names, e.g. `github:owner/repo`. */
  template: string;
  /** What the registry declares: a branch, a tag, or a commit id. */
  revision: string;
  /** Set when `--kit` names a checkout; nothing is downloaded, so nothing resolves. */
  localKitRoot?: string;
}

/**
 * Spreadable `localKitRoot`, for callers holding a `resolveLocalKit` callback.
 * Written as a spread because `exactOptionalPropertyTypes` distinguishes an
 * absent property from one explicitly set to `undefined`.
 */
export function localKitOption(
  resolveLocalKit: ((revision: string) => string | undefined) | undefined,
  revision: string,
): { localKitRoot?: string } {
  const root = resolveLocalKit?.(revision);
  return root === undefined ? {} : { localKitRoot: root };
}

function authorization(): Record<string, string> {
  const token = process.env.GIGET_AUTH ?? process.env.GITHUB_TOKEN;
  return token ? { authorization: `Bearer ${token}` } : {};
}

/**
 * Pins a branch to the commit it points at right now.
 *
 * The registry names a channel so that a project can follow one — and so anyone
 * can point `kit.template` at their own fork and branch. A project cannot follow
 * it, though: upgrading re-renders the revision the project came from and
 * three-way merges it against the new one, so the revision recorded in a manifest
 * has to keep meaning the same tree forever. Recording `main` would make an
 * upgrade compare the new tree against itself, find no upstream change, and
 * report success having done nothing.
 *
 * So the channel is resolved once, at the moment a project is generated or
 * upgraded, and the commit it resolved to is what gets written down.
 */
export async function resolveRevision(options: ResolveRevisionOptions): Promise<string> {
  // A local checkout is whatever is on disk; there is no remote to ask, and the
  // declared revision is only a label for it.
  if (options.localKitRoot !== undefined) return options.revision;
  if (isCommitId(options.revision)) return options.revision;

  const repository = GITHUB_TEMPLATE.exec(options.template)?.[1];
  if (repository === undefined) {
    throw new CliError(
      `Registry kit.revision is "${options.revision}", which is a branch or tag rather than a commit id, and only github: templates can resolve one. Pin kit.revision to a commit id, or use --kit with a local checkout.`,
    );
  }

  const endpoint = `https://api.github.com/repos/${repository}/commits/${options.revision}`;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: { accept: 'application/vnd.github.sha', ...authorization() },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    throw new CliError(`Unable to reach GitHub to resolve "${options.revision}": ${message}`);
  }

  if (!response.ok) {
    throw new CliError(
      `Unable to resolve "${options.revision}" in ${repository}: GitHub answered ${response.status}. Check that the branch exists${response.status === 403 ? ', or set GITHUB_TOKEN if you are being rate limited' : ''}.`,
    );
  }

  const sha = (await response.text()).trim();
  if (!isCommitId(sha)) {
    throw new CliError(`GitHub returned "${sha}" for "${options.revision}", which is not a commit.`);
  }
  return sha;
}
