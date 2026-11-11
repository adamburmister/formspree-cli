const OFF = new Set(['', '0', 'false']);

/**
 * Whether output to a stream is dressed for a terminal: the banner, and
 * the borders of notes and boxes. Piped to a file or another program it's
 * plain text, so there's nothing to strip out and less to read.
 *
 * FORCE_COLOR asks for the terminal's look where there's no terminal, as
 * it does for colors.
 */
export const styled = (
  stream: { isTTY?: boolean } = process.stdout,
): boolean => {
  const forced = process.env.FORCE_COLOR;
  return (
    Boolean(stream.isTTY) ||
    (forced !== undefined && !OFF.has(forced.toLowerCase()))
  );
};
