import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTempConfigDir, output, plain, response } from '../helpers/oauth.ts';
import type { Account, Project } from '../../src/types.ts';
import {
  login,
  answer,
  requests,
  headers,
  problem,
  run,
  request,
} from '../helpers/v1.ts';
import { CTRL_C, setTTY, unsetTTY, answerPrompts } from '../helpers/clack.ts';
import { bannerAt } from '../helpers/banner.ts';
import chalk from 'chalk';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as log from '../../src/log.ts';
import { command as list } from '../../src/cmds/forms/list.ts';
import { command as get } from '../../src/cmds/forms/get.ts';
import { command as create } from '../../src/cmds/forms/create.ts';
import { command as update } from '../../src/cmds/forms/update.ts';
import { command as del } from '../../src/cmds/forms/delete.ts';
import { command as validate } from '../../src/cmds/forms/validate.ts';

/** A project as the tests list it: only what the questions read. */
type ListedProject = Pick<Project, 'id' | 'name'> & { account_id?: string };

vi.mock('axios');
vi.mock('@clack/prompts', () => import('../helpers/clack.ts'));

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
    dashboard: 'https://formspree.io/forms/xyzabcde',
  },
};

const form = {
  ...summary,
  fields: { email: { type: 'email', required: true } },
  captcha: null,
  actions: [
    {
      type: 'email',
      to: ['team@acme.example'],
      status: 'pending_verification',
    },
    { app: 'mailchimp', status: 'needs_connection' },
    { type: 'webhook', status: 'active' },
  ],
  submission_url: 'https://formspree.io/f/xyzabcde',
};

const nextSteps = [
  {
    step: 'wire_endpoint',
    detail: "Set your HTML form's action to submission_url.",
    url: 'https://formspree.io/f/xyzabcde',
  },
  {
    step: 'verify_email',
    detail: 'Ask the user to verify team@acme.example.',
    url: 'https://formspree.io/account',
  },
];

let credentialsFile: string;

const jsonFile = (contents: unknown): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'formspree-cli-'));
  const file = path.join(dir, 'form.json');
  fs.writeFileSync(
    file,
    typeof contents === 'string' ? contents : JSON.stringify(contents),
  );
  return file;
};

beforeEach(() => {
  credentialsFile = useTempConfigDir();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  process.exitCode = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  request.mockReset();
  delete process.env.FORMSPREE_API_KEY;
  unsetTTY();
  process.exitCode = undefined;
});

describe('forms list', () => {
  it('lists forms with their endpoints', async () => {
    login(credentialsFile);
    answer(200, { forms: [summary], links: { self: 'x' } });

    await run(list, {});

    expect(requests()).toEqual([
      { method: 'get', url: 'https://formspree.io/api/v1/forms' },
    ]);
    const shown = output(console.log);
    expect(shown).toContain('Contact form (xyzabcde)');
    expect(shown).toContain('https://formspree.io/f/xyzabcde');
  });

  it('narrows to one project with --project', async () => {
    login(credentialsFile);
    answer(200, { forms: [] });

    await run(list, { project: 'proj_2pn3r0jq7zz0t' });

    expect(requests()[0]?.params).toEqual({ project_id: 'proj_2pn3r0jq7zz0t' });
    expect(output(console.log)).toContain('No forms yet');
  });
});

