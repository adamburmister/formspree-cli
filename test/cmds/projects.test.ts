import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useTempConfigDir,
  oauthError,
  tokenResponse,
  deviceResponse,
  output,
  plain,
  response,
} from '../helpers/oauth.ts';
import {
  login,
  answer,
  requests,
  headers,
  problem,
  run,
  request,
  post,
} from '../helpers/v1.ts';
import chalk from 'chalk';
import type { Account } from '../../src/types.ts';
import { CTRL_C, setTTY, unsetTTY, answerPrompts } from '../helpers/clack.ts';
import { bannerAt } from '../helpers/banner.ts';
import { command as list } from '../../src/cmds/projects/list.ts';
import { command as get } from '../../src/cmds/projects/get.ts';
import { command as create } from '../../src/cmds/projects/create.ts';
import { command as rename } from '../../src/cmds/projects/rename.ts';
import { command as del } from '../../src/cmds/projects/delete.ts';
import * as browser from '../../src/browser.ts';
import { sleep } from '../../src/util.ts';

vi.mock('axios');
vi.mock('@clack/prompts', () => import('../helpers/clack.ts'));
vi.mock('../../src/browser.ts', () => ({
  available: vi.fn(() => false),
  open: vi.fn(),
}));
vi.mock('../../src/util.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/util.ts')>()),
  sleep: vi.fn(),
}));

const project = {
  id: 'proj_2pn3r0jq7zz0t',
  account_id: 'acct_7d3f9a2c8e1b4f6a0c55',
  kind: 'dashboard',
  name: 'Marketing site',
  timezone: 'UTC',
  domain_whitelist: null,
  connections: null,
  links: {
    self: 'https://formspree.io/api/v1/projects/proj_2pn3r0jq7zz0t',
    account: 'https://formspree.io/api/v1/accounts/acct_7d3f9a2c8e1b4f6a0c55',
    forms: 'https://formspree.io/api/v1/forms?project_id=proj_2pn3r0jq7zz0t',
    dashboard: 'https://formspree.io/projects/3122252403177421850',
  },
};

const createStep = {
  step: 'create_form',
  detail: "POST /api/v1/forms with this project's id as project_id.",
  url: 'https://formspree.io/api/v1/forms',
};

let credentialsFile: string;

beforeEach(() => {
  credentialsFile = useTempConfigDir();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  // No browser to open, unless a test says there is one.
  vi.mocked(browser.available).mockReset().mockReturnValue(false);
  vi.mocked(browser.open).mockReset().mockResolvedValue(true);
  process.exitCode = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  request.mockReset();
  post.mockReset();
  delete process.env.FORMSPREE_API_KEY;
  unsetTTY();
  process.exitCode = undefined;
});

describe('projects list', () => {
  it('lists the projects the login can see', async () => {
    login(credentialsFile);
    answer(200, { projects: [project], links: { self: 'x' } });

    await run(list, {});

    expect(requests()).toEqual([
      { method: 'get', url: 'https://formspree.io/api/v1/projects' },
    ]);
    expect(headers().Authorization).toBe('Bearer fso_access_0');
    expect(output(console.log)).toContain(
      'Marketing site (proj_2pn3r0jq7zz0t)',
    );
    expect(process.exitCode).toBeUndefined();
  });

  it('narrows to one account with --account', async () => {
    login(credentialsFile);
    answer(200, { projects: [] });

    await run(list, { account: 'acct_7d3f9a2c8e1b4f6a0c55' });

    expect(requests()[0]?.params).toEqual({
      account_id: 'acct_7d3f9a2c8e1b4f6a0c55',
    });
    expect(output(console.log)).toContain('No projects yet');
  });

  it('prints only the response with --json', async () => {
    login(credentialsFile);
    const body = { projects: [project], links: { self: 'x' } };
    answer(200, body);

    await run(list, { json: true });

    expect(JSON.parse(output(console.log))).toEqual(body);
  });

  it('uses an API key in place of the login', async () => {
    process.env.FORMSPREE_API_KEY = 'fsk_from_env';
    answer(200, { projects: [] });

    await run(list, {});

    expect(headers().Authorization).toBe('Bearer fsk_from_env');
  });

  it('asks to log in when there is no login or key', async () => {
    await run(list, {});

    expect(request).not.toHaveBeenCalled();
    expect(output(console.error)).toContain('formspree login');
    expect(process.exitCode).toBe(4);
  });

  it("shows the server's reason when a key is rejected", async () => {
    answer(401, { detail: 'This API key was revoked.' });

    await run(list, { key: 'fsk_revoked' });

    expect(output(console.error)).toContain('This API key was revoked.');
    expect(output(console.error)).toContain('FORMSPREE_API_KEY');
    expect(output(console.error)).not.toContain('formspree login');
    expect(process.exitCode).toBe(4);
  });

  it('prints the refusal of a key as JSON with --json', async () => {
    const refusal = problem(401, 'This API key was revoked.');
    answer(401, refusal);

    await run(list, { key: 'fsk_revoked', json: true });

    expect(JSON.parse(output(console.log))).toEqual(refusal);
    expect(console.error).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(4);
  });

  it('prints the refusal of a login as JSON with --json', async () => {
    login(credentialsFile);
    const refusal = problem(401, 'This token was revoked.');
    answer(401, refusal);
    post.mockImplementation(() => tokenResponse('1'));

    await run(list, { json: true });

    expect(request).toHaveBeenCalledTimes(2);
    expect(JSON.parse(output(console.log))).toEqual(refusal);
    expect(console.error).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(4);
  });

  it('prints the refusal as JSON with --json when the login cannot be refreshed', async () => {
    login(credentialsFile);
    const refusal = problem(401, 'This token was revoked.');
    answer(401, refusal);
    post.mockImplementation(() => oauthError('invalid_grant'));

    await run(list, { json: true });

    expect(request).toHaveBeenCalledTimes(1);
    expect(JSON.parse(output(console.log))).toEqual(refusal);
    expect(console.error).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(4);
  });

  it('asks to log in again, without --json, when the login cannot be refreshed', async () => {
    login(credentialsFile);
    answer(401, problem(401, 'This token was revoked.'));
    post.mockImplementation(() => oauthError('invalid_grant'));

    await run(list, {});

    expect(console.log).not.toHaveBeenCalled();
    expect(output(console.error)).toContain(
      'Your login has expired or was revoked',
    );
    expect(output(console.error)).toContain('formspree login');
    expect(process.exitCode).toBe(4);
  });

  it('says so as JSON with --json when a refused key gets no problem back', async () => {
    answer(401, '');

    await run(list, { key: 'fsk_revoked', json: true });

    // The CLI's own failure, in the shape of the API's problems.
    expect(JSON.parse(output(console.log))).toEqual({
      ok: false,
      error: { code: 'INVALID_KEY', message: 'The API key was not accepted' },
      detail: 'The API key was not accepted',
      retryable: false,
      next_steps: [
        {
          step: 'check_key',
          detail: 'Check the --key flag or the FORMSPREE_API_KEY env variable.',
        },
      ],
    });
    expect(console.error).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(4);
  });

  it('says there is no login as JSON with --json, with the command to run', async () => {
    await run(list, { json: true });

    const printed = JSON.parse(output(console.log));
    expect(printed.error).toEqual({
      code: 'NOT_LOGGED_IN',
      message: 'Not logged in',
    });
    // The login it points at is the one an agent can hand to a person.
    expect(printed.next_steps[0].command).toBe('formspree login --json');
    expect(printed.next_steps[1].step).toBe('or_use_key');
    expect(console.error).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(4);
  });

  it('says so as JSON with --json when the server cannot be reached', async () => {
    login(credentialsFile);
    request.mockRejectedValue(
      Object.assign(new Error('connect'), { code: 'ECONNREFUSED' }),
    );

    await run(list, { json: true });

    const printed = JSON.parse(output(console.log));
    expect(printed.error.code).toBe('REQUEST_FAILED');
    expect(printed.detail).toContain('ECONNREFUSED');
    // Nothing reached the API: the same command can be tried again.
    expect(printed.retryable).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  it('says what failed when the server cannot be reached', async () => {
    login(credentialsFile);
    request.mockImplementation(() =>
      Promise.reject(
        Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }),
      ),
    );

    await run(list, {});

    expect(output(console.error)).toContain(
      'Request failed unexpectedly (ECONNREFUSED from https://formspree.io)',
    );
    expect(process.exitCode).toBe(1);
  });
});

