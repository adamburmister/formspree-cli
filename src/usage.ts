/** How many single-character edits turn one word into another. */
const distance = (a: string, b: string): number => {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    const next = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const swap = (row[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      next[j] = Math.min((row[j] ?? 0) + 1, (next[j - 1] ?? 0) + 1, swap);
    }
    row = next;
  }
  return row[b.length] ?? 0;
};

/**
 * The candidate a mistyped word was most likely meant to be, if one is
 * close enough: within two edits, and fewer than half the word.
 */
export const closest = (
  word: string,
  candidates: readonly string[],
): string | undefined => {
  let best: string | undefined;
  let fewest = Math.min(2, Math.floor(word.length / 2)) + 1;

  for (const candidate of candidates) {
    const edits = distance(word.toLowerCase(), candidate.toLowerCase());
    if (edits < fewest) {
      best = candidate;
      fewest = edits;
    }
  }
  return best;
};

/**
 * The command a line of usage is for: `formspree forms create [name]` is
 * for `formspree forms create`.
 */
export const commandOf = (usage: string): string =>
  usage
    .trim()
    .split(/\s+/)
    .filter((word) => !/^[<[]/.test(word))
    .join(' ');

/**
 * Says what's wrong with a command line in terms of what was typed.
 * yargs' own messages name the problem but not the fix: this adds the
 * option that was probably meant, and says what a count of arguments is
 * about.
 *
 * @param options The names of the options the command takes
 * @param usage The command's line of usage, if it's known
 */
export const explain = (
  message: string,
  options: readonly string[],
  usage?: string,
): string => {
  const unknown = /^Unknown arguments?: (.+)$/.exec(message);
  if (unknown?.[1]) {
    const hints = unknown[1]
      .split(', ')
      .map((word) => closest(word, options))
      .filter((option) => option !== undefined)
      .map((option) => `--${option}`);
    const meant = [...new Set(hints)];
    return meant.length
      ? `${message}. Did you mean ${meant.join(' or ')}?`
      : message;
  }

  // For a command it doesn't know, yargs gives only its suggestion.
  if (message.startsWith('Did you mean')) return `Unknown command. ${message}`;

  if (message.startsWith('Not enough non-option arguments')) {
    return usage ? `Missing an argument: ${usage}` : 'Missing an argument';
  }
  return message;
};