describe('forms get', () => {
  it('shows the fields, captcha and each action with its status', async () => {
    login(credentialsFile);
    answer(200, { form });

    await run(get, { form: 'xyzabcde' });

    expect(requests()).toEqual([
      { method: 'get', url: 'https://formspree.io/api/v1/forms/xyzabcde' },
    ]);
    const shown = output(console.log);
    expect(shown).toContain('Contact form (xyzabcde)');
    expect(shown).toContain('https://formspree.io/f/xyzabcde');
    expect(shown).toContain('proj_2pn3r0jq7zz0t');
    expect(shown).toContain('email type email, required');
    expect(shown).toMatch(/reCAPTCHA\s+off/);
    expect(shown).toContain(
      'email to team@acme.example · pending verification',
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

    await run(create, {
      name: 'Contact form',
      project: 'proj_2pn3r0jq7zz0t',
      formKey: 'contact',
      email: ['team@acme.example', 'sales@acme.example'],
      webhook: 'https://hooks.example/formspree',
      app: ['mailchimp'],
      redirect: 'https://acme.example/thanks',
      recaptcha: false,
      idempotencyKey: 'deploy-42',
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
              to: ['team@acme.example', 'sales@acme.example'],
            },
            { type: 'webhook', url: 'https://hooks.example/formspree' },
            { app: 'mailchimp' },
          ],
          project_id: 'proj_2pn3r0jq7zz0t',
        },
      },
    ]);
    expect(headers()['Idempotency-Key']).toBe('deploy-42');
  });

  it('names a project and account, and turns reCAPTCHA on', async () => {
    login(credentialsFile);
    answer(200, { form, next_steps: nextSteps });

    await run(create, {
      projectName: 'Marketing site',
      account: 'acct_7d3f9a2c8e1b4f6a0c55',
      email: ['team@acme.example'],
      recaptcha: true,
    });

    expect(requests()[0]?.data).toEqual({
      captcha: { type: 'recaptcha' },
      actions: [{ type: 'email', to: ['team@acme.example'] }],
      project: 'Marketing site',
      account_id: 'acct_7d3f9a2c8e1b4f6a0c55',
    });
  });

  it('shows the endpoint and what is left to do', async () => {
    login(credentialsFile);
    answer(200, { form, next_steps: nextSteps });
    const { framed } = answerPrompts();

    await run(create, { name: 'Contact form' });

    // One note says it was created, over its details, and what's left
    // is in a box. The HTML between them has nothing around it.
    expect(framed.map(({ kind, title }) => `${kind}: ${title}`)).toEqual([
      'note: Form created: Contact form (xyzabcde)',
      'box: Next steps',
    ]);
    expect(framed.every((drawn) => !drawn.stderr)).toBe(true);
    expect(output(console.log).match(/Form created/g)).toHaveLength(1);

    const [details, steps] = framed;
    expect(details?.message).toMatch(
      /^Submit to {2}https:\/\/formspree\.io\/f\/xyzabcde$/m,
    );
    expect(details?.message).toContain('pending verification');
    // Off a set of questions, the note stands on its own.
    expect(details?.guide).toBe(false);
    expect(steps?.message).toBe(
      [
        '- Ask the user to verify team@acme.example.',
        '  https://formspree.io/account',
      ].join('\n'),
    );
    expect(process.exitCode).toBeUndefined();
  });

  it('prints the form as plain text when the output is piped', async () => {
    vi.stubEnv('FORCE_COLOR', '0');
    login(credentialsFile);
    answer(200, { form, next_steps: nextSteps });
    const { framed } = answerPrompts();

    await run(create, { name: 'Contact form' });
    vi.unstubAllEnvs();

    // Nothing is framed: no note, no box.
    expect(framed).toEqual([]);
    const shown = output(console.log).split('\n');
    expect(shown[0]).toBe('✔ Form created: Contact form (xyzabcde)');
    expect(shown).toContain('  Next steps:');
    expect(shown).toContain('  - Ask the user to verify team@acme.example.');
    expect(output(console.log)).toMatch(
      /^ {2}Submit to {2}https:\/\/formspree\.io\/f\/xyzabcde$/m,
    );
  });

  describe("the new form's id", () => {
    // What turns text the Formspree red, as the banner is.
    const RED = chalk.bold.red('|').split('|')[0];
    const raw = (): string =>
      vi
        .mocked(console.log)
        .mock.calls.map((args) => args.join(' '))
        .join('\n');

    it('is printed in the Formspree red, as the banner is', async () => {
      login(credentialsFile);
      answer(200, { form, next_steps: nextSteps });
      answerPrompts();

      await run(create, { name: 'Contact form' });

      expect(raw()).toContain(`${RED}xyzabcde`);
      expect(log.banner()).toContain(`${RED}█`);
      // Still the same words.
      expect(output(console.log)).toContain(
        'Form created: Contact form (xyzabcde)',
      );
    });

    it('is left gray where the form is only listed', async () => {
      login(credentialsFile);
      answer(200, { forms: [summary] });

      await run(list, {});

      expect(output(console.log)).toContain('Contact form (xyzabcde)');
      expect(raw()).not.toContain(RED);
    });
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
          message: 'Thanks',
        },
        { app: 'slack' },
      ],
    });

    await run(create, {
      from,
      name: 'From the flag',
      email: ['flag@acme.example'],
      app: ['mailchimp'],
    });

    expect(requests()[0]?.data).toEqual({
      name: 'From the flag',
      fields: { email: { type: 'email', required: true } },
      actions: [
        {
          type: 'autoresponse',
          fromName: 'Acme',
          subject: 'Hi',
          message: 'Thanks',
        },
        { app: 'slack' },
        { type: 'email', to: ['flag@acme.example'] },
        { app: 'mailchimp' },
      ],
    });
  });

  it.each([
    ['{"name": ', 'is not valid JSON'],
    ['["a form"]', 'must hold a JSON object'],
  ])('refuses a --from file holding %s', async (contents, reason) => {
    login(credentialsFile);

    await run(create, { from: jsonFile(contents) });

    expect(request).not.toHaveBeenCalled();
    expect(output(console.error)).toContain(reason);
    expect(process.exitCode).toBe(2);
  });

  it('refuses a --from file that is not there', async () => {
    login(credentialsFile);

    await run(create, { from: '/nowhere/form.json' });

    expect(request).not.toHaveBeenCalled();
    expect(output(console.error)).toContain(
      '/nowhere/form.json could not be read',
    );
    expect(process.exitCode).toBe(2);
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
            allowed: ['mailchimp', 'slack'],
          },
          { path: '', message: 'Send project_id or project, not both.' },
        ],
        example: { name: 'Contact form' },
      }),
    );

    await run(create, { app: ['fax'] });

    const shown = output(console.error);
    expect(shown).toContain(
      'Fix the fields listed in errors and try again. (422)',
    );
    expect(shown).toContain(
      'actions.0.app: Use one of the apps in allowed. (allowed: mailchimp, slack)',
    );
    expect(shown).toContain('  Send project_id or project, not both.');
    expect(process.exitCode).toBe(1);
  });

  it('prints a refusal as JSON with --json, and still fails', async () => {
    login(credentialsFile);
    const refusal = problem(422, 'Fix the fields listed in errors.', {
      errors: [{ path: 'key', message: 'Another form has this key.' }],
    });
    answer(422, refusal);

    await run(create, { formKey: 'contact', json: true });

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
            url: 'https://formspree.io/plans',
          },
        ],
      }),
    );

    const { framed } = answerPrompts();

    await run(create, { redirect: 'https://acme.example/thanks' });

    const shown = output(console.error);
    expect(shown).toContain("doesn't include a custom redirect. (403)");
    // The way out is boxed too, on stderr with the error.
    expect(framed).toEqual([
      {
        kind: 'box',
        title: 'Next steps',
        message: [
          '- They can compare plans and upgrade in the dashboard.',
          '  https://formspree.io/plans',
        ].join('\n'),
        stderr: true,
        guide: false,
      },
    ]);
    expect(output(console.log)).not.toContain('https://formspree.io/plans');
    expect(process.exitCode).toBe(1);
  });
});

