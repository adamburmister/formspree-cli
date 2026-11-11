type Leaf = string | number | boolean | null;

/**
 * Calls `visit` with the key and value of every leaf of a JSON value:
 * each property that isn't itself an object or an array. Leaves directly
 * inside an array have no key, so they're skipped.
 */
export const traverse = (
  value: unknown,
  visit: (key: string, value: Leaf) => void,
): void => {
  if (value === null || typeof value !== 'object') return;

  if (Array.isArray(value)) {
    for (const element of value) traverse(element, visit);
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (child !== null && typeof child === 'object') {
      traverse(child, visit);
    } else {
      visit(key, child as Leaf);
    }
  }
};
