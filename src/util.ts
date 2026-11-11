/**
 * Whether a value is a plain object, rather than null, an array or a
 * primitive.
 */
export const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * The `code` of a Node or network error (ENOENT, ECONNREFUSED), if it has
 * one.
 */
export const errorCode = (error: unknown): string | undefined => {
  if (!isObject(error) && !(error instanceof Error)) return undefined;
  const { code } = error as { code?: unknown };
  return typeof code === 'string' ? code : undefined;
};

/**
 * Waits for the given number of milliseconds.
 */
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
