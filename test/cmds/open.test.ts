import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTempConfigDir, output, response } from '../helpers/oauth.ts';
import { login, problem, requests, run, request } from '../helpers/v1.ts';
import * as browser from '../../src/browser.ts';
import { command as open } from '../../src/cmds/open.ts';

vi.mock('axios');
vi.mock('../../src/browser.ts', () => ({
  available: vi.fn(),
  open: vi.fn(),
}));

const FORM_PAGE = 'https://formspree.io/forms/xyzabcde';
const PROJECT_PAGE = 'https://formspree.io/projects/3122252403177421850';

const form = {
  name: 'Contact form',
  project_id: 'proj_2pn3r0jq7zz0t',
  hashid: 'xyzabcde',
  url: 'https://formspree.io/f/xyzabcde',
  key: null,
  links: { dashboard: FORM_PAGE },
};
const project = {
  id: 'proj_2pn3r0jq7zz0t',
  kind: 'dashboard',
  name: 'Marketing site',
  timezone: 'UTC',
  domain_whitelist: null,
  links: { dashboard: PROJECT_PAGE },
};

/** Answers a form lookup with `aForm` and a project lookup with `aProject`. */
const serve = (aForm: unknown = form, aProject: unknown = project) => {
  request.mockImplementation((config) =>
    config.url.includes('/api/v1/projects/')
      ? response(200, { project: aProject })
      : response(200, { form: aForm }),
  );
};

beforeEach(() => {
  login(useTempConfigDir());
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(browser.available).mockReturnValue(true);
  vi.mocked(browser.open).mockResolvedValue(true);
  process.exitCode = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(browser.available).mockReset();
  vi.mocked(browser.open).mockReset();
  request.mockReset();
  vi.unstubAllEnvs();
  process.exitCode = undefined;
});

describe('open', () => {
  it('opens the dashboard when nothing is named, with no request', async () => {
    await run(open, {});

    expect(request).not.toHaveBeenCalled();
    expect(browser.open).toHaveBeenCalledWith('https://formspree.io/forms');
    expect(output(console.log)).toContain('Opening https://formspree.io/forms');
    expect(process.exitCode).toBeUndefined();
  });

  it("opens the dashboard of the server that's in use", async () => {
    vi.stubEnv('FORMSPREE_API_URL', 'https://review.example.com/');

    await run(open, {});

    expect(browser.open).toHaveBeenCalledWith(
      'https://review.example.com/forms',
    );
  });

  it('opens the help site for `docs`, with no request', async () => {
    await run(open, { target: 'docs' });

    expect(request).not.toHaveBeenCalled();
    expect(browser.open).toHaveBeenCalledWith('https://help.formspree.io');
  });

  it("opens a form's page, where the API says it is", async () => {
    serve();

    await run(open, { target: 'xyzabcde' });

    expect(requests()).toEqual([
      { method: 'get', url: 'https://formspree.io/api/v1/forms/xyzabcde' },
    ]);
    expect(browser.open).toHaveBeenCalledWith(FORM_PAGE);
  });

  it("works a form's page out from its endpoint when the API gives no link", async () => {
    serve({ ...form, links: undefined });

    await run(open, { target: 'xyzabcde' });

    expect(browser.open).toHaveBeenCalledWith(FORM_PAGE);
  });

  it.each(['proj_2pn3r0jq7zz0t', '3122252403177421850'])(
    "opens a project's page for the id %s",
    async (id) => {
      serve();

      await run(open, { target: id });

      expect(requests()).toEqual([
        { method: 'get', url: `https://formspree.io/api/v1/projects/${id}` },
      ]);
      expect(browser.open).toHaveBeenCalledWith(PROJECT_PAGE);
    },
  );

  it('says so when the API gives no link for a project', async () => {
    serve(form, { ...project, links: undefined });

    await run(open, { target: 'proj_2pn3r0jq7zz0t' });

    expect(browser.open).not.toHaveBeenCalled();
    expect(output(console.error)).toContain('no dashboard link');
    expect(process.exitCode).toBe(1);
  });

  it('reports a form that is not there, and opens nothing', async () => {
    request.mockImplementation(() =>
      response(404, problem(404, 'Nothing with that id exists.')),
    );

    await run(open, { target: 'nope' });

    expect(browser.open).not.toHaveBeenCalled();
    expect(output(console.error)).toContain('Nothing with that id exists.');
    expect(process.exitCode).toBe(3);
  });

  it('prints the link alone with --url, and opens nothing', async () => {
    serve();

    await run(open, { target: 'xyzabcde', url: true });

    expect(browser.open).not.toHaveBeenCalled();
    expect(output(console.log)).toBe(FORM_PAGE);
  });

  it('keeps the note about the server off stdout with --url', async () => {
    vi.stubEnv('FORMSPREE_API_URL', 'https://review.example.com');
    vi.stubEnv('FORMSPREE_API_KEY', 'fsk_test');
    serve();

    await run(open, { target: 'xyzabcde', url: true });

    expect(output(console.log)).toBe(FORM_PAGE);
    expect(output(console.error)).toContain('FORMSPREE_API_URL');
  });

  it('prints the link, and opens nothing, when no browser is at hand', async () => {
    vi.mocked(browser.available).mockReturnValue(false);

    await run(open, {});

    expect(browser.open).not.toHaveBeenCalled();
    expect(output(console.log)).toBe('https://formspree.io/forms');
  });

  it('prints the link as JSON with --json, and opens nothing', async () => {
    serve();

    await run(open, { target: 'proj_2pn3r0jq7zz0t', json: true });

    expect(browser.open).not.toHaveBeenCalled();
    expect(JSON.parse(output(console.log))).toEqual({ url: PROJECT_PAGE });
  });

  it('fails, with the link still printed, when the browser will not open', async () => {
    vi.mocked(browser.open).mockResolvedValue(false);

    await run(open, {});

    expect(output(console.log)).toContain('https://formspree.io/forms');
    expect(output(console.error)).toContain("Couldn't open a browser");
    expect(process.exitCode).toBe(1);
  });
});
