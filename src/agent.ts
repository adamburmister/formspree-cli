/**
 * The environment variables AI coding agents set in the commands they
 * run. `AI_AGENT` is the one agents are settling on; the rest are each
 * agent's own, for the ones that don't set it yet.
 */
export const AGENT_VARIABLES = [
  'AI_AGENT',
  'CLAUDECODE',
  'CLAUDE_CODE',
  'CURSOR_AGENT',
  'CODEX_SANDBOX',
  'CODEX_CI',
  'CODEX_THREAD_ID',
  'GEMINI_CLI',
  'OPENCODE',
  'COPILOT_AGENT',
  'COPILOT_CLI',
  'AUGMENT_AGENT',
  'ANTIGRAVITY_AGENT',
] as const;

const OFF = new Set(['', '0', 'false']);

/**
 * The variable that says an AI agent is running the command, if one is
 * set. It's a hint about who's reading the output, and nothing more: it
 * decides how a result is printed, never what a command may do.
 */
export const detected = (
  env: NodeJS.ProcessEnv = process.env,
): string | undefined =>
  AGENT_VARIABLES.find((name) => {
    const value = env[name];
    return value !== undefined && !OFF.has(value.toLowerCase());
  });

/**
 * Whether a command should print JSON without being asked: an agent is
 * running it and reading what it prints. A person at a terminal gets the
 * usual output, even inside an agent's session.
 */
export const prefersJson = (): boolean =>
  detected() !== undefined && !process.stdout.isTTY;

/** What every --json option says about that, for `--help`. */
export const JSON_BY_DEFAULT =
  'On by default when an AI agent runs the command; --no-json turns it off';
