import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { plain } from './helpers/oauth.ts';
import { box, note } from '../src/prompt.ts';

// The real @clack/prompts: these check what it draws for the CLI.

let stdout: string;
let stderr: string;

beforeEach(() => {
  stdout = '';
  stderr = '';
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    stdout += String(chunk);
    return true;
  });
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    stderr += String(chunk);
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const lines = (text: string): string[] => plain(text).trimEnd().split('\n');

describe('box', () => {
  it('frames the text under its title, as wide as the text, with round corners', () => {
    box('<form>\n  <button>Send</button>\n</form>', 'HTML');

    expect(lines(stdout)).toEqual([
      '╭─ HTML ─────────────────────╮',
      '│  <form>                    │',
      '│    <button>Send</button>   │',
      '│  </form>                   │',
      '╰────────────────────────────╯',
    ]);
    expect(stderr).toBe('');
  });

  it('goes to stderr when it belongs to an error', () => {
    box('- Upgrade the plan.', 'Next steps', { stderr: true });

    expect(lines(stderr)[0]).toMatch(/^╭─ Next steps ─+╮$/);
    expect(stdout).toBe('');
  });

  it("leaves the text's colors as they are", () => {
    const colored = '\u001b[36mhttps://formspree.io\u001b[39m';

    box(colored, 'Next steps');

    expect(stdout).toContain(colored);
  });
});

describe('note', () => {
  const DETAILS = 'Submit to  https://formspree.io/f/xyzabcde\nreCAPTCHA  off';

  it('sets the text apart under its title, closed on its own', () => {
    note(DETAILS, 'Form details');

    expect(lines(stdout)).toEqual([
      '◇  Form details ───────────────────────────────╮',
      '│                                              │',
      '│  Submit to  https://formspree.io/f/xyzabcde  │',
      '│  reCAPTCHA  off                              │',
      '│                                              │',
      '╰──────────────────────────────────────────────╯',
    ]);
    expect(stderr).toBe('');
  });

  it('joins the line of the questions above it with `guide`', () => {
    note(DETAILS, 'Form details', { guide: true });

    const drawn = lines(stdout);
    expect(drawn[0]).toBe('│');
    expect(drawn[1]).toMatch(/^◇ {2}Form details ─+╮$/);
    // Left open at the bottom, for the session's outro to close.
    expect(drawn.at(-1)).toMatch(/^├─+╯$/);
  });

  it("leaves the text's colors as they are, not dimmed", () => {
    const colored = '\u001b[36mhttps://formspree.io\u001b[39m';

    note(colored, 'Form details');

    expect(stdout).toContain(colored);
    expect(stdout).not.toContain('\u001b[2m\u001b[36m');
  });
});