describe('forms create, showing how to use the form', () => {
  const WEBSITE_SNIPPET = [
    '<!-- modify this form HTML and place wherever you want your form -->',
    '<form',
    '  action="https://formspree.io/f/xyzabcde"',
    '  method="POST"',
    '>',
    '  <label>',
    '    Your email:',
    '    <input type="email" name="email">',
    '  </label>',
    '  <label>',
    '    Your message:',
    '    <textarea name="message"></textarea>',
    '  </label>',
    '  <!-- your other form fields go here -->',
    '  <button type="submit">Send</button>',
    '</form>',
  ];

  // Console output with its colors, to see what was highlighted.
  const colored = () =>
    vi
      .mocked(console.log)
      .mock.calls.map((args) => args.join(' '))
      .join('\n');

  beforeEach(() => login(credentialsFile));

  it("prints the dashboard's HTML snippet for a form with no field rules", async () => {
    answer(200, { form: { ...form, fields: {} }, next_steps: nextSteps });
    const { framed } = answerPrompts();

    await run(create, { name: 'Contact form' });

    expect(output(console.log)).toContain(
      WEBSITE_SNIPPET.map((line) => `  ${line}`).join('\n'),
    );
    // Nothing is drawn around it, so it copies out of the terminal clean.
    expect(framed.some((drawn) => drawn.message.includes('<form'))).toBe(false);
  });

  it('links to the code examples in the dashboard', async () => {
    answer(200, { form, next_steps: nextSteps });

    await run(create, { name: 'Contact form' });

    expect(output(console.log)).toMatch(
      /Code examples\s+https:\/\/formspree\.io\/forms\/xyzabcde\/integration/,
    );
  });

  it('works the link out from the endpoint when the form has no links', async () => {
    const { links, ...bare } = form;
    answer(200, { form: bare, next_steps: nextSteps });

    await run(create, { name: 'Contact form' });

    expect(links.dashboard).toBe('https://formspree.io/forms/xyzabcde');
    expect(output(console.log)).toContain(
      'https://formspree.io/forms/xyzabcde/integration',
    );
  });

  it('leaves out the step the snippet already covers', async () => {
    answer(200, { form, next_steps: nextSteps });

    await run(create, { name: 'Contact form' });

    const shown = output(console.log);
    expect(shown).not.toContain("Set your HTML form's action");
    expect(shown).toContain('Ask the user to verify team@acme.example.');
  });

  it('prints no next steps when wiring the endpoint was the only one', async () => {
    answer(200, { form, next_steps: [nextSteps[0]] });
    const { framed } = answerPrompts();

    await run(create, { name: 'Contact form' });

    expect(framed.map((drawn) => drawn.title)).toEqual([
      'Form created: Contact form (xyzabcde)',
    ]);
  });

  it("builds the snippet from the form's own fields when it has rules", async () => {
    const fields = {
      name: { required: true },
      email: { type: 'email', required: true },
      age: { type: 'numeric' },
      when: { type: 'datetime-local' },
      site: { type: 'url' },
      cv: { type: 'file' },
      message: { required: true },
    };
    answer(200, { form: { ...form, fields }, next_steps: nextSteps });

    await run(create, { name: 'Contact form' });

    const shown = output(console.log);
    expect(shown).toContain('  enctype="multipart/form-data"');
    expect(shown).toContain(
      'Name:\n      <input type="text" name="name" required>',
    );
    expect(shown).toContain('<input type="email" name="email" required>');
    expect(shown).toContain('<input type="number" name="age">');
    expect(shown).toContain('<input type="datetime-local" name="when">');
    expect(shown).toContain('<input type="url" name="site">');
    expect(shown).toContain('<input type="file" name="cv">');
    expect(shown).toContain(
      'Your message:\n      <textarea name="message" required></textarea>\n    </label>\n    <!-- your other',
    );
    expect(shown.match(/name="email"/g)).toHaveLength(1);
  });

  it("keeps the dashboard's email and message beside a form's own fields", async () => {
    const fields = { phone: { required: true } };
    answer(200, { form: { ...form, fields }, next_steps: nextSteps });

    await run(create, { name: 'Contact form' });

    const shown = output(console.log);
    const order = ['name="phone" required', 'name="email"', 'name="message"'];
    expect(order.map((text) => shown.indexOf(text))).toEqual(
      order.map((text) => shown.indexOf(text)).sort((a, b) => a - b),
    );
    expect(shown).toContain('Phone:');
    expect(shown).toContain(
      'Your email:\n      <input type="email" name="email">',
    );
    expect(shown).toContain('<textarea name="message"></textarea>');
  });

  it('gives the message an input of its own type when its rules name one', async () => {
    const fields = { message: { type: 'file', required: true } };
    answer(200, { form: { ...form, fields }, next_steps: nextSteps });

    await run(create, { name: 'Contact form' });

    const shown = output(console.log);
    // A textarea couldn't upload it.
    expect(shown).toContain(
      'Your message:\n      <input type="file" name="message" required>',
    );
    expect(shown).not.toContain('<textarea');
    expect(shown).toContain('  enctype="multipart/form-data"');
  });

  it('keeps the message a textarea when its rules say it is text', async () => {
    const fields = { message: { type: 'text', required: true } };
    answer(200, { form: { ...form, fields }, next_steps: nextSteps });

    await run(create, { name: 'Contact form' });

    expect(output(console.log)).toContain(
      '<textarea name="message" required></textarea>',
    );
  });

  it('adds no enctype without a file field', async () => {
    answer(200, { form, next_steps: nextSteps });

    await run(create, { name: 'Contact form' });

    expect(output(console.log)).not.toContain('enctype');
  });

  it('escapes a field name that would break the HTML', async () => {
    const fields = { 'a"b<c>&': {} };
    answer(200, { form: { ...form, fields }, next_steps: nextSteps });

    await run(create, { name: 'Contact form' });

    expect(output(console.log)).toContain(
      '<input type="text" name="a&quot;b&lt;c&gt;&amp;">',
    );
  });

  it('colors the snippet without changing a character of it', async () => {
    // The tests run with colors on: see vitest.config.ts.
    answer(200, { form: { ...form, fields: {} }, next_steps: nextSteps });

    await run(create, { name: 'Contact form' });

    const raw = colored();
    // Comments, tag names, attribute names and attribute values.
    expect(raw).toContain(chalk.gray(WEBSITE_SNIPPET[0]));
    expect(raw).toContain(`${chalk.gray('<')}${chalk.cyan('form')}`);
    expect(raw).toContain(
      `${chalk.yellow('action')}=${chalk.green(
        '"https://formspree.io/f/xyzabcde"',
      )}`,
    );
    expect(raw).toContain(`${chalk.gray('</')}${chalk.cyan('label')}`);
    expect(raw).toContain('\u001b[');

    expect(output(console.log)).toContain(
      WEBSITE_SNIPPET.map((line) => `  ${line}`).join('\n'),
    );
  });

  it('prints no snippet with --json', async () => {
    const body = { form, next_steps: nextSteps };
    answer(200, body);
    const { framed } = answerPrompts();

    await run(create, { name: 'Contact form', json: true });

    expect(JSON.parse(output(console.log))).toEqual(body);
    expect(framed).toEqual([]);
  });
});

