const axios = require('axios');
const { useTempConfigDir, tokenResponse, output } = require('../helpers/oauth');
const { login, answer, requests, headers, problem } = require('../helpers/v1');
const {
  CTRL_D,
  setTTY,
  unsetTTY,
  answerPrompts
} = require('../helpers/prompt');

jest.mock('axios');

const list = require('../../src/cmds/projects_cmds/list');
const get = require('../../src/cmds/projects_cmds/get');
const create = require('../../src/cmds/projects_cmds/create');
const rename = require('../../src/cmds/projects_cmds/rename');

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
    dashboard: 'https://formspree.io/projects/3122252403177421850'
  }
};

const createStep = {
  step: 'create_form',
  detail: "POST /api/v1/forms with this project's id as project_id.",
  url: 'https://formspree.io/api/v1/forms'
};

let credentialsFile;

beforeEach(() => {
  credentialsFile = useTempConfigDir();
  jest.spyOn(console, 'log').mockImplementation();
  jest.spyOn(console, 'error').mockImplementation();
  process.exitCode = undefined;
});

afterEach(() => {
  jest.restoreAllMocks();
  axios.request.mockReset();
  axios.post.mockReset();
  delete process.env.FORMSPREE_API_KEY;
  unsetTTY();
  process.exitCode = undefined;
});

describe('projects list', () => {
  it('lists the projects the login can see', async () => {
    login(credentialsFile);
    answer(200, { projects: [project], links: { self: 'x' } });

    await list.handler({});

    expect(requests()).toEqual([
      { method: 'get', url: 'https://formspree.io/api/v1/projects' }
    ]);
    expect(headers().Authorization).toBe('Bearer fso_access_0');
    expect(output(console.log)).toContain(
      'Marketing site (proj_2pn3r0jq7zz0t)'
    );
    expect(process.exitCode).toBeUndefined();
  });

  it('narrows to one account with --account', async () => {
    login(credentialsFile);
    answer(200, { projects: [] });

    await list.handler({ account: 'acct_7d3f9a2c8e1b4f6a0c55' });

    expect(requests()[0].params).toEqual({
      account_id: 'acct_7d3f9a2c8e1b4f6a0c55'
    });
    expect(output(console.log)).toContain('No projects yet');
  });

  it('prints only the response with --json', async () => {
    login(credentialsFile);
    const body = { projects: [project], links: { self: 'x' } };
    answer(200, body);

    await list.handler({ json: true });

    expect(JSON.parse(output(console.log))).toEqual(body);
  });

  it('uses an API key in place of the login', async () => {
    process.env.FORMSPREE_API_KEY = 'fsk_from_env';
    answer(200, { projects: [] });

    await list.handler({});

    expect(headers().Authorization).toBe('Bearer fsk_from_env');
  });

  it('asks to log in when there is no login or key', async () => {
    await list.handler({});

    expect(axios.request).not.toHaveBeenCalled();
    expect(output(console.error)).toContain('formspree login');
    expect(process.exitCode).toBe(1);
  });

  it("shows the server's reason when a key is rejected", async () => {
    answer(401, { detail: 'This API key was revoked.' });

    await list.handler({ key: 'fsk_revoked' });

    expect(output(console.error)).toContain('This API key was revoked.');
    expect(output(console.error)).toContain('FORMSPREE_API_KEY');
    expect(output(console.error)).not.toContain('formspree login');
    expect(process.exitCode).toBe(1);
  });

  it('prints the refusal of a key as JSON with --json', async () => {
    const refusal = problem(401, 'This API key was revoked.');
    answer(401, refusal);

    await list.handler({ key: 'fsk_revoked', json: true });

    expect(JSON.parse(output(console.log))).toEqual(refusal);
    expect(console.error).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('prints the refusal of a login as JSON with --json', async () => {
    login(credentialsFile);
    const refusal = problem(401, 'This token was revoked.');
    answer(401, refusal);
    axios.post.mockImplementation(() => tokenResponse('1'));

    await list.handler({ json: true });

    expect(axios.request).toHaveBeenCalledTimes(2);
    expect(JSON.parse(output(console.log))).toEqual(refusal);
    expect(console.error).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('keeps stdout empty with --json when a refused key gets no problem back', async () => {
    answer(401, '');

    await list.handler({ key: 'fsk_revoked', json: true });

    expect(console.log).not.toHaveBeenCalled();
    expect(output(console.error)).toContain('The API key was not accepted');
    expect(process.exitCode).toBe(1);
  });

  it('says what failed when the server cannot be reached', async () => {
    login(credentialsFile);
    axios.request.mockImplementation(() =>
      Promise.reject(
        Object.assign(new Error('refused'), { code: 'ECONNREFUSED' })
      )
    );

    await list.handler({});

    expect(output(console.error)).toContain(
      'Request failed unexpectedly (ECONNREFUSED from https://formspree.io)'
    );
    expect(process.exitCode).toBe(1);
  });
});

describe('projects get', () => {
  it('shows one project', async () => {
    login(credentialsFile);
    answer(200, { project });

    await get.handler({ project: 'proj_2pn3r0jq7zz0t' });

    expect(requests()).toEqual([
      {
        method: 'get',
        url: 'https://formspree.io/api/v1/projects/proj_2pn3r0jq7zz0t'
      }
    ]);
    const shown = output(console.log);
    expect(shown).toContain('Marketing site (proj_2pn3r0jq7zz0t)');
    expect(shown).toContain('acct_7d3f9a2c8e1b4f6a0c55');
    expect(shown).toContain(
      'https://formspree.io/projects/3122252403177421850'
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
              detail: 'GET /api/v1/projects returns every id you can use.'
            }
          ]
        }
      )
    );

    await get.handler({ project: 'proj_nope' });

    const shown = output(console.error);
    expect(shown).toContain('Nothing with that id exists');
    expect(shown).toContain('(404)');
    // A step with no link is written for API callers, not CLI users.
    expect(shown).not.toContain('GET /api/v1/projects');
    expect(process.exitCode).toBe(1);
  });

  it('escapes an id before it goes in the path', async () => {
    login(credentialsFile);
    answer(404, problem(404, 'Not found'));

    await get.handler({ project: '../accounts?x=1' });

    expect(requests()[0].url).toBe(
      'https://formspree.io/api/v1/projects/..%2Faccounts%3Fx%3D1'
    );
  });
});

