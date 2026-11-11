import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { output } from './helpers/oauth.ts';
import {
  EXIT,
  UsageError,
  body,
  exitFor,
  exitForStatus,
  report,
} from '../src/failure.ts';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  process.exitCode = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

describe('exit codes', () => {
  it.each([
    ['INVALID_USAGE', EXIT.usage],
    ['MISSING_ARGUMENT', EXIT.usage],
    ['CONFIRMATION_REQUIRED', EXIT.usage],
    ['INVALID_INPUT', EXIT.usage],
    ['NOT_LOGGED_IN', EXIT.auth],
    ['INVALID_KEY', EXIT.auth],
    ['DEPLOY_KEY_REQUIRED', EXIT.auth],
    ['INVALID_DEPLOY_KEY', EXIT.auth],
    ['REQUEST_FAILED', EXIT.failure],
    ['ALREADY_EXISTS', EXIT.failure],
    ['UNEXPECTED', EXIT.failure],
  ] as const)('%s exits with %i', (code, exit) => {
    expect(exitFor(code)).toBe(exit);
  });

  it.each([
    [401, 4],
    [404, 3],
    [403, 1],
    [409, 1],
    [422, 1],
    [500, 1],
  ])('a %i from the API exits with %i', (status, exit) => {
    expect(exitForStatus(status)).toBe(exit);
  });

  it('keeps the codes apart, and 130 for an interrupt', () => {
    expect(EXIT).toEqual({
      failure: 1,
      usage: 2,
      notFound: 3,
      auth: 4,
      interrupted: 130,
    });
  });
});

describe('body', () => {
  it("has the fields of the API's problems that a caller branches on", () => {
    expect(
      body({ code: 'INVALID_USAGE', message: 'Unknown argument: x' }),
    ).toEqual({
      ok: false,
      error: { code: 'INVALID_USAGE', message: 'Unknown argument: x' },
      detail: 'Unknown argument: x',
      retryable: false,
    });
  });

  it('lists what to do next, with a command where there is one to run', () => {
    const next = [
      {
        step: 'log_in',
        detail: 'Run formspree login.',
        command: 'formspree login',
      },
    ];

    expect(
      body({ code: 'NOT_LOGGED_IN', message: 'Not logged in', next })
        .next_steps,
    ).toEqual(next);
  });

  it('drops the colors of a message written for the terminal', () => {
    const colored = 'Project Site \u001b[90m(proj_1)\u001b[39m has 2 forms';

    const printed = body({ code: 'CONFIRMATION_REQUIRED', message: colored });

    expect(printed.detail).toBe('Project Site (proj_1) has 2 forms');
    expect(printed.error).toEqual({
      code: 'CONFIRMATION_REQUIRED',
      message: 'Project Site (proj_1) has 2 forms',
    });
  });

  it('says when the same command is worth another try', () => {
    expect(
      body({ code: 'REQUEST_FAILED', message: 'x', retryable: true }).retryable,
    ).toBe(true);
  });

  it('carries extra fields beside the standard ones', () => {
    const printed = body({
      code: 'DEPLOY_FAILED',
      message: 'Deployment failed',
      extra: { errors: [{ message: 'no' }] },
    });

    expect(printed.errors).toEqual([{ message: 'no' }]);
    expect(printed.ok).toBe(false);
  });
});

describe('report', () => {
  const failure = {
    code: 'CONFIRMATION_REQUIRED',
    message: 'Pass --yes',
  } as const;

  it('prints JSON on stdout with --json, and nothing on stderr', () => {
    report({ json: true }, failure);

    expect(JSON.parse(output(console.log)).error.code).toBe(
      'CONFIRMATION_REQUIRED',
    );
    expect(console.error).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it('prints the message as an error without --json', () => {
    report({}, failure);

    expect(output(console.error)).toContain('Pass --yes');
    expect(console.log).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it('lets the command say it its own way without --json', () => {
    const human = vi.fn();

    report({}, failure, human);

    expect(human).toHaveBeenCalledTimes(1);
    expect(console.error).not.toHaveBeenCalled();
  });

  it('ignores that way with --json', () => {
    const human = vi.fn();

    report({ json: true }, failure, human);

    expect(human).not.toHaveBeenCalled();
  });
});

describe('UsageError', () => {
  it('is INVALID_USAGE with nothing to do next, unless told', () => {
    const error = new UsageError('Nothing to change');

    expect(error.code).toBe('INVALID_USAGE');
    expect(error.next).toEqual([]);
  });

  it('carries its reason and next steps', () => {
    const next = [{ step: 'confirm', detail: 'Add --yes.' }];
    const error = new UsageError('Pass --yes', {
      code: 'CONFIRMATION_REQUIRED',
      next,
    });

    expect(error.code).toBe('CONFIRMATION_REQUIRED');
    expect(error.next).toEqual(next);
  });
});