describe('forms create, asking', () => {
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
  const marketing: ListedProject = {
    id: 'proj_2pn3r0jq7zz0t',
    name: 'Marketing site',
  };
  const docs: ListedProject = { id: 'proj_docs000000000', name: 'Docs' };

  // The questions, as the stand-in for clack records them.
  const NAME = {
    kind: 'text',
    message: 'Form name',
    placeholder: 'New Form',
  };
  const PROJECT = {
    kind: 'select',
    message: 'Project',
    options: ['Marketing site', 'Docs', 'Default Project', 'New project…'],
  };
  const PROJECT_NAME = {
    kind: 'text',
    message: 'Project name',
    placeholder: 'Default Project',
  };
  const ACCOUNT = {
    kind: 'select',
    message: 'Account',
    options: ['Personal account', 'Acme Agency'],
  };
  const EMAIL = {
    kind: 'text',
    message: 'Email submissions to (optional)',
    placeholder: 'you@example.com, team@example.com',
  };
  const WEBHOOK = {
    kind: 'text',
    message: 'Webhook URL (optional)',
    placeholder: 'https://example.com/hook',
  };
  const APPS = expect.objectContaining({
    kind: 'multiselect',
    message: 'Apps to connect (optional)',
  });
  const REDIRECT = {
    kind: 'text',
    message: 'Redirect after submitting (optional)',
    placeholder: 'https://example.com/thanks',
  };
  const RECAPTCHA = {
    kind: 'select',
    message: 'reCAPTCHA',
    options: ['On', 'Off'],
  };
  const CONTENTS = [EMAIL, WEBHOOK, APPS, REDIRECT, RECAPTCHA];

  // Answers the lookups the questions need, then the create.
  const serve = ({
    accounts = [account],
    projects = [marketing, docs],
  }: {
    accounts?: Account[];
    projects?: ListedProject[] | null;
  }) => {
    request.mockImplementation((config) => {
      if (config.method === 'post') {
        return response(200, { form, next_steps: nextSteps });
      }
      if (config.url.endsWith('/api/v1/accounts')) {
        return response(200, { accounts });
      }
      return projects
        ? response(200, { projects })
        : response(403, problem(403, 'This key lacks projects:read.'));
    });
  };

  const created = () => requests().filter((r) => r.method === 'post');

  beforeEach(() => {
    login(credentialsFile);
    setTTY(true);
  });

  it('asks for every value when no option is given', async () => {
    serve({});
    const { asked, framed, intro, outro, spinner } = answerPrompts([
      'Contact form',
      'Docs',
      'team@acme.example, sales@acme.example',
      'https://hooks.example/formspree',
      ['Slack', 'Mailchimp'],
      'https://acme.example/thanks',
      'Off',
    ]);

    await run(create, {});

    expect(intro).toHaveBeenCalledWith('New form', expect.anything());
    // The banner heads the questions, on stderr with them.
    expect(bannerAt(output(console.error).split('\n'))).toBe(1);
    expect(bannerAt(output(console.log).split('\n'))).toBe(-1);
    expect(asked).toEqual([NAME, PROJECT, ...CONTENTS]);
    expect(requests().map((r) => `${r.method} ${r.url}`)).toEqual([
      'get https://formspree.io/api/v1/accounts',
      'get https://formspree.io/api/v1/projects',
      'post https://formspree.io/api/v1/forms',
    ]);
    expect(created()[0]?.data).toEqual({
      name: 'Contact form',
      redirect: 'https://acme.example/thanks',
      captcha: null,
      actions: [
        { type: 'email', to: ['team@acme.example', 'sales@acme.example'] },
        { type: 'webhook', url: 'https://hooks.example/formspree' },
        { app: 'slack' },
        { app: 'mailchimp' },
      ],
      project_id: 'proj_docs000000000',
    });
    expect(spinner.start).toHaveBeenCalledWith('Creating the form');
    // The spinner leaves no line of its own: the note says it was created.
    expect(spinner.clear).toHaveBeenCalledTimes(1);
    expect(spinner.stop).not.toHaveBeenCalled();
    expect(framed.map(({ kind, title }) => `${kind}: ${title}`)).toEqual([
      'note: Form created: Contact form (xyzabcde)',
      'box: Next steps',
    ]);
    // The note is joined to the questions, which end under it.
    expect(framed[0]?.guide).toBe(true);
    expect(outro).toHaveBeenCalledWith(
      'Add it to your site with the HTML below.',
      expect.anything(),
    );
    // Said once, then the HTML with nothing around it.
    const shown = output(console.log);
    expect(shown.match(/Form created/g)).toHaveLength(1);
    expect(shown).toContain('  <form');
    expect(shown).toContain('Code examples');
  });

  it('stops the spinner with an error when the form is not created', async () => {
    request.mockImplementation((config) => {
      if (config.method === 'post') {
        return response(403, problem(403, "The plan doesn't include this."));
      }
      return config.url.endsWith('/accounts')
        ? response(200, { accounts: [account] })
        : response(200, { projects: [] });
    });
    const { outro, spinner } = answerPrompts([]);

    await run(create, {});

    expect(spinner.error).toHaveBeenCalledWith('The form was not created');
    expect(spinner.stop).not.toHaveBeenCalled();
    expect(outro).not.toHaveBeenCalled();
    expect(output(console.error)).toContain(
      "The plan doesn't include this. (403)",
    );
    expect(process.exitCode).toBe(1);
  });

  it('asks again for an email address or URL the API would refuse', async () => {
    serve({});
    const { asked } = answerPrompts([
      '',
      '',
      'not-an-address',
      'team@acme.example',
      'hooks.example/formspree',
      'https://hooks.example/formspree',
      [],
      'ftp://acme.example/thanks',
      'https://acme.example/thanks',
    ]);

    await run(create, {});

    // The stand-in asks again within the one question, as clack does.
    expect(asked).toEqual([NAME, PROJECT, ...CONTENTS]);
    expect(created()[0]?.data).toEqual({
      captcha: null,
      name: 'New Form',
      redirect: 'https://acme.example/thanks',
      actions: [
        { type: 'email', to: ['team@acme.example'] },
        { type: 'webhook', url: 'https://hooks.example/formspree' },
      ],
    });
  });

  it('sends the default name, with reCAPTCHA off, when every question is left as it is', async () => {
    serve({});
    answerPrompts([]);

    await run(create, {});

    expect(created()[0]?.data).toEqual({ name: 'New Form', captcha: null });
    expect(process.exitCode).toBeUndefined();
  });

  it('skips the name question when the name was given', async () => {
    serve({});
    const { asked } = answerPrompts([]);

    await run(create, { name: 'Contact form' });

    expect(asked).toEqual([PROJECT, ...CONTENTS]);
    expect(created()[0]?.data).toEqual({ name: 'Contact form', captcha: null });
  });

  it('asks for a name, and insists on one, when a new project is picked', async () => {
    serve({});
    const { asked } = answerPrompts([
      '',
      'New project…',
      '  ',
      'Landing pages',
    ]);

    await run(create, {});

    expect(asked.slice(0, 3)).toEqual([
      NAME,
      PROJECT,
      { kind: 'text', message: 'Project name' },
    ]);
    expect(created()[0]?.data).toEqual({
      captcha: null,
      name: 'New Form',
      project: 'Landing pages',
    });
  });

  it('offers the default project once, starting on it when it exists', async () => {
    const standing = { id: 'proj_default000000', name: 'Default Project' };
    serve({ projects: [marketing, standing] });
    const { asked } = answerPrompts([]);

    await run(create, {});

    expect(asked[1]?.options).toEqual([
      'Marketing site',
      'Default Project',
      'New project…',
    ]);
    expect(created()[0]?.data).toEqual({
      captcha: null,
      name: 'New Form',
      project_id: 'proj_default000000',
    });
  });

  it("asks for a project's name when there are none to pick from", async () => {
    serve({ projects: [] });
    const { asked } = answerPrompts(['', 'Landing pages']);

    await run(create, {});

    expect(asked[1]).toEqual(PROJECT_NAME);
    expect(created()[0]?.data).toEqual({
      captcha: null,
      name: 'New Form',
      project: 'Landing pages',
    });
  });

  it('still asks when the login cannot list projects', async () => {
    serve({ projects: null });
    const { asked } = answerPrompts(['Contact form']);

    await run(create, {});

    expect(asked[1]).toEqual(PROJECT_NAME);
    expect(created()[0]?.data).toEqual({ name: 'Contact form', captcha: null });
    expect(output(console.error)).not.toContain('projects:read');
    expect(process.exitCode).toBeUndefined();
  });

  it('asks which account when there are several and no existing project is picked', async () => {
    serve({ accounts: [personal, account] });
    const { asked } = answerPrompts(['', 'Default Project', 'Acme Agency']);

    await run(create, {});

    expect(asked).toEqual([NAME, PROJECT, ACCOUNT, ...CONTENTS]);
    expect(created()[0]?.data).toEqual({
      captcha: null,
      name: 'New Form',
      account_id: 'acct_7d3f9a2c8e1b4f6a0c55',
    });
  });

  it('asks for no account when an existing project is picked', async () => {
    serve({ accounts: [personal, account] });
    const { asked } = answerPrompts(['', 'Marketing site']);

    await run(create, {});

    expect(asked).toEqual([NAME, PROJECT, ...CONTENTS]);
    expect(created()[0]?.data).toEqual({
      captcha: null,
      name: 'New Form',
      project_id: 'proj_2pn3r0jq7zz0t',
    });
  });

  it('lists the apps to tick by name, and sends the ids of the ones ticked', async () => {
    serve({});
    const { asked } = answerPrompts([
      '',
      '',
      '',
      '',
      ['GitHub', 'Google Sheets'],
    ]);

    await run(create, {});

    // Each app is listed by the name people know it by, not the API's id.
    const apps = asked.find((question) => question.kind === 'multiselect');
    expect(apps?.options).toHaveLength(25);
    expect(apps?.options?.slice(0, 4)).toEqual([
      'ActiveCampaign',
      'Airtable',
      'Asana',
      'Constant Contact',
    ]);
    expect(apps?.options).toContain('Zendesk');
    expect(apps?.options).not.toContain('googlesheets');
    expect(created()[0]?.data).toEqual({
      captcha: null,
      name: 'New Form',
      actions: [{ app: 'github' }, { app: 'googlesheets' }],
    });
  });

  it.each([
    ['On', { type: 'recaptcha' }],
    ['Off', null],
  ])('turns reCAPTCHA %s', async (choice, captcha) => {
    serve({});
    answerPrompts(['', '', '', '', [], '', choice]);

    await run(create, {});

    expect(created()[0]?.data).toEqual({ name: 'New Form', captcha });
  });

  it('asks for the rest when --project says where the form goes', async () => {
    serve({ accounts: [personal, account] });
    const { asked } = answerPrompts(['Contact form', 'team@acme.example']);

    await run(create, { project: 'proj_2pn3r0jq7zz0t' });

    expect(asked).toEqual([NAME, ...CONTENTS]);
    // Nothing to pick from, so the projects aren't listed.
    expect(requests().map((r) => `${r.method} ${r.url}`)).toEqual([
      'get https://formspree.io/api/v1/accounts',
      'post https://formspree.io/api/v1/forms',
    ]);
    expect(created()[0]?.data).toEqual({
      captcha: null,
      name: 'Contact form',
      actions: [{ type: 'email', to: ['team@acme.example'] }],
      project_id: 'proj_2pn3r0jq7zz0t',
    });
  });

  it('asks for the account, not the project, when --project-name is given', async () => {
    serve({ accounts: [personal, account] });
    const { asked } = answerPrompts(['', 'Acme Agency']);

    await run(create, { projectName: 'Landing pages' });

    expect(asked).toEqual([NAME, ACCOUNT, ...CONTENTS]);
    expect(created()[0]?.data).toEqual({
      captcha: null,
      name: 'New Form',
      project: 'Landing pages',
      account_id: 'acct_7d3f9a2c8e1b4f6a0c55',
    });
  });

  describe('with --account', () => {
    const theirs = { ...marketing, account_id: account.id };
    const mine = { ...docs, account_id: personal.id };

    it("lists only that account's projects, and sends a picked one alone", async () => {
      serve({ accounts: [personal, account], projects: [mine, theirs] });
      const { asked } = answerPrompts(['', 'Marketing site']);

      await run(create, { account: account.id });

      expect(asked[1]?.options).toEqual([
        'Marketing site',
        'Default Project',
        'New project…',
      ]);
      expect(asked).toHaveLength(7);
      // The API takes a project or an account, not both.
      expect(created()[0]?.data).toEqual({
        captcha: null,
        name: 'New Form',
        project_id: 'proj_2pn3r0jq7zz0t',
      });
    });

    it('asks for no account, and sends the one given', async () => {
      serve({ accounts: [personal, account], projects: [mine, theirs] });
      const { asked } = answerPrompts([]);

      await run(create, { account: account.id });

      expect(asked.map((question) => question.message)).not.toContain(
        'Account',
      );
      expect(created()[0]?.data).toEqual({
        captcha: null,
        name: 'New Form',
        account_id: account.id,
      });
    });
  });

  it('creates nothing when the questions are abandoned', async () => {
    serve({});
    const { cancel, spinner } = answerPrompts(['Contact form', CTRL_C]);

    await run(create, {});

    expect(created()).toEqual([]);
    expect(cancel).toHaveBeenCalledWith(
      'Cancelled. Nothing was changed.',
      expect.anything(),
    );
    expect(spinner.start).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(130);
  });

  it.each([
    ['an option is given', () => ({ email: ['team@acme.example'] })],
    ['--from is given', () => ({ from: jsonFile({ name: 'From the file' }) })],
    ['--no-interactive is given', () => ({ interactive: false })],
    ['--json is given', () => ({ json: true })],
  ])('asks nothing when %s', async (_case, args) => {
    serve({});
    const { asked } = answerPrompts([]);

    await run(create, args());

    expect(asked).toEqual([]);
    expect(requests()).toHaveLength(1);
    expect(requests()[0]?.method).toBe('post');
  });

  it('asks nothing when nobody is at a terminal', async () => {
    serve({});
    setTTY(false);
    const { asked } = answerPrompts([]);

    await run(create, {});

    expect(asked).toEqual([]);
    expect(bannerAt(output(console.error).split('\n'))).toBe(-1);
    expect(requests()).toHaveLength(1);
    expect(created()[0]?.data).toEqual({});
  });

  it('asks nothing when there is no login to ask on behalf of', async () => {
    fs.unlinkSync(credentialsFile);
    const { asked } = answerPrompts([]);

    await run(create, {});

    expect(asked).toEqual([]);
    expect(request).not.toHaveBeenCalled();
    expect(output(console.error)).toContain('formspree login');
    expect(process.exitCode).toBe(4);
  });
});