describe('projects create', () => {
  it('creates a project and points at forms create', async () => {
    login(credentialsFile);
    answer(200, { project, next_steps: [createStep] });

    await create.handler({ name: 'Marketing site' });

    expect(requests()).toEqual([
      {
        method: 'post',
        url: 'https://formspree.io/api/v1/projects',
        data: { name: 'Marketing site' }
      }
    ]);
    expect(headers()['Idempotency-Key']).toBeUndefined();

    const shown = output(console.log);
    expect(shown).toContain('Project created: Marketing site');
    expect(shown).toContain(
      'formspree forms create --project proj_2pn3r0jq7zz0t'
    );
    expect(shown).not.toContain('POST /api/v1/forms');
  });

  it("leaves the name to the server when it isn't given", async () => {
    login(credentialsFile);
    answer(200, { project, next_steps: [] });

    await create.handler({});

    expect(requests()[0].data).toEqual({});
  });

  it('sends --account and --idempotency-key', async () => {
    login(credentialsFile);
    answer(200, { project, next_steps: [createStep] });

    await create.handler({
      name: 'Marketing site',
      account: 'acct_7d3f9a2c8e1b4f6a0c55',
      idempotencyKey: 'deploy-42'
    });

    expect(requests()[0].data).toEqual({
      name: 'Marketing site',
      account_id: 'acct_7d3f9a2c8e1b4f6a0c55'
    });
    expect(headers()['Idempotency-Key']).toBe('deploy-42');
    expect(output(console.log)).not.toContain('Nothing new was created');
  });

  it('says so when the idempotency key replays an earlier create', async () => {
    login(credentialsFile);
    answer(
      200,
      { project, next_steps: [createStep] },
      { 'idempotent-replayed': 'true' }
    );

    await create.handler({
      name: 'Marketing site',
      idempotencyKey: 'deploy-42'
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
          { id: 'acct_bbbbbbbbbbbbbbbbbbbb', name: 'Acme Agency', kind: 'team' }
        ]
      })
    );

    await create.handler({ name: 'Marketing site' });

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
      error: { message: 'Projects limit reached', code: 'OVER_LIMIT' }
    });

    await create.handler({ name: 'One too many' });

    expect(output(console.error)).toContain('Projects limit reached (403)');
    expect(process.exitCode).toBe(1);
  });

  it('falls back to the status when the body says nothing', async () => {
    login(credentialsFile);
    answer(405, '<html>Method Not Allowed</html>');

    await create.handler({ name: 'Marketing site', json: true });

    expect(output(console.error)).toContain('Request failed (405)');
    expect(console.log).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe('projects create, asking', () => {
  const account = {
    id: 'acct_7d3f9a2c8e1b4f6a0c55',
    name: 'Acme Agency',
    kind: 'team'
  };
  const personal = {
    id: 'acct_aaaaaaaaaaaaaaaaaaaa',
    name: null,
    kind: 'personal'
  };

  const serve = (accounts = [account]) => {
    axios.request.mockImplementation(config => {
      const data =
        config.method === 'post'
          ? { project, next_steps: [createStep] }
          : { accounts };
      return Promise.resolve({ status: 200, data });
    });
  };

  const created = () => requests().filter(r => r.method === 'post');

  beforeEach(() => {
    login(credentialsFile);
    setTTY(true);
  });

  it('asks for the name when no option is given', async () => {
    serve();
    const { asked, close } = answerPrompts(['Marketing site']);

    await create.handler({});

    expect(asked).toEqual(['Name (default "New Project"):']);
    expect(requests().map(r => `${r.method} ${r.url}`)).toEqual([
      'get https://formspree.io/api/v1/accounts',
      'post https://formspree.io/api/v1/projects'
    ]);
    expect(created()[0].data).toEqual({ name: 'Marketing site' });
    expect(close).toHaveBeenCalled();
    expect(output(console.log)).toContain('Project created');
  });

  it('leaves the name to the server when the question is skipped', async () => {
    serve();
    answerPrompts(['']);

    await create.handler({});

    expect(created()[0].data).toEqual({});
  });

  it('asks which account when the login covers several', async () => {
    serve([personal, account]);
    const { asked } = answerPrompts(['Marketing site', '', '2']);

    await create.handler({});

    expect(asked).toEqual([
      'Name (default "New Project"):',
      'Pick a number:',
      'Pick a number:'
    ]);
    expect(output(console.error)).toContain(
      '2. Acme Agency (team, acct_7d3f9a2c8e1b4f6a0c55)'
    );
    expect(created()[0].data).toEqual({
      name: 'Marketing site',
      account_id: 'acct_7d3f9a2c8e1b4f6a0c55'
    });
  });

  it('asks only for the account when the name was given', async () => {
    serve([personal, account]);
    const { asked } = answerPrompts(['1']);

    await create.handler({ name: 'Marketing site' });

    expect(asked).toEqual(['Pick a number:']);
    expect(created()[0].data).toEqual({
      name: 'Marketing site',
      account_id: 'acct_aaaaaaaaaaaaaaaaaaaa'
    });
  });

  it('asks nothing when the name was given and there is one account', async () => {
    serve();
    const { open } = answerPrompts([]);

    await create.handler({ name: 'Marketing site' });

    expect(open).not.toHaveBeenCalled();
    expect(created()[0].data).toEqual({ name: 'Marketing site' });
  });

  it('creates nothing when the questions are abandoned', async () => {
    serve();
    answerPrompts([CTRL_D]);

    await create.handler({});

    expect(created()).toEqual([]);
    expect(output(console.error)).toContain('Cancelled');
    expect(process.exitCode).toBe(130);
  });

  it.each([
    ['--account is given', { account: 'acct_7d3f9a2c8e1b4f6a0c55' }],
    ['--no-interactive is given', { interactive: false }],
    ['--json is given', { json: true }]
  ])('asks nothing when %s', async (_case, args) => {
    serve();
    const { open } = answerPrompts([]);

    await create.handler(args);

    expect(open).not.toHaveBeenCalled();
    expect(requests()).toHaveLength(1);
    expect(requests()[0].method).toBe('post');
  });

  it('asks nothing when nobody is at a terminal', async () => {
    serve();
    setTTY(false);
    const { open } = answerPrompts([]);

    await create.handler({});

    expect(open).not.toHaveBeenCalled();
    expect(requests()).toHaveLength(1);
  });
});

describe('projects rename', () => {
  it('renames a project', async () => {
    login(credentialsFile);
    answer(200, { project: { ...project, name: 'Docs site' } });

    await rename.handler({ project: 'proj_2pn3r0jq7zz0t', name: 'Docs site' });

    expect(requests()).toEqual([
      {
        method: 'patch',
        url: 'https://formspree.io/api/v1/projects/proj_2pn3r0jq7zz0t',
        data: { name: 'Docs site' }
      }
    ]);
    expect(output(console.log)).toContain('Project renamed: Docs site');
  });
});
