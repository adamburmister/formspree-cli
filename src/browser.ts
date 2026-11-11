import { spawn } from 'node:child_process';

/**
 * Whether there's a browser worth opening: someone is reading the output
 * in a terminal on this machine. Over SSH the browser would open on the
 * machine at the far end.
 *
 * @param output Where the command is writing to whoever ran it
 */
export const available = (
  output: { isTTY?: boolean } = process.stdout,
): boolean =>
  Boolean(output.isTTY) && !process.env.SSH_CONNECTION && !process.env.SSH_TTY;

/** The program each platform opens a URL with, and its arguments. */
const launcher = (url: string): [command: string, args: string[]] => {
  switch (process.platform) {
    case 'darwin':
      return ['open', [url]];
    case 'win32':
      // Not `start`, which needs a shell and its quoting.
      return ['rundll32', ['url.dll,FileProtocolHandler', url]];
    default:
      return ['xdg-open', [url]];
  }
};

/** Whether a link is a web page, and not a file or another program's. */
const isWebPage = (url: string): boolean => {
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
};

/**
 * Opens a web page in the default browser. Resolves with whether it was
 * handed over to be opened: false when the link isn't http or https, or
 * the platform has nothing to open it with.
 */
export const open = (url: string): Promise<boolean> => {
  // The link may have come from the API. Only a web page is opened.
  if (!isWebPage(url)) return Promise.resolve(false);

  return new Promise((resolve) => {
    const [command, args] = launcher(url);
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.once('error', () => resolve(false));
    child.once('spawn', () => {
      // The browser outlives the command.
      child.unref();
      resolve(true);
    });
  });
};