describe('projects get', () => {
  it('shows one project', async () => {
    login(credentialsFile);
    answer(200, { project });

    await run(get, { project: 'proj_2pn3r0jq7zz0t' });

    expect(requests()).toEqual([
      {
        method: 'get',
        url: 'https://formspree.io/api/v1/projects/proj_2pn3r0jq7zz0t',
      },
    ]);
    const shown = output(console.log);
    expect(shown).toContain('Marketing site (proj_2pn3r0jq7zz0t)');
    expect(shown).toContain('acct_7d3f9a2c8e1b4f6a0c55');
    expect(shown).toContain(
      'https://formspree.io/projects/3122252403177421850',
    );
  });

  it("shows the problem's detail for an id the login can't see", async () => {
    login(credentialsFile);
    answer(
      404,
      problem(
        404,
        'Nothing with that id exists on the accounts this key can use.',
        {
          next_steps: [
            {
              step: 'List what this key can see',
              detail: 'GET /api/v1/projects returns every id you can use.',
            },
          ],
        },
      ),
    );

    await run(get, { project: 'proj_nope' });

    const shown = output(console.error);
    expect(shown).toContain('Nothing with that id exists');
    expect(shown).toContain('(404)');
    // A step with no link is written for API callers, not CLI users.
    expect(shown).not.toContain('GET /api/v1/projects');
    expect(process.exitCode).toBe(3);
  });

  it('escapes an id before it goes in the path', async () => {
    login(credentialsFile);
    answer(404, problem(404, 'Not found'));

    await run(get, { project: '../accounts?x=1' });

    expect(requests()[0]?.url).toBe(
      'https://formspree.io/api/v1/projects/..%2Faccounts%3Fx%3D1',
    );
  });
});

