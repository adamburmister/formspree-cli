// The banner's lines as drawn in the brand's ANSI file (f.ans, CP437).
const BANNER_LINES = [
  '██████████',
  '▀▀▀▀▀▀▀▀▀▀',
  '██████████     FormSpree.io',
  '▀▀▀▀▀▀▀▀▀▀',
  '█████',
  '▀▀▀▀▀'
];

/**
 * Where the banner starts among `lines`, or -1 if it isn't there whole.
 */
const bannerAt = lines =>
  lines.findIndex((_line, i) =>
    BANNER_LINES.every((banner, j) => lines[i + j] === banner)
  );

module.exports = { BANNER_LINES, bannerAt };
