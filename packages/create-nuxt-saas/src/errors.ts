/** An expected, user-facing failure. The CLI prints these without a stack trace. */
export class CliError extends Error {
  override readonly name = 'CliError';
}
