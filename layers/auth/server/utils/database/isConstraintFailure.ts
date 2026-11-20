export function isConstraintFailure(error: unknown, constraint: string) {
  // Drizzle may wrap SQLite/libSQL errors. Inspect the actual driver message, not query parameters.
  if (!(error instanceof Error)) return false;

  const seen = new Set<Error>();
  let driverError = error;
  while (driverError.cause instanceof Error) {
    if (seen.has(driverError)) return false;
    seen.add(driverError);
    driverError = driverError.cause;
  }
  return driverError.message.includes(constraint);
}
