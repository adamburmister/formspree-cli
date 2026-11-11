import deployment from '@formspree/deploy';
import type { DeployResponse } from '@formspree/deploy';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { command as cmd } from '../../src/cmds/deploy.ts';
import { version } from '../../src/version.ts';
import { muteConsole } from '../helpers/oauth.ts';
import { run } from '../helpers/v1.ts';

vi.mock('@formspree/deploy');
vi.mock('../../src/spinner.ts', () => ({
  start: vi.fn(() => ({ clear: vi.fn() })),
}));

const request = vi.mocked(deployment.request);

/** A deployment's answer, as the tests need it. */
const reply = (
  status: number,
  data: DeployResponse['data'] & { shim?: null },
): Promise<DeployResponse> => Promise.resolve({ status, data });

beforeEach(() => {
  muteConsole();
  vi.stubEnv('MY_SECRET', 'pa$$w0rd');
  vi.stubEnv('API_KEY', '12345');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  request.mockReset();
  // The handler sets process.exitCode = 1 on errors; left set, it becomes
  // the test run's own exit code and fails it.
  process.exitCode = undefined;
});

it('sends a deploy request with the right params', async () => {
  request.mockImplementation((params) => {
    expect(params.config).toStrictEqual({});
    expect(params.force).toBe(false);
    expect(params.key).toBe('xxx');
    expect(params.userAgent).toBe(`@formspree/cli@${version}`);

    return reply(200, { id: 'xxxx-xxxx-xxxx', log: ['Added contact form'] });
  });

  await run(cmd, { config: '{}', key: 'xxx', force: false });
  expect(vi.mocked(console.log).mock.calls).toMatchSnapshot();
});

it('displays general errors', async () => {
  request.mockImplementation(() => {
    return reply(422, {
      code: 'CONFIG_SYNTAX_ERROR',
      errors: [
        {
          message: 'JSON parsing error',
        },
      ],
    });
  });

  await run(cmd, { config: '{}', key: 'xxx' });
  expect(vi.mocked(console.error).mock.calls).toMatchSnapshot();
});

it('displays validation errors', async () => {
  request.mockImplementation(() => {
    return reply(422, {
      code: 'CONFIG_VALIDATION_ERROR',
      errors: [
        {
          field: 'foo.bar.baz',
          message: 'is required',
        },
      ],
    });
  });

  await run(cmd, { config: '{}', key: 'xxx' });
  expect(vi.mocked(console.error).mock.calls).toMatchSnapshot();
});

it('substitutes all referenced environment variables', async () => {
  request.mockImplementation((params) => {
    expect(params.config).toEqual({ mySecret: 'pa$$w0rd', apiKey: '12345' });
    return reply(200, { id: 'xxxx-xxxx-xxxx', shim: null });
  });

  const config = {
    mySecret: '$MY_SECRET',
    apiKey: '$API_KEY',
  };

  await run(cmd, { config: JSON.stringify(config), key: 'xxx' });
  expect(vi.mocked(console.log).mock.calls).toMatchSnapshot();
});

it('throws an error if undefined env vars are referenced', async () => {
  const config = {
    mySecret: '$MY_SECRET_1',
    apiKey: '$API_KEY_1',
  };

  await run(cmd, { config: JSON.stringify(config), key: 'xxx' });
  expect(vi.mocked(console.error).mock.calls).toMatchSnapshot();
});

it('throws an error if apiKey properties do not point to env vars', async () => {
  const config = {
    forms: {
      contactForm: {
        actions: [
          {
            apiKey: 'my-inline-key',
          },
        ],
      },
    },
  };

  await run(cmd, { config: JSON.stringify(config), key: 'xxx' });
  expect(vi.mocked(console.error).mock.calls).toMatchSnapshot();
  expect(vi.mocked(console.log).mock.calls).toMatchSnapshot();
});

