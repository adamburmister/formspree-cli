const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const axios = require('axios');
const { useTempConfigDir, output } = require('../helpers/oauth');
const { login, answer, requests, headers, problem } = require('../helpers/v1');

jest.mock('axios');

const list = require('../../src/cmds/forms_cmds/list');
const get = require('../../src/cmds/forms_cmds/get');
const create = require('../../src/cmds/forms_cmds/create');
const update = require('../../src/cmds/forms_cmds/update');
const del = require('../../src/cmds/forms_cmds/delete');
const validate = require('../../src/cmds/forms_cmds/validate');

const summary = {
  name: 'Contact form',
  project_id: 'proj_2pn3r0jq7zz0t',
  hashid: 'xyzabcde',
  url: 'https://formspree.io/f/xyzabcde',
  key: null,
  emails: ['team@acme.example'],
  created_at: 'Tue, 13 Oct 2026 04:20:11 GMT',
  verified: true,
  links: {
    self: 'https://formspree.io/api/v1/forms/xyzabcde',
    project: 'https://formspree.io/api/v1/projects/proj_2pn3r0jq7zz0t',
    validate: 'https://formspree.io/api/v1/forms/xyzabcde/validate',
    dashboard: 'https://formspree.io/forms/xyzabcde'
  }
};

const form = {
  ...summary,
  fields: { email: { type: 'email', required: true } },
  captcha: null,
  actions: [
    {
      type: 'email',
      to: ['team@acme.example'],
      status: 'pending_verification'
    },
    { app: 'mailchimp', status: 'needs_connection' },
    { type: 'webhook', status: 'active' }
  ],
  submission_url: 'https://formspree.io/f/xyzabcde'
};

const nextSteps = [
  {
    step: 'wire_endpoint',
    detail: "Set your HTML form's action to submission_url.",
    url: 'https://formspree.io/f/xyzabcde'
  },
  {
    step: 'verify_email',
    detail: 'Ask the user to verify team@acme.example.',
    url: 'https://formspree.io/account'
  }
];

let credentialsFile;

const jsonFile = contents => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'formspree-cli-'));
  const file = path.join(dir, 'form.json');
  fs.writeFileSync(
    file,
    typeof contents === 'string' ? contents : JSON.stringify(contents)
  );
  return file;
};

const setTTY = value => {
  Object.defineProperty(process.stdin, 'isTTY', {
    value,
    configurable: true
  });
};

const answerPrompt = reply => {
  const close = jest.fn();
  jest.spyOn(readline, 'createInterface').mockReturnValue({
    question: (_question, callback) => callback(reply),
    close
  });
  return close;
};

beforeEach(() => {
  credentialsFile = useTempConfigDir();
  jest.spyOn(console, 'log').mockImplementation();
  jest.spyOn(console, 'error').mockImplementation();
  process.exitCode = undefined;
});

afterEach(() => {
  jest.restoreAllMocks();
  axios.request.mockReset();
  delete process.env.FORMSPREE_API_KEY;
  delete process.stdin.isTTY;
  process.exitCode = undefined;
});

describe('forms list', () => {
  it('lists forms with their endpoints', async () => {
    login(credentialsFile);
    answer(200, { forms: [summary], links: { self: 'x' } });

    await list.handler({});

    expect(requests()).toEqual([
      { method: 'get', url: 'https://formspree.io/api/v1/forms' }
    ]);
    const shown = output(console.log);
    expect(shown).toContain('Contact form (xyzabcde)');
    expect(shown).toContain('https://formspree.io/f/xyzabcde');
  });

  it('narrows to one project with --project', async () => {
    login(credentialsFile);
    answer(200, { forms: [] });

    await list.handler({ project: 'proj_2pn3r0jq7zz0t' });

    expect(requests()[0].params).toEqual({ project_id: 'proj_2pn3r0jq7zz0t' });
    expect(output(console.log)).toContain('No forms yet');
  });
});