describe('forms update', () => {
  it('sends only what the flags name', async () => {
    login(credentialsFile);
    answer(200, { form: { ...form, name: 'Renamed' } });

    await run(update, {
      form: 'xyzabcde',
      name: 'Renamed',
      webhook: 'https://hooks.example/formspree',
    });

    expect(requests()).toEqual([
      {
        method: 'patch',
        url: 'https://formspree.io/api/v1/forms/xyzabcde',
        data: {
          name: 'Renamed',
          actions: [
            { type: 'webhook', url: 'https://hooks.example/formspree' },
          ],
        },
      },
    ]);
    expect(output(console.log)).toContain('Form updated: Renamed (xyzabcde)');
  });

  it('refuses to send a change that changes nothing', async () => {
    login(credentialsFile);

    await run(update, { form: 'xyzabcde' });

    expect(request).not.toHaveBeenCalled();
    expect(output(console.error)).toContain('Nothing to change');
    expect(process.exitCode).toBe(2);
  });
});

describe('forms delete', () => {
  it('deletes with --yes', async () => {
    login(credentialsFile);
    answer(204, '');

    await run(del, { form: 'xyzabcde', yes: true });

    expect(requests()).toEqual([
      { method: 'delete', url: 'https://formspree.io/api/v1/forms/xyzabcde' },
    ]);
    expect(output(console.log)).toContain('Form deleted: xyzabcde');
    expect(process.exitCode).toBeUndefined();
  });

  it('refuses without --yes when nobody can confirm', async () => {
    login(credentialsFile);
    setTTY(false);

    await run(del, { form: 'xyzabcde' });

    expect(request).not.toHaveBeenCalled();
    expect(output(console.error)).toContain('--yes');
    expect(process.exitCode).toBe(2);
  });

  it('deletes once the prompt is answered yes', async () => {
    login(credentialsFile);
    setTTY(true);
    const { asked } = answerPrompts([true]);
    answer(204, '');

    await run(del, { form: 'xyzabcde' });

    expect(asked).toEqual([
      {
        kind: 'confirm',
        message: 'Delete form xyzabcde and its submissions?',
      },
    ]);
    expect(requests()).toHaveLength(1);
    expect(output(console.log)).toContain('Form deleted: xyzabcde');
  });

  it.each([
    ['answered no', [false]],
    ['left at its default', []],
  ])('deletes nothing when the prompt is %s', async (_case, answers) => {
    login(credentialsFile);
    setTTY(true);
    answerPrompts(answers);

    await run(del, { form: 'xyzabcde' });

    expect(request).not.toHaveBeenCalled();
    expect(output(console.log)).toContain('Nothing deleted');
    expect(process.exitCode).toBeUndefined();
  });

  it('deletes nothing when the prompt is abandoned with Ctrl+C', async () => {
    login(credentialsFile);
    setTTY(true);
    const { cancel } = answerPrompts([CTRL_C]);

    await run(del, { form: 'xyzabcde' });

    expect(request).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledWith(
      'Cancelled. Nothing was changed.',
      expect.anything(),
    );
    expect(process.exitCode).toBe(130);
  });

  describe('with no form named', () => {
    const other = { ...summary, name: 'Newsletter', hashid: 'mnopqrst' };
    const PICKER = {
      kind: 'select',
      message: 'Form to delete',
      options: ['Contact form', 'Newsletter'],
    };

    // Answers the list the picker needs, then the delete.
    const serve = (listed: unknown[] = [summary, other]) => {
      request.mockImplementation((config) =>
        config.method === 'delete'
          ? response(204, '')
          : response(200, { forms: listed }),
      );
    };

    beforeEach(() => {
      login(credentialsFile);
      setTTY(true);
    });

    it('lists the forms to pick from, then asks before deleting', async () => {
      serve();
      const { asked } = answerPrompts(['Newsletter', true]);

      await run(del, {});

      // The form's id is grayed in the question; the words are what count.
      expect(
        asked.map((question) => ({
          ...question,
          message: plain(question.message),
        })),
      ).toEqual([
        PICKER,
        {
          kind: 'confirm',
          message: 'Delete form Newsletter (mnopqrst) and its submissions?',
        },
      ]);
      expect(requests()).toEqual([
        { method: 'get', url: 'https://formspree.io/api/v1/forms' },
        {
          method: 'delete',
          url: 'https://formspree.io/api/v1/forms/mnopqrst',
        },
      ]);
      expect(output(console.log)).toContain(
        'Form deleted: Newsletter (mnopqrst)',
      );
      // One question and a confirmation aren't a form: no banner.
      expect(bannerAt(output(console.error).split('\n'))).toBe(-1);
    });

    it('deletes nothing when the confirmation is declined', async () => {
      serve();
      answerPrompts(['Newsletter', false]);

      await run(del, {});

      expect(requests().map((r) => r.method)).toEqual(['get']);
      expect(output(console.log)).toContain('Nothing deleted');
    });

    it('deletes the picked form without asking again, with --yes', async () => {
      serve();
      const { asked } = answerPrompts(['Contact form']);

      await run(del, { yes: true });

      expect(asked).toEqual([PICKER]);
      expect(requests()[1]).toEqual({
        method: 'delete',
        url: 'https://formspree.io/api/v1/forms/xyzabcde',
      });
    });

    it('deletes nothing when the picker is abandoned', async () => {
      serve();
      const { cancel } = answerPrompts([CTRL_C]);

      await run(del, {});

      expect(requests().map((r) => r.method)).toEqual(['get']);
      expect(cancel).toHaveBeenCalled();
      expect(process.exitCode).toBe(130);
    });

    it('says so when there are no forms to pick from', async () => {
      serve([]);
      const { asked } = answerPrompts([]);

      await run(del, {});

      expect(asked).toEqual([]);
      expect(requests().map((r) => r.method)).toEqual(['get']);
      expect(output(console.log)).toContain('No forms to delete');
      expect(process.exitCode).toBeUndefined();
    });

    it('reports why the forms could not be listed, and deletes nothing', async () => {
      answer(403, problem(403, 'This key lacks project.forms:read.'));
      const { asked } = answerPrompts([]);

      await run(del, {});

      expect(asked).toEqual([]);
      expect(requests()).toHaveLength(1);
      expect(output(console.error)).toContain(
        'This key lacks project.forms:read. (403)',
      );
      expect(process.exitCode).toBe(1);
    });

    it.each([
      ['nobody is at a terminal', {}, false],
      ['--yes is given off a terminal', { yes: true }, false],
    ])('asks for the id instead when %s', async (_case, args, tty) => {
      serve();
      setTTY(tty);
      const { asked } = answerPrompts([]);

      await run(del, args);

      expect(asked).toEqual([]);
      expect(request).not.toHaveBeenCalled();
      expect(output(console.error)).toContain('formspree forms delete <form>');
      expect(process.exitCode).toBe(2);
    });

    it('says so as JSON with --json, with how to find the id', async () => {
      serve();
      const { asked } = answerPrompts([]);

      await run(del, { json: true });

      expect(asked).toEqual([]);
      expect(request).not.toHaveBeenCalled();
      expect(JSON.parse(output(console.log))).toEqual({
        ok: false,
        error: {
          code: 'MISSING_ARGUMENT',
          message: 'Say which form to delete: formspree forms delete <form>',
        },
        detail: 'Say which form to delete: formspree forms delete <form>',
        retryable: false,
        next_steps: [
          {
            step: 'list_forms',
            detail: 'List the forms to find the one to delete, by its hashid.',
            command: 'formspree forms list --json',
          },
        ],
      });
      expect(console.error).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(2);
    });
  });

  it('reports a form that is not there', async () => {
    login(credentialsFile);
    answer(404, problem(404, 'Nothing with that id exists.'));

    await run(del, { form: 'nope', yes: true });

    expect(output(console.error)).toContain('Nothing with that id exists.');
    expect(output(console.log)).not.toContain('Form deleted');
    expect(process.exitCode).toBe(3);
  });
});

