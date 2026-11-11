export const BANNER_LINES = [
  ' ██████████',
  ' ▀▀▀▀▀▀▀▀▀▀',
  ' ██████████     Formspree.io',
  ' ▀▀▀▀▀▀▀▀▀▀',
  ' █████',
  ' ▀▀▀▀▀',
];

/** Where the banner starts among `lines`, or -1 if it isn't there whole. */
export const bannerAt = (lines: readonly string[]): number =>
  lines.findIndex((_line, i) =>
    BANNER_LINES.every((banner, j) => lines[i + j] === banner),
  );
