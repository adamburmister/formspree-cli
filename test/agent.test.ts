import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AGENT_VARIABLES, detected, prefersJson } from '../src/agent.ts';
import { styled } from '../src/terminal.ts';

const tty = (value: boolean): void => {
  Object.defineProperty(process.stdout, 'isTTY', {
    value,
    configurable: true,
  });
};

beforeEach(() => {
  // The tests may themselves be run by an agent.
  for (const name of AGENT_VARIABLES) vi.stubEnv(name, '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  Reflect.deleteProperty(process.stdout, 'isTTY');
});

describe('detected', () => {
  it('is undefined when no agent variable is set', () => {
    expect(detected({})).toBeUndefined();
  });

  it.each(AGENT_VARIABLES)('names %s when it is set', (name) => {
    expect(detected({ [name]: '1' })).toBe(name);
  });

  it('takes any value of AI_AGENT, which names the agent and its version', () => {
    expect(detected({ AI_AGENT: 'claude-code_2-1-321_agent' })).toBe(
      'AI_AGENT',
    );
  });

  it.each(['', '0', 'false', 'FALSE'])('takes %j as not set', (value) => {
    expect(detected({ AI_AGENT: value, CLAUDECODE: value })).toBeUndefined();
  });

  it('reads the environment when given none', () => {
    vi.stubEnv('GEMINI_CLI', '1');

    expect(detected()).toBe('GEMINI_CLI');
  });
});

describe('prefersJson', () => {
  it('is true for an agent reading the output', () => {
    vi.stubEnv('AI_AGENT', 'test');
    tty(false);

    expect(prefersJson()).toBe(true);
  });

  it("is false for a person at a terminal, even in an agent's session", () => {
    vi.stubEnv('AI_AGENT', 'test');
    tty(true);

    expect(prefersJson()).toBe(false);
  });

  it('is false for a pipe with no agent behind it', () => {
    tty(false);

    expect(prefersJson()).toBe(false);
  });
});

describe('styled', () => {
  it('is true for a terminal', () => {
    vi.stubEnv('FORCE_COLOR', '');

    expect(styled({ isTTY: true })).toBe(true);
  });

  it.each(['', '0', 'false'])(
    'is false for a pipe, with FORCE_COLOR=%j',
    (value) => {
      vi.stubEnv('FORCE_COLOR', value);

      expect(styled({ isTTY: false })).toBe(false);
      expect(styled({})).toBe(false);
    },
  );

  it.each(['1', '3', 'true'])(
    'is true for a pipe when FORCE_COLOR=%j asks for the look',
    (value) => {
      vi.stubEnv('FORCE_COLOR', value);

      expect(styled({ isTTY: false })).toBe(true);
    },
  );
});