describe('projects create', () => {
  it('creates a project and points at forms create', async () => {
    login(credentialsFile);
    answer(200, { project, next_steps: [createStep] });
    const { framed } = answerPrompts();

    await run(create, { name: 'Marketing site' });

    expect(requests()).toEqual([
      {
        method: 'post',
        url: 'https://formspree.io/api/v1/projects',
        data: { name: 'Marketing site' },
      },
    ]);
    expect(headers()['Idempotency-Key']).toBeUndefined();

    const shown = output(console.log);
    expect(shown).toContain('Project created: Marketing site');
    // The new project's id is in the Formspree red, as the banner is.
    const red = chalk.bold.red('|').split('|')[0];
    const raw = vi
      .mocked(console.log)
      .mock.calls.map((args) => args.join(' '))
      .join('\n');
    expect(raw).toContain(`${red}proj_2pn3r0jq7zz0t`);
    expect(shown).toContain(
      'formspree forms create --project proj_2pn3r0jq7zz0t',
    );
    expect(shown).not.toContain('POST /api/v1/forms');
    // One note says it was created, over its details, standing on its own
    // without questions. What's left to do is in a box, as it always is.
    expect(shown.match(/Project created/g)).toHaveLength(1);
    expect(framed).toEqual([
      {
        kind: 'note',
        title: 'Project created: Marketing site (proj_2pn3r0jq7zz0t)',
        message: expect.stringMatching(
          /^Account {4}acct_7d3f9a2c8e1b4f6a0c55\nKind {7}dashboard\n/,
        ),
        stderr: false,
        guide: false,
      },
      {
        kind: 'box',
        title: 'Next steps',
        message:
          '- Add a form to it: formspree forms create --project proj_2pn3r0jq7zz0t',
        stderr: false,
        guide: false,
      },
    ]);
    expect(framed[0]?.message).toContain(
      'Dashboard  https://formspree.io/projects/3122252403177421850',
    );
  });

  it("leaves the name to the server when it isn't given", async () => {
    login(credentialsFile);
    answer(200, { project, next_steps: [] });

    await run(create, {});

    expect(requests()[0]?.data).toEqual({});
  });

  it('sends --account and --idempotency-key', async () => {
    login(credentialsFile);
    answer(200, { project, next_steps: [createStep] });

    await run(create, {
      name: 'Marketing site',
      account: 'acct_7d3f9a2c8e1b4f6a0c55',
      idempotencyKey: 'deploy-42',
    });

    expect(requests()[0]?.data).toEqual({
      name: 'Marketing site',
      account_id: 'acct_7d3f9a2c8e1b4f6a0c55',
    });
    expect(headers()['Idempotency-Key']).toBe('deploy-42');
    expect(output(console.log)).not.toContain('Nothing new was created');
  });

  it('says so when the idempotency key replays an earlier create', async () => {
    login(credentialsFile);
    answer(
      200,
      { project, next_steps: [createStep] },
      { 'idempotent-replayed': 'true' },
    );

    await run(create, {
      name: 'Marketing site',
      idempotencyKey: 'deploy-42',
    });

    expect(output(console.log)).toContain('Nothing new was created');
    expect(process.exitCode).toBeUndefined();
  });

  it('lists the accounts to choose from when the login covers several', async () => {
    login(credentialsFile);
    answer(
      422,
      problem(422, 'This API key covers several accounts.', {
        accounts: [
          { id: 'acct_aaaaaaaaaaaaaaaaaaaa', name: null, kind: 'personal' },
          {
            id: 'acct_bbbbbbbbbbbbbbbbbbbb',
            name: 'Acme Agency',
            kind: 'team',
          },
        ],
      }),
    );

    await run(create, { name: 'Marketing site' });

    const shown = output(console.error);
    expect(shown).toContain('This API key covers several accounts.');
    expect(shown).toContain('Personal account (acct_aaaaaaaaaaaaaaaaaaaa)');
    expect(shown).toContain('Acme Agency (acct_bbbbbbbbbbbbbbbbbbbb)');
    expect(shown).toContain('--account <id>');
    expect(process.exitCode).toBe(1);
  });

  it('shows the reason from an error that is not a problem yet', async () => {
    login(credentialsFile);
    answer(403, {
      ok: false,
      error: { message: 'Projects limit reached', code: 'OVER_LIMIT' },
    });

    await run(create, { name: 'One too many' });

    expect(output(console.error)).toContain('Projects limit reached (403)');
    expect(process.exitCode).toBe(1);
  });

  it('falls back to the status when the body says nothing', async () => {
    login(credentialsFile);
    answer(405, '<html>Method Not Allowed</html>');

    await run(create, { name: 'Marketing site', json: true });

    // No JSON came back, so the CLI says what it can as its own failure.
    expect(JSON.parse(output(console.log))).toEqual({
      ok: false,
      error: { code: 'REQUEST_FAILED', message: 'Request failed (405)' },
      detail: 'Request failed (405)',
      retryable: false,
      status: 405,
    });
    expect(console.error).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe('projects create, asking', () => {
  const account: Account = {
    id: 'acct_7d3f9a2c8e1b4f6a0c55',
    name: 'Acme Agency',
    kind: 'team',
  };
  const personal: Account = {
    id: 'acct_aaaaaaaaaaaaaaaaaaaa',
    name: null,
    kind: 'personal',
  };
  const NAME = {
    kind: 'text',
    message: 'Project name',
    placeholder: 'New Project',
  };
  const ACCOUNT = {
    kind: 'select',
    message: 'Account',
    options: ['Personal account', 'Acme Agency'],
  };

  const serve = (accounts: Account[] = [account]) => {
    request.mockImplementation((config) => {
      const data =
        config.method === 'post'
          ? { project, next_steps: [createStep] }
          : { accounts };
      return Promise.resolve({ status: 200, data });
    });
  };

  const created = () => requests().filter((r) => r.method === 'post');

  beforeEach(() => {
    login(credentialsFile);
    setTTY(true);
  });

  it('asks for the name when no option is given', async () => {
    serve();
    const { asked, framed, intro, outro, spinner } = answerPrompts([
      'Marketing site',
    ]);

    await run(create, {});

    expect(intro).toHaveBeenCalledWith('New project', expect.anything());
    // The banner heads the questions, on stderr with them.
    expect(bannerAt(output(console.error).split('\n'))).toBe(1);
    expect(bannerAt(output(console.log).split('\n'))).toBe(-1);
    expect(asked).toEqual([NAME]);
    expect(spinner.start).toHaveBeenCalledWith('Creating the project');
    // The spinner leaves no line of its own: the note says it was created.
    expect(spinner.clear).toHaveBeenCalledTimes(1);
    expect(spinner.stop).not.toHaveBeenCalled();
    expect(outro).toHaveBeenCalledWith(
      'Add a form to it next.',
      expect.anything(),
    );
    expect(requests().map((r) => `${r.method} ${r.url}`)).toEqual([
      'get https://formspree.io/api/v1/accounts',
      'post https://formspree.io/api/v1/projects',
    ]);
    expect(created()[0]?.data).toEqual({ name: 'Marketing site' });
    // Said once, by a note joined to the questions, with what's left
    // boxed under them.
    expect(output(console.log).match(/Project created/g)).toHaveLength(1);
    expect(framed.map(({ kind, title }) => `${kind}: ${title}`)).toEqual([
      'note: Project created: Marketing site (proj_2pn3r0jq7zz0t)',
      'box: Next steps',
    ]);
    // In the Formspree red there too.
    expect(vi.mocked(console.log).mock.calls.flat().join('\n')).toContain(
      chalk.bold.red('proj_2pn3r0jq7zz0t'),
    );
    expect(framed[0]?.guide).toBe(true);
    expect(framed[0]?.message).toContain('acct_7d3f9a2c8e1b4f6a0c55');
    expect(framed[1]?.message).toContain('formspree forms create --project');
  });

  it('uses the default name when the question is left empty', async () => {
    serve();
    answerPrompts([]);

    await run(create, {});

    expect(created()[0]?.data).toEqual({ name: 'New Project' });
  });

  it('stops the spinner with an error when the project is not created', async () => {
    request.mockImplementation((config) =>
      Promise.resolve(
        config.method === 'post'
          ? { status: 403, data: problem(403, 'Projects limit reached') }
          : { status: 200, data: { accounts: [account] } },
      ),
    );
    const { outro, spinner } = answerPrompts(['One too many']);

    await run(create, {});

    expect(spinner.error).toHaveBeenCalledWith('The project was not created');
    expect(spinner.stop).not.toHaveBeenCalled();
    expect(outro).not.toHaveBeenCalled();
    expect(output(console.error)).toContain('Projects limit reached (403)');
    expect(process.exitCode).toBe(1);
  });

  it('asks which account when the login covers several', async () => {
    serve([personal, account]);
    const { asked } = answerPrompts(['Marketing site', 'Acme Agency']);

    await run(create, {});

    expect(asked).toEqual([NAME, ACCOUNT]);
    expect(created()[0]?.data).toEqual({
      name: 'Marketing site',
      account_id: 'acct_7d3f9a2c8e1b4f6a0c55',
    });
  });

  it('asks only for the account when the name was given', async () => {
    serve([personal, account]);
    const { asked } = answerPrompts(['Personal account']);

    await run(create, { name: 'Marketing site' });

    expect(asked).toEqual([ACCOUNT]);
    expect(created()[0]?.data).toEqual({
      name: 'Marketing site',
      account_id: 'acct_aaaaaaaaaaaaaaaaaaaa',
    });
  });

  it('asks nothing when the name was given and there is one account', async () => {
    serve();
    const { asked, intro } = answerPrompts([]);

    await run(create, { name: 'Marketing site' });

    expect(asked).toEqual([]);
    expect(intro).not.toHaveBeenCalled();
    expect(created()[0]?.data).toEqual({ name: 'Marketing site' });
  });

  it('creates nothing when the questions are abandoned', async () => {
    serve();
    const { cancel } = answerPrompts([CTRL_C]);

    await run(create, {});

    expect(created()).toEqual([]);
    expect(cancel).toHaveBeenCalledWith(
      'Cancelled. Nothing was changed.',
      expect.anything(),
    );
    expect(process.exitCode).toBe(130);
  });

  it('asks only for the name when --account is given', async () => {
    serve([personal, account]);
    const { asked } = answerPrompts(['Marketing site']);

    await run(create, { account: 'acct_7d3f9a2c8e1b4f6a0c55' });

    expect(asked).toEqual([NAME]);
    expect(created()[0]?.data).toEqual({
      name: 'Marketing site',
      account_id: 'acct_7d3f9a2c8e1b4f6a0c55',
    });
  });

  it('asks nothing and looks nothing up when the name and --account are given', async () => {
    serve([personal, account]);
    const { asked } = answerPrompts([]);

    await run(create, {
      name: 'Marketing site',
      account: 'acct_7d3f9a2c8e1b4f6a0c55',
    });

    expect(asked).toEqual([]);
    expect(requests()).toHaveLength(1);
    expect(requests()[0]?.method).toBe('post');
  });

  it.each([
    ['--no-interactive is given', { interactive: false }],
    ['--json is given', { json: true }],
  ])('asks nothing when %s', async (_case, args) => {
    serve();
    const { asked } = answerPrompts([]);

    await run(create, args);

    expect(asked).toEqual([]);
    expect(requests()).toHaveLength(1);
    expect(requests()[0]?.method).toBe('post');
  });

  it('asks nothing when nobody is at a terminal', async () => {
    serve();
    setTTY(false);
    const { asked } = answerPrompts([]);

    await run(create, {});

    expect(asked).toEqual([]);
    expect(bannerAt(output(console.error).split('\n'))).toBe(-1);
    expect(requests()).toHaveLength(1);
  });
});

describe('projects rename', () => {
  it('renames a project', async () => {
    login(credentialsFile);
    answer(200, { project: { ...project, name: 'Docs site' } });

    await run(rename, { project: 'proj_2pn3r0jq7zz0t', name: 'Docs site' });

    expect(requests()).toEqual([
      {
        method: 'patch',
        url: 'https://formspree.io/api/v1/projects/proj_2pn3r0jq7zz0t',
        data: { name: 'Docs site' },
      },
    ]);
    expect(output(console.log)).toContain('Project renamed: Docs site');
  });
});

describe('projects delete', () => {
  const ID = 'proj_2pn3r0jq7zz0t';
  const TITLE = 'Marketing site (proj_2pn3r0jq7zz0t)';
  const PROJECT = `/api/v1/projects/${ID}`;

  const contact = {
    name: 'Contact form',
    project_id: ID,
    hashid: 'xyzabcde',
    url: 'https://formspree.io/f/xyzabcde',
    key: null,
  };
  const newsletter = {
    ...contact,
    name: 'Newsletter',
    hashid: 'mnopqrst',
    url: 'https://formspree.io/f/mnopqrst',
  };

  const hasForms = problem(
    409,
    'Only a project with no forms can be deleted. Delete its forms first.',
    {
      type: 'https://help.formspree.io/problems/project-not-empty',
      next_steps: [
        {
          step: 'delete_forms',
          detail: 'GET /api/v1/forms?project_id=<project_id> lists them.',
        },
      ],
    },
  );
  const stillRemoving = problem(
    409,
    "The project's deleted forms are still being removed. Retry in a moment.",
    {
      type: 'https://help.formspree.io/problems/project-not-empty',
      retryable: true,
    },
  );

  type Answer = [status: number, data: unknown];

  /**
   * Answers each request from its route's list, in order, repeating the
   * last one. A route is a method and a path, like `delete /api/v1/x`.
   * The project and its forms are there unless a test says otherwise.
   */
  const serve = (routes: Record<string, Answer[]> = {}) => {
    const defaults: Record<string, Answer[]> = {
      [`get ${PROJECT}`]: [[200, { project }]],
      'get /api/v1/forms': [[200, { forms: [] }]],
      [`delete ${PROJECT}`]: [[204, '']],
      'delete /api/v1/forms/xyzabcde': [[204, '']],
      'delete /api/v1/forms/mnopqrst': [[204, '']],
    };
    // Copies, so one test's requests don't use up another's answers.
    const queues: Record<string, Answer[]> = {};
    for (const [route, answers] of Object.entries({ ...defaults, ...routes })) {
      queues[route] = [...answers];
    }
    request.mockImplementation((config) => {
      const route = `${config.method} ${config.url.replace('https://formspree.io', '')}`;
      const queue = queues[route];
      const next = queue && queue.length > 1 ? queue.shift() : queue?.[0];
      if (!next) throw new Error(`Unexpected request: ${route}`);
      return response(...next);
    });
  };

  /** The requests sent, as `method path`. */
  const sent = (): string[] =>
    requests().map(
      (r) => `${r.method} ${r.url.replace('https://formspree.io', '')}`,
    );

  const withForms = {
    'get /api/v1/forms': [[200, { forms: [contact, newsletter] }]],
  } satisfies Record<string, Answer[]>;

  beforeEach(() => {
    login(credentialsFile);
    setTTY(false);
    vi.mocked(sleep).mockReset();
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  it('deletes an empty project with --yes', async () => {
    serve();

    await run(del, { project: ID, yes: true });

    expect(requests()).toEqual([
      { method: 'get', url: `https://formspree.io${PROJECT}` },
      {
        method: 'get',
        url: 'https://formspree.io/api/v1/forms',
        params: { project_id: ID },
      },
      { method: 'delete', url: `https://formspree.io${PROJECT}` },
    ]);
    expect(output(console.log)).toContain(`Project deleted: ${TITLE}`);
    expect(process.exitCode).toBeUndefined();
  });

  it('refuses without --yes when nobody can confirm', async () => {
    serve();

    await run(del, { project: ID });

    expect(request).not.toHaveBeenCalled();
    expect(output(console.error)).toContain('--yes');
    expect(process.exitCode).toBe(2);
  });

  it('asks before deleting an empty project', async () => {
    serve();
    setTTY(true);
    const { asked } = answerPrompts([true]);

    await run(del, { project: ID });

    expect(plain(asked[0]?.message ?? '')).toBe(`Delete project ${TITLE}?`);
    expect(asked).toHaveLength(1);
    expect(sent().at(-1)).toBe(`delete ${PROJECT}`);
    expect(output(console.log)).toContain(`Project deleted: ${TITLE}`);
  });

  it.each([
    ['answered no', [false]],
    ['left at its default', []],
  ])('deletes nothing when the prompt is %s', async (_case, answers) => {
    serve(withForms);
    setTTY(true);
    answerPrompts(answers);

    await run(del, { project: ID });

    expect(sent().filter((r) => r.startsWith('delete'))).toEqual([]);
    expect(output(console.log)).toContain('Nothing deleted');
    expect(process.exitCode).toBeUndefined();
  });

  it('deletes nothing when the prompt is abandoned with Ctrl+C', async () => {
    serve(withForms);
    setTTY(true);
    const { cancel } = answerPrompts([CTRL_C]);

    await run(del, { project: ID });

    expect(sent().filter((r) => r.startsWith('delete'))).toEqual([]);
    expect(cancel).toHaveBeenCalled();
    expect(process.exitCode).toBe(130);
  });

  it("calls the project by its id when its name can't be read", async () => {
    serve({ [`get ${PROJECT}`]: [[403, problem(403, 'No projects:read.')]] });

    await run(del, { project: ID, yes: true });

    expect(output(console.error)).toBe('');
    expect(output(console.log)).toContain(`Project deleted: ${ID}`);
    expect(process.exitCode).toBeUndefined();
  });

  it('reports a project that is not there', async () => {
    const missing: Answer = [404, problem(404, 'Nothing with that id exists.')];
    serve({
      'get /api/v1/projects/nope': [missing],
      'get /api/v1/forms': [missing],
    });

    await run(del, { project: 'nope', yes: true });

    expect(sent()).toEqual(['get /api/v1/projects/nope', 'get /api/v1/forms']);
    expect(output(console.error)).toContain('Nothing with that id exists.');
    expect(output(console.log)).not.toContain('Project deleted');
    expect(process.exitCode).toBe(3);
  });

  describe('when the project has forms', () => {
    // The project can't go while it has forms: 409, then 204 once empty.
    const refusedThenDeleted = {
      ...withForms,
      [`delete ${PROJECT}`]: [
        [409, hasForms],
        [204, ''],
      ],
    } satisfies Record<string, Answer[]>;

    it('names the forms, asks, then deletes them before the project', async () => {
      serve(refusedThenDeleted);
      setTTY(true);
      const { asked } = answerPrompts([true]);

      await run(del, { project: ID });

      expect(output(console.error)).toContain(`${TITLE} has 2 forms:`);
      expect(output(console.error)).toContain('- Contact form (xyzabcde)');
      expect(output(console.error)).toContain('- Newsletter (mnopqrst)');
      expect(plain(asked[0]?.message ?? '')).toBe(
        `Delete project ${TITLE}, its 2 forms and their submissions?`,
      );
      expect(sent()).toEqual([
        `get ${PROJECT}`,
        'get /api/v1/forms',
        `delete ${PROJECT}`,
        'delete /api/v1/forms/xyzabcde',
        'delete /api/v1/forms/mnopqrst',
        `delete ${PROJECT}`,
      ]);
      expect(output(console.log)).toContain(
        'Form deleted: Contact form (xyzabcde)',
      );
      expect(output(console.log)).toContain(
        'Form deleted: Newsletter (mnopqrst)',
      );
      expect(output(console.log)).toContain(`Project deleted: ${TITLE}`);
      expect(process.exitCode).toBeUndefined();
    });

    it('says "1 form" for one', async () => {
      serve({
        ...refusedThenDeleted,
        'get /api/v1/forms': [[200, { forms: [contact] }]],
      });
      setTTY(true);
      const { asked } = answerPrompts([true]);

      await run(del, { project: ID });

      expect(plain(asked[0]?.message ?? '')).toBe(
        `Delete project ${TITLE}, its 1 form and their submissions?`,
      );
    });

    it('deletes nothing with --yes alone, and says to pass --forms', async () => {
      serve(refusedThenDeleted);

      await run(del, { project: ID, yes: true });

      expect(sent()).toEqual([`get ${PROJECT}`, 'get /api/v1/forms']);
      expect(output(console.error)).toContain(`Project ${TITLE} has 2 forms`);
      expect(output(console.error)).toContain('--forms');
      expect(process.exitCode).toBe(2);
    });

    it('deletes the forms and the project with --yes --forms', async () => {
      serve(refusedThenDeleted);
      const { asked } = answerPrompts([]);

      await run(del, { project: ID, yes: true, forms: true });

      expect(asked).toEqual([]);
      expect(sent().slice(2)).toEqual([
        `delete ${PROJECT}`,
        'delete /api/v1/forms/xyzabcde',
        'delete /api/v1/forms/mnopqrst',
        `delete ${PROJECT}`,
      ]);
      expect(output(console.log)).toContain(`Project deleted: ${TITLE}`);
    });

    it('prints only what was deleted with --json', async () => {
      serve(refusedThenDeleted);

      await run(del, { project: ID, yes: true, forms: true, json: true });

      expect(JSON.parse(output(console.log))).toEqual({
        deleted: ID,
        forms: ['xyzabcde', 'mnopqrst'],
      });
    });

    it('deletes no form when the project may not be deleted', async () => {
      serve({
        ...withForms,
        [`delete ${PROJECT}`]: [
          [
            403,
            problem(
              403,
              "This API key is limited to this project, so it can't delete it.",
            ),
          ],
        ],
      });

      await run(del, { project: ID, yes: true, forms: true });

      expect(sent().slice(2)).toEqual([`delete ${PROJECT}`]);
      expect(output(console.error)).toContain(
        "This API key is limited to this project, so it can't delete it. (403)",
      );
      expect(process.exitCode).toBe(1);
    });

    it('stops at a form that cannot be deleted, and leaves the project', async () => {
      serve({
        ...refusedThenDeleted,
        'delete /api/v1/forms/mnopqrst': [[403, problem(403, 'Not yours.')]],
      });

      await run(del, { project: ID, yes: true, forms: true });

      expect(sent().slice(2)).toEqual([
        `delete ${PROJECT}`,
        'delete /api/v1/forms/xyzabcde',
        'delete /api/v1/forms/mnopqrst',
      ]);
      expect(output(console.error)).toContain('Not yours. (403)');
      expect(output(console.error)).toContain(
        '1 of 2 forms deleted. The project was not deleted.',
      );
      expect(output(console.log)).not.toContain('Project deleted');
      expect(process.exitCode).toBe(1);
    });

    it('waits while the deleted forms are still being removed', async () => {
      serve({
        ...withForms,
        [`delete ${PROJECT}`]: [
          [409, hasForms],
          [409, stillRemoving],
          [409, stillRemoving],
          [204, ''],
        ],
      });

      await run(del, { project: ID, yes: true, forms: true });

      expect(vi.mocked(sleep).mock.calls).toEqual([[2000], [2000]]);
      // Said once, however long the wait.
      expect(vi.mocked(process.stderr.write).mock.calls).toEqual([
        ['- Waiting for the deleted forms to be removed...\n'],
      ]);
      expect(output(console.error)).toBe('');
      expect(output(console.log)).toContain(`Project deleted: ${TITLE}`);
      expect(process.exitCode).toBeUndefined();
    });

    it('reports the project as deleted when its forms went in the meantime', async () => {
      serve(withForms);

      await run(del, { project: ID, yes: true, forms: true });

      expect(sent().slice(2)).toEqual([`delete ${PROJECT}`]);
      expect(output(console.log)).toContain(`Project deleted: ${TITLE}`);
    });
  });

  describe('when forms deleted earlier are still being removed', () => {
    const never = {
      [`delete ${PROJECT}`]: [[409, stillRemoving]],
    } satisfies Record<string, Answer[]>;

    it('gives up after 15 tries, and says to run it again', async () => {
      serve(never);

      await run(del, { project: ID, yes: true });

      expect(sent().filter((r) => r === `delete ${PROJECT}`)).toHaveLength(15);
      expect(sleep).toHaveBeenCalledTimes(14);
      expect(output(console.error)).toContain(
        "The project's deleted forms are still being removed. Retry in a moment. (409)",
      );
      expect(output(console.error)).toContain(
        `Run formspree projects delete ${ID} again in a moment.`,
      );
      expect(output(console.log)).not.toContain('Project deleted');
      expect(process.exitCode).toBe(1);
    });

    it('prints the refusal as JSON with --json', async () => {
      serve(never);

      await run(del, { project: ID, yes: true, json: true });

      expect(JSON.parse(output(console.log))).toEqual(stillRemoving);
      expect(process.exitCode).toBe(1);
    });

    it('does not wait on forms that are not deleted', async () => {
      // None were listed, yet the API says the project has some.
      serve({ [`delete ${PROJECT}`]: [[409, hasForms]] });

      await run(del, { project: ID, yes: true });

      expect(sleep).not.toHaveBeenCalled();
      expect(output(console.error)).toContain(
        'Only a project with no forms can be deleted. Delete its forms first. (409)',
      );
      expect(process.exitCode).toBe(1);
    });
  });

  describe('with no project named', () => {
    const other = { ...project, id: 'proj_other', name: 'Docs site' };
    const PICKER = {
      kind: 'select',
      message: 'Project to delete',
      options: ['Marketing site', 'Docs site'],
    };
    const listed = (projects: unknown[] = [project, other]) =>
      ({ 'get /api/v1/projects': [[200, { projects }]] }) satisfies Record<
        string,
        Answer[]
      >;

    beforeEach(() => {
      setTTY(true);
    });

    it('lists the projects to pick from, then asks before deleting', async () => {
      serve({ ...listed(), 'delete /api/v1/projects/proj_other': [[204, '']] });
      const { asked } = answerPrompts(['Docs site', true]);

      await run(del, {});

      expect(
        asked.map((question) => ({
          ...question,
          message: plain(question.message),
        })),
      ).toEqual([
        PICKER,
        { kind: 'confirm', message: 'Delete project Docs site (proj_other)?' },
      ]);
      expect(requests()).toEqual([
        { method: 'get', url: 'https://formspree.io/api/v1/projects' },
        {
          method: 'get',
          url: 'https://formspree.io/api/v1/forms',
          params: { project_id: 'proj_other' },
        },
        {
          method: 'delete',
          url: 'https://formspree.io/api/v1/projects/proj_other',
        },
      ]);
      expect(output(console.log)).toContain(
        'Project deleted: Docs site (proj_other)',
      );
    });

    it('deletes nothing when the picker is abandoned', async () => {
      serve(listed());
      const { cancel } = answerPrompts([CTRL_C]);

      await run(del, {});

      expect(sent()).toEqual(['get /api/v1/projects']);
      expect(cancel).toHaveBeenCalled();
      expect(process.exitCode).toBe(130);
    });

    it('says so when there are no projects to pick from', async () => {
      serve(listed([]));
      const { asked } = answerPrompts([]);

      await run(del, {});

      expect(asked).toEqual([]);
      expect(sent()).toEqual(['get /api/v1/projects']);
      expect(output(console.log)).toContain('No projects to delete');
      expect(process.exitCode).toBeUndefined();
    });

    it('reports why the projects could not be listed, and deletes nothing', async () => {
      serve({
        'get /api/v1/projects': [
          [403, problem(403, 'This key lacks projects:read.')],
        ],
      });

      await run(del, {});

      expect(sent()).toEqual(['get /api/v1/projects']);
      expect(output(console.error)).toContain(
        'This key lacks projects:read. (403)',
      );
      expect(process.exitCode).toBe(1);
    });

    it('says so as JSON with --json, with how to find the id', async () => {
      serve(listed());

      await run(del, { json: true });

      expect(request).not.toHaveBeenCalled();
      const printed = JSON.parse(output(console.log));
      expect(printed.error.code).toBe('MISSING_ARGUMENT');
      expect(printed.next_steps[0].command).toBe(
        'formspree projects list --json',
      );
      expect(console.error).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(2);
    });

    it.each([
      ['nobody is at a terminal', {}, false],
      ['--yes is given off a terminal', { yes: true }, false],
    ])('asks for the id instead when %s', async (_case, args, tty) => {
      serve(listed());
      setTTY(tty);
      const { asked } = answerPrompts([]);

      await run(del, args);

      expect(asked).toEqual([]);
      expect(request).not.toHaveBeenCalled();
      expect(output(console.error)).toContain(
        'formspree projects delete <project>',
      );
      expect(process.exitCode).toBe(2);
    });
  });
});

describe('a command that finds no login, in a terminal', () => {
  const QUESTION = { kind: 'confirm', message: 'Not logged in. Log in now?' };
  const LINK = 'https://formspree.io/device?user_code=WDJB-MJHT';

  /**
   * Answers the login's requests: the device code, then each poll for a
   * token with `token`. A refresh of a stored login is refused.
   */
  const serveLogin = (token = () => tokenResponse()) => {
    post.mockImplementation((url, body) => {
      if (url.endsWith('/oauth/device')) return deviceResponse();
      const grant = new URLSearchParams(body).get('grant_type');
      return grant === 'refresh_token' ? oauthError('invalid_grant') : token();
    });
  };

  beforeEach(() => {
    vi.stubEnv('FORMSPREE_CLIENT_ID', 'cli-client');
    setTTY(true);
    vi.mocked(sleep).mockReset();
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    answer(200, { projects: [project] });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('offers to log in, then runs the command with the new login', async () => {
    serveLogin();
    const { asked } = answerPrompts([true]);

    await run(list, {});

    expect(asked).toEqual([QUESTION]);
    expect(requests()).toEqual([
      { method: 'get', url: 'https://formspree.io/api/v1/projects' },
    ]);
    expect(headers().Authorization).toBe('Bearer fso_access_1');
    expect(output(console.log)).toContain('Marketing site');
    expect(process.exitCode).toBeUndefined();
  });

  it('logs in when the question is left at its default', async () => {
    serveLogin();
    answerPrompts([]);

    await run(list, {});

    expect(output(console.log)).toContain('Marketing site');
  });

  it("keeps the login's lines on stderr, off the command's output", async () => {
    serveLogin();
    answerPrompts([true]);

    await run(list, {});

    expect(output(console.error)).toContain(LINK);
    expect(output(console.error)).toContain('Logged in');
    expect(output(console.log)).not.toContain(LINK);
    expect(output(console.log)).not.toContain('Logged in');
  });

  it('opens the login link in the browser, where there is one', async () => {
    vi.mocked(browser.available).mockReturnValue(true);
    serveLogin();
    answerPrompts([true]);

    await run(list, {});

    expect(browser.open).toHaveBeenCalledWith(LINK);
    // The login talks on stderr here, so that's the terminal that's checked.
    expect(browser.available).toHaveBeenCalledWith(process.stderr);
    expect(output(console.error)).toContain(LINK);
  });

  it('opens nothing when the offer is turned down', async () => {
    vi.mocked(browser.available).mockReturnValue(true);
    serveLogin();
    answerPrompts([false]);

    await run(list, {});

    expect(browser.open).not.toHaveBeenCalled();
  });

  it('stops, saying how to log in later, when the offer is turned down', async () => {
    serveLogin();
    answerPrompts([false]);

    await run(list, {});

    expect(post).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(output(console.error)).toContain('Not logged in');
    expect(output(console.error)).toContain('formspree login');
    expect(process.exitCode).toBe(4);
  });

  it('stops with the exit code of an interrupt on Ctrl+C', async () => {
    serveLogin();
    const { cancel } = answerPrompts([CTRL_C]);

    await run(list, {});

    expect(post).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalled();
    expect(process.exitCode).toBe(130);
  });

  it('stops when the login is denied in the browser, and says only that', async () => {
    serveLogin(() => oauthError('access_denied'));
    answerPrompts([true]);

    await run(list, {});

    expect(request).not.toHaveBeenCalled();
    expect(output(console.error)).toContain('Login was denied in the browser');
    expect(output(console.error)).not.toContain('formspree login');
    expect(process.exitCode).toBe(1);
  });

  it('offers again for a login that has expired or was revoked', async () => {
    login(credentialsFile);
    // The stored token is refused, and so is refreshing it.
    request.mockImplementation((config) =>
      config.headers.Authorization === 'Bearer fso_access_0'
        ? response(401, problem(401, 'Token expired.'))
        : response(200, { projects: [project] }),
    );
    serveLogin();
    const { asked } = answerPrompts([true]);

    await run(list, {});

    expect(asked).toEqual([
      {
        kind: 'confirm',
        message: 'Your login has expired or was revoked. Log in now?',
      },
    ]);
    expect(output(console.log)).toContain('Marketing site');
    expect(process.exitCode).toBeUndefined();
  });

  it('asks before the first request, even one the command could do without', async () => {
    serveLogin();
    request.mockImplementation((config) =>
      config.method === 'delete'
        ? response(204, '')
        : config.url.endsWith('/forms')
          ? response(200, { forms: [] })
          : response(200, { project }),
    );
    const { asked } = answerPrompts([true]);

    await run(del, { project: project.id, yes: true });

    expect(asked).toEqual([QUESTION]);
    // The lookup of the project's name is sent once there's a login.
    expect(requests().map((r) => r.method)).toEqual(['get', 'get', 'delete']);
    expect(output(console.log)).toContain(
      'Project deleted: Marketing site (proj_2pn3r0jq7zz0t)',
    );
  });

  describe('but does not offer', () => {
    const refused = async (args: object) => {
      serveLogin();
      const { asked } = answerPrompts([true]);

      await run(list, args);

      expect(asked).toEqual([]);
      expect(post).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(4);
    };

    it('with --json', async () => {
      await refused({ json: true });

      // It says how to log in, as JSON, and leaves it there.
      const printed = JSON.parse(output(console.log));
      expect(printed.error.code).toBe('NOT_LOGGED_IN');
      expect(printed.next_steps[0].command).toBe('formspree login --json');
    });

    it('off a terminal', async () => {
      setTTY(false);

      await refused({});

      expect(output(console.error)).toContain('formspree login');
    });

    it('on a server the CLI has no client id for', async () => {
      vi.unstubAllEnvs();
      vi.stubEnv('FORMSPREE_API_URL', 'https://review.formspree.io');

      await refused({});

      expect(output(console.error)).toContain('formspree login');
    });

    it('for an API key the server rejects', async () => {
      answer(401, problem(401, 'This API key was revoked.'));

      await refused({ key: 'fsk_revoked' });

      expect(output(console.error)).toContain('This API key was revoked.');
      expect(output(console.error)).not.toContain('formspree login');
    });
  });
});