describe('forms validate', () => {
  const invalid = {
    valid: false,
    errors: [
      { field: 'email', message: 'Should be an email', code: 'TYPE_EMAIL' },
    ],
  };

  it('needs no login and sends no credential', async () => {
    process.env.FORMSPREE_API_KEY = 'fsk_from_env';
    answer(200, { valid: true, errors: [] });

    await run(validate, {
      form: 'xyzabcde',
      fields: [
        'email=ada@example.com',
        'message=a=b',
        'tag=1',
        'tag=2',
        'empty=',
      ],
    });

    expect(requests()).toEqual([
      {
        method: 'post',
        url: 'https://formspree.io/api/v1/forms/xyzabcde/validate',
        data: {
          email: 'ada@example.com',
          message: 'a=b',
          tag: ['1', '2'],
          empty: '',
        },
      },
    ]);
    expect(headers().Authorization).toBeUndefined();
    expect(output(console.log)).toContain('The submission is valid');
    expect(process.exitCode).toBeUndefined();
  });

  it('lists the errors and fails when the submission is not valid', async () => {
    answer(200, invalid);

    await run(validate, { form: 'xyzabcde', fields: ['email=nope'] });

    const shown = output(console.error);
    expect(shown).toContain('The submission is not valid');
    expect(shown).toContain('email: Should be an email');
    expect(process.exitCode).toBe(1);
  });

  it('prints the result as JSON with --json, and still fails', async () => {
    answer(200, invalid);

    await run(validate, { form: 'xyzabcde', fields: [], json: true });

    expect(JSON.parse(output(console.log))).toEqual(invalid);
    expect(process.exitCode).toBe(1);
  });

  it('takes the submission from --from, with pairs set over it', async () => {
    answer(200, { valid: true, errors: [] });
    const from = jsonFile({ email: 'file@example.com', age: 30 });

    await run(validate, {
      form: 'xyzabcde',
      from,
      fields: ['email=pair@example.com'],
    });

    expect(requests()[0]?.data).toEqual({ email: 'pair@example.com', age: 30 });
  });

  it('sends a field named like an Object.prototype member as it was given', async () => {
    answer(200, { valid: true, errors: [] });

    await run(validate, {
      form: 'xyzabcde',
      fields: [
        'constructor=x',
        'toString=y',
        '__proto__=z',
        'hasOwnProperty=1',
        'hasOwnProperty=2',
      ],
    });

    expect(JSON.stringify(requests()[0]?.data)).toBe(
      JSON.stringify({
        constructor: 'x',
        toString: 'y',
        ['__proto__']: 'z',
        hasOwnProperty: ['1', '2'],
      }),
    );
  });

  it.each(['email', '=value'])('refuses the pair "%s"', async (pair) => {
    await run(validate, { form: 'xyzabcde', fields: [pair] });

    expect(request).not.toHaveBeenCalled();
    expect(output(console.error)).toContain('is not a name=value pair');
    expect(process.exitCode).toBe(2);
  });

  it('reports a form that is not there', async () => {
    answer(404, problem(404, 'No form with that id exists.'));

    await run(validate, { form: 'nope', fields: [] });

    expect(output(console.error)).toContain('No form with that id exists.');
    expect(process.exitCode).toBe(3);
  });
});
