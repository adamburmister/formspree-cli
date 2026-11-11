import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { command as add } from '../../src/cmds/forms/add.ts';
import { command as init } from '../../src/cmds/init.ts';
import { output } from '../helpers/oauth.ts';
import { run } from '../helpers/v1.ts';

// The commands that only touch the local formspree.json.

let dir: string;
let cwd: string;

beforeEach(() => {
  cwd = process.cwd();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'formspree-cli-'));
  process.chdir(dir);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  process.exitCode = undefined;
});

afterEach(() => {
  process.chdir(cwd);
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

const config = (): unknown =>
  JSON.parse(fs.readFileSync(path.join(dir, 'formspree.json'), 'utf8'));

describe('init', () => {
  it('creates formspree.json', async () => {
    await run(init, {});

    expect(config()).toEqual({});
    expect(output(console.log)).toContain('formspree.json created');
  });

  it('leaves a formspree.json that is already there', async () => {
    fs.writeFileSync('formspree.json', '{"forms":{}}');

    await run(init, {});

    expect(config()).toEqual({ forms: {} });
    expect(output(console.log)).toContain('formspree.json already exists');
    expect(process.exitCode).toBeUndefined();
  });

  it.each([
    ['created', false, true],
    ['already there', true, false],
  ])(
    'says whether it was %s as JSON with --json',
    async (_case, exists, created) => {
      if (exists) fs.writeFileSync('formspree.json', '{}');

      await run(init, { json: true });

      expect(JSON.parse(output(console.log))).toEqual({
        created,
        file: 'formspree.json',
      });
    },
  );
});

describe('forms add', () => {
  const args = { key: 'contact', name: 'Contact', file: 'formspree.json' };

  it('adds the form to formspree.json', async () => {
    await run(add, args);

    expect(config()).toEqual({ forms: { contact: { name: 'Contact' } } });
    expect(output(console.log)).toContain('contact added');
  });

  it('prints what was added as JSON with --json', async () => {
    await run(add, { ...args, json: true });

    expect(JSON.parse(output(console.log))).toEqual({
      added: 'contact',
      file: 'formspree.json',
    });
  });

  it('fails, changing nothing, when the key is taken', async () => {
    fs.writeFileSync('formspree.json', '{"forms":{"contact":{"name":"Old"}}}');

    await run(add, args);

    expect(config()).toEqual({ forms: { contact: { name: 'Old' } } });
    expect(output(console.error)).toContain('contact already exists');
    expect(process.exitCode).toBe(1);
  });

  it('says so as JSON with --json when the key is taken', async () => {
    fs.writeFileSync('formspree.json', '{"forms":{"contact":{"name":"Old"}}}');

    await run(add, { ...args, json: true });

    expect(JSON.parse(output(console.log)).error).toEqual({
      code: 'ALREADY_EXISTS',
      message: 'contact already exists',
    });
    expect(console.error).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('fails when formspree.json cannot be parsed', async () => {
    fs.writeFileSync('formspree.json', '{nope');

    await run(add, { ...args, json: true });

    expect(JSON.parse(output(console.log)).error.code).toBe('CONFIG_INVALID');
    expect(fs.readFileSync('formspree.json', 'utf8')).toBe('{nope');
    expect(process.exitCode).toBe(1);
  });
});
