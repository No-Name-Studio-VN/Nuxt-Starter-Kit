export function isConstraintFailure(error: unknown, constraint: string) {
  // Drizzle may wrap SQLite/libSQL errors. Inspect the actual driver message, not query parameters.
  while (error instanceof Error) {
    if (!(error.cause instanceof Error)) {
      return error.message.includes(constraint);
    }
    error = error.cause;
  }
  return false;
}