it('throws an error if apiSecret properties do not point to env vars', async () => {
  const config = {
    forms: {
      contactForm: {
        actions: [
          {
            apiSecret: 'my-inline-key',
          },
        ],
      },
    },
  };

  await run(cmd, { config: JSON.stringify(config), key: 'xxx' });
  expect(vi.mocked(console.error).mock.calls).toMatchSnapshot();
  expect(vi.mocked(console.log).mock.calls).toMatchSnapshot();
});

it('throws an error if secretKey properties do not point to env vars', async () => {
  const config = {
    forms: {
      contactForm: {
        actions: [
          {
            secretKey: 'my-inline-key',
          },
        ],
      },
    },
  };

  await run(cmd, { config: JSON.stringify(config), key: 'xxx' });
  expect(vi.mocked(console.error).mock.calls).toMatchSnapshot();
  expect(vi.mocked(console.log).mock.calls).toMatchSnapshot();
});

it('skips validating inline secrets with force flag', async () => {
  const config = {
    apiKey: 'my-inline-key',
  };

  request.mockImplementation((params) => {
    expect(params.config).toEqual({ apiKey: 'my-inline-key' });
    expect(params.force).toBe(true);
    return reply(200, { id: 'xxxx-xxxx-xxxx', shim: null });
  });

  await run(cmd, {
    config: JSON.stringify(config),
    key: 'xxx',
    force: true,
  });
  expect(vi.mocked(console.log).mock.calls).toMatchSnapshot();
});

// What console.log was given, parsed: the whole of stdout with --json.
const printed = (): Record<string, unknown> =>
  JSON.parse(
    vi
      .mocked(console.log)
      .mock.calls.map((args) => args.join(' '))
      .join('\n'),
  ) as Record<string, unknown>;

it("prints the deployment's result as JSON with --json", async () => {
  request.mockImplementation(() =>
    reply(200, { id: 'xxxx-xxxx-xxxx', log: ['Added contact form'] }),
  );

  await run(cmd, { config: '{}', key: 'xxx', force: false, json: true });

  expect(printed()).toEqual({
    id: 'xxxx-xxxx-xxxx',
    log: ['Added contact form'],
  });
  expect(process.exitCode).toBeUndefined();
});

it("prints the server's validation errors as JSON with --json", async () => {
  request.mockImplementation(() =>
    reply(422, {
      code: 'CONFIG_VALIDATION_ERROR',
      errors: [{ field: 'name', message: 'is required' }],
    }),
  );

  await run(cmd, { config: '{}', key: 'xxx', force: false, json: true });

  expect(printed()).toMatchObject({
    ok: false,
    error: { code: 'DEPLOY_FAILED', message: 'Deployment failed' },
    reason: 'CONFIG_VALIDATION_ERROR',
    errors: [{ field: 'name', message: 'is required' }],
  });
  expect(console.error).not.toHaveBeenCalled();
  expect(process.exitCode).toBe(1);
});

it('exits with 4, saying how to set it, when there is no deploy key', async () => {
  await run(cmd, { config: '{}', force: false, json: true });

  expect(request).not.toHaveBeenCalled();
  expect(printed()).toMatchObject({
    error: { code: 'DEPLOY_KEY_REQUIRED' },
    next_steps: [{ step: 'set_deploy_key' }],
  });
  expect(process.exitCode).toBe(4);
});

it('exits with 4 when the deploy key is refused', async () => {
  request.mockImplementation(() => reply(401, {}));

  await run(cmd, { config: '{}', key: 'bad', force: false });

  expect(vi.mocked(console.error).mock.calls.flat().join('\n')).toContain(
    'Deploy key is not valid',
  );
  expect(process.exitCode).toBe(4);
});

it('names the properties that must come from the environment, with --json', async () => {
  const config = JSON.stringify({ apiKey: 'inline-secret' });

  await run(cmd, { config, key: 'xxx', force: false, json: true });

  expect(request).not.toHaveBeenCalled();
  expect(printed()).toMatchObject({
    error: { code: 'CONFIG_INVALID' },
    properties: ['apiKey'],
  });
  // The secret itself is never printed back.
  expect(JSON.stringify(printed())).not.toContain('inline-secret');
  expect(process.exitCode).toBe(1);
});