describe('forms get', () => {
  it('shows the fields, captcha and each action with its status', async () => {
    login(credentialsFile);
    answer(200, { form });

    await get.handler({ form: 'xyzabcde' });

    expect(requests()).toEqual([
      { method: 'get', url: 'https://formspree.io/api/v1/forms/xyzabcde' }
    ]);
    const shown = output(console.log);
    expect(shown).toContain('Contact form (xyzabcde)');
    expect(shown).toContain('https://formspree.io/f/xyzabcde');
    expect(shown).toContain('proj_2pn3r0jq7zz0t');
    expect(shown).toContain('email type email, required');
    expect(shown).toMatch(/reCAPTCHA\s+off/);
    expect(shown).toContain(
      'email to team@acme.example · pending verification'
    );
    expect(shown).toContain('mailchimp · needs connection');
    expect(shown).toContain('webhook · active');
    expect(shown).toContain('https://formspree.io/forms/xyzabcde');
  });
});

describe('forms create', () => {
  it('builds the body from the flags', async () => {
    login(credentialsFile);
    answer(200, { form, next_steps: nextSteps });

    await create.handler({
      name: 'Contact form',
      project: 'proj_2pn3r0jq7zz0t',
      formKey: 'contact',
      email: ['team@acme.example', 'sales@acme.example'],
      webhook: 'https://hooks.example/formspree',
      app: 'mailchimp',
      redirect: 'https://acme.example/thanks',
      recaptcha: false,
      idempotencyKey: 'deploy-42'
    });

    expect(requests()).toEqual([
      {
        method: 'post',
        url: 'https://formspree.io/api/v1/forms',
        data: {
          name: 'Contact form',
          key: 'contact',
          redirect: 'https://acme.example/thanks',
          captcha: null,
          actions: [
            {
              type: 'email',
              to: ['team@acme.example', 'sales@acme.example']
            },
            { type: 'webhook', url: 'https://hooks.example/formspree' },
            { app: 'mailchimp' }
          ],
          project_id: 'proj_2pn3r0jq7zz0t'
        }
      }
    ]);
    expect(headers()['Idempotency-Key']).toBe('deploy-42');
  });

  it('names a project and account, and turns reCAPTCHA on', async () => {
    login(credentialsFile);
    answer(200, { form, next_steps: nextSteps });

    await create.handler({
      projectName: 'Marketing site',
      account: 'acct_7d3f9a2c8e1b4f6a0c55',
      email: 'team@acme.example',
      recaptcha: true
    });

    expect(requests()[0].data).toEqual({
      captcha: { type: 'recaptcha' },
      actions: [{ type: 'email', to: ['team@acme.example'] }],
      project: 'Marketing site',
      account_id: 'acct_7d3f9a2c8e1b4f6a0c55'
    });
  });

  it('shows the endpoint and what is left to do', async () => {
    login(credentialsFile);
    answer(200, { form, next_steps: nextSteps });

    await create.handler({ name: 'Contact form' });

    const shown = output(console.log);
    expect(shown).toContain('Form created: Contact form (xyzabcde)');
    expect(shown).toContain('https://formspree.io/f/xyzabcde');
    expect(shown).toContain('pending verification');
    expect(shown).toContain('Next steps:');
    expect(shown).toContain('Ask the user to verify team@acme.example.');
    expect(shown).toContain('https://formspree.io/account');
    expect(process.exitCode).toBeUndefined();
  });

  it('takes the form from --from, with flags set over it', async () => {
    login(credentialsFile);
    answer(200, { form, next_steps: nextSteps });
    const from = jsonFile({
      name: 'From the file',
      fields: { email: { type: 'email', required: true } },
      actions: [
        { type: 'email', to: 'file@acme.example' },
        {
          type: 'autoresponse',
          fromName: 'Acme',
          subject: 'Hi',
          message: 'Thanks'
        },
        { app: 'slack' }
      ]
    });

    await create.handler({
      from,
      name: 'From the flag',
      email: 'flag@acme.example',
      app: ['mailchimp']
    });

    expect(requests()[0].data).toEqual({
      name: 'From the flag',
      fields: { email: { type: 'email', required: true } },
      actions: [
        {
          type: 'autoresponse',
          fromName: 'Acme',
          subject: 'Hi',
          message: 'Thanks'
        },
        { app: 'slack' },
        { type: 'email', to: ['flag@acme.example'] },
        { app: 'mailchimp' }
      ]
    });
  });

  it.each([
    ['{"name": ', 'is not valid JSON'],
    ['["a form"]', 'must hold a JSON object']
  ])('refuses a --from file holding %s', async (contents, reason) => {
    login(credentialsFile);

    await create.handler({ from: jsonFile(contents) });

    expect(axios.request).not.toHaveBeenCalled();
    expect(output(console.error)).toContain(reason);
    expect(process.exitCode).toBe(1);
  });

  it('refuses a --from file that is not there', async () => {
    login(credentialsFile);

    await create.handler({ from: '/nowhere/form.json' });

    expect(axios.request).not.toHaveBeenCalled();
    expect(output(console.error)).toContain(
      '/nowhere/form.json could not be read'
    );
    expect(process.exitCode).toBe(1);
  });

  it('lists what to fix in a body the server refuses', async () => {
    login(credentialsFile);
    answer(
      422,
      problem(422, 'Fix the fields listed in errors and try again.', {
        errors: [
          {
            path: 'actions.0.app',
            message: 'Use one of the apps in allowed.',
            allowed: ['mailchimp', 'slack']
          },
          { path: '', message: 'Send project_id or project, not both.' }
        ],
        example: { name: 'Contact form' }
      })
    );

    await create.handler({ app: 'fax' });

    const shown = output(console.error);
    expect(shown).toContain(
      'Fix the fields listed in errors and try again. (422)'
    );
    expect(shown).toContain(
      'actions.0.app: Use one of the apps in allowed. (allowed: mailchimp, slack)'
    );
    expect(shown).toContain('  Send project_id or project, not both.');
    expect(process.exitCode).toBe(1);
  });

  it('prints a refusal as JSON with --json, and still fails', async () => {
    login(credentialsFile);
    const refusal = problem(422, 'Fix the fields listed in errors.', {
      errors: [{ path: 'key', message: 'Another form has this key.' }]
    });
    answer(422, refusal);

    await create.handler({ formKey: 'contact', json: true });

    expect(JSON.parse(output(console.log))).toEqual(refusal);
    expect(console.error).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('links to the plans when the plan does not include something', async () => {
    login(credentialsFile);
    answer(
      403,
      problem(403, "The account's plan doesn't include a custom redirect.", {
        next_steps: [
          {
            step: 'Ask the user to upgrade',
            detail: 'They can compare plans and upgrade in the dashboard.',
            url: 'https://formspree.io/plans'
          }
        ]
      })
    );

    await create.handler({ redirect: 'https://acme.example/thanks' });

    const shown = output(console.error);
    expect(shown).toContain("doesn't include a custom redirect. (403)");
    expect(shown).toContain('https://formspree.io/plans');
    expect(process.exitCode).toBe(1);
  });
});

describe('forms update', () => {
  it('sends only what the flags name', async () => {
    login(credentialsFile);
    answer(200, { form: { ...form, name: 'Renamed' } });

    await update.handler({
      form: 'xyzabcde',
      name: 'Renamed',
      webhook: 'https://hooks.example/formspree'
    });

    expect(requests()).toEqual([
      {
        method: 'patch',
        url: 'https://formspree.io/api/v1/forms/xyzabcde',
        data: {
          name: 'Renamed',
          actions: [{ type: 'webhook', url: 'https://hooks.example/formspree' }]
        }
      }
    ]);
    expect(output(console.log)).toContain('Form updated: Renamed (xyzabcde)');
  });

  it('refuses to send a change that changes nothing', async () => {
    login(credentialsFile);

    await update.handler({ form: 'xyzabcde' });

    expect(axios.request).not.toHaveBeenCalled();
    expect(output(console.error)).toContain('Nothing to change');
    expect(process.exitCode).toBe(1);
  });
});

describe('forms delete', () => {
  it('deletes with --yes', async () => {
    login(credentialsFile);
    answer(204, '');

    await del.handler({ form: 'xyzabcde', yes: true });

    expect(requests()).toEqual([
      { method: 'delete', url: 'https://formspree.io/api/v1/forms/xyzabcde' }
    ]);
    expect(output(console.log)).toContain('Form deleted: xyzabcde');
    expect(process.exitCode).toBeUndefined();
  });

  it('refuses without --yes when nobody can confirm', async () => {
    login(credentialsFile);
    setTTY(false);

    await del.handler({ form: 'xyzabcde' });

    expect(axios.request).not.toHaveBeenCalled();
    expect(output(console.error)).toContain('--yes');
    expect(process.exitCode).toBe(1);
  });

  it('deletes once the prompt is answered yes', async () => {
    login(credentialsFile);
    setTTY(true);
    const close = answerPrompt('y');
    answer(204, '');

    await del.handler({ form: 'xyzabcde' });

    expect(close).toHaveBeenCalled();
    expect(requests()).toHaveLength(1);
    expect(output(console.log)).toContain('Form deleted: xyzabcde');
  });

  it.each(['', 'n', 'yess'])(
    'deletes nothing when the prompt is answered "%s"',
    async reply => {
      login(credentialsFile);
      setTTY(true);
      answerPrompt(reply);

      await del.handler({ form: 'xyzabcde' });

      expect(axios.request).not.toHaveBeenCalled();
      expect(output(console.log)).toContain('Nothing deleted');
      expect(process.exitCode).toBeUndefined();
    }
  );

  it('reports a form that is not there', async () => {
    login(credentialsFile);
    answer(404, problem(404, 'Nothing with that id exists.'));

    await del.handler({ form: 'nope', yes: true });

    expect(output(console.error)).toContain('Nothing with that id exists.');
    expect(output(console.log)).not.toContain('Form deleted');
    expect(process.exitCode).toBe(1);
  });
});

describe('forms validate', () => {
  const invalid = {
    valid: false,
    errors: [
      { field: 'email', message: 'Should be an email', code: 'TYPE_EMAIL' }
    ]
  };

  it('needs no login and sends no credential', async () => {
    process.env.FORMSPREE_API_KEY = 'fsk_from_env';
    answer(200, { valid: true, errors: [] });

    await validate.handler({
      form: 'xyzabcde',
      fields: [
        'email=ada@example.com',
        'message=a=b',
        'tag=1',
        'tag=2',
        'empty='
      ]
    });

    expect(requests()).toEqual([
      {
        method: 'post',
        url: 'https://formspree.io/api/v1/forms/xyzabcde/validate',
        data: {
          email: 'ada@example.com',
          message: 'a=b',
          tag: ['1', '2'],
          empty: ''
        }
      }
    ]);
    expect(headers().Authorization).toBeUndefined();
    expect(output(console.log)).toContain('The submission is valid');
    expect(process.exitCode).toBeUndefined();
  });

  it('lists the errors and fails when the submission is not valid', async () => {
    answer(200, invalid);

    await validate.handler({ form: 'xyzabcde', fields: ['email=nope'] });

    const shown = output(console.error);
    expect(shown).toContain('The submission is not valid');
    expect(shown).toContain('email: Should be an email');
    expect(process.exitCode).toBe(1);
  });

  it('prints the result as JSON with --json, and still fails', async () => {
    answer(200, invalid);

    await validate.handler({ form: 'xyzabcde', fields: [], json: true });

    expect(JSON.parse(output(console.log))).toEqual(invalid);
    expect(process.exitCode).toBe(1);
  });

  it('takes the submission from --from, with pairs set over it', async () => {
    answer(200, { valid: true, errors: [] });
    const from = jsonFile({ email: 'file@example.com', age: 30 });

    await validate.handler({
      form: 'xyzabcde',
      from,
      fields: ['email=pair@example.com']
    });

    expect(requests()[0].data).toEqual({ email: 'pair@example.com', age: 30 });
  });

  it.each(['email', '=value'])('refuses the pair "%s"', async pair => {
    await validate.handler({ form: 'xyzabcde', fields: [pair] });

    expect(axios.request).not.toHaveBeenCalled();
    expect(output(console.error)).toContain('is not a name=value pair');
    expect(process.exitCode).toBe(1);
  });

  it('reports a form that is not there', async () => {
    answer(404, problem(404, 'No form with that id exists.'));

    await validate.handler({ form: 'nope', fields: [] });

    expect(output(console.error)).toContain('No form with that id exists.');
    expect(process.exitCode).toBe(1);
  });
});
