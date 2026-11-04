const BANNER_LINES = [
  ' ██████████',
  ' ▀▀▀▀▀▀▀▀▀▀',
  ' ██████████     Formspree.io',
  ' ▀▀▀▀▀▀▀▀▀▀',
  ' █████',
  ' ▀▀▀▀▀'
];

/**
 * Where the banner starts among `lines`, or -1 if it isn't there whole.
 */
const bannerAt = lines =>
  lines.findIndex((_line, i) =>
    BANNER_LINES.every((banner, j) => lines[i + j] === banner)
  );

module.exports = { BANNER_LINES, bannerAt };
