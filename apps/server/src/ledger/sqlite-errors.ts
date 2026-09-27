// better-sqlite3 reports constraint failures with an extended result code.
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
      error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY')
  );
}

/** Runs a write and turns a unique-constraint failure into `conflict()`. */
export async function uniquely<T>(
  write: () => Promise<T>,
  conflict: () => Error,
): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict();
    throw error;
  }
}
