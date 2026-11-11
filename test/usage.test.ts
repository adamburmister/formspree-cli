import { describe, expect, it } from 'vitest';
import { closest, commandOf, explain } from '../src/usage.ts';

const OPTIONS = ['email', 'webhook', 'app', 'project', 'yes', 'json', 'help'];

describe('closest', () => {
  it.each([
    ['emial', 'email'],
    ['webhok', 'webhook'],
    ['prject', 'project'],
    ['ys', 'yes'],
    ['JSON', 'json'],
  ])('takes %s to have meant %s', (typed, meant) => {
    expect(closest(typed, OPTIONS)).toBe(meant);
  });

  it.each(['bogus', 'x', 'verbose'])('has no guess for %s', (typed) => {
    expect(closest(typed, OPTIONS)).toBeUndefined();
  });

  it('has no guess when there is nothing to choose from', () => {
    expect(closest('email', [])).toBeUndefined();
  });
});

describe('commandOf', () => {
  it.each([
    ['formspree forms create [name]', 'formspree forms create'],
    ['formspree projects rename <project> <name>', 'formspree projects rename'],
    ['formspree <command>', 'formspree'],
    ['formspree whoami', 'formspree whoami'],
  ])('reads %s as the usage of %s', (usage, command) => {
    expect(commandOf(usage)).toBe(command);
  });
});

describe('explain', () => {
  it('adds the option that was probably meant', () => {
    expect(explain('Unknown argument: emial', OPTIONS)).toBe(
      'Unknown argument: emial. Did you mean --email?',
    );
  });

  it('adds one for each mistyped option, once', () => {
    expect(explain('Unknown arguments: emial, emal, webhok', OPTIONS)).toBe(
      'Unknown arguments: emial, emal, webhok. Did you mean --email or --webhook?',
    );
  });

  it('leaves an option that is like none of them as it is', () => {
    expect(explain('Unknown argument: bogus', OPTIONS)).toBe(
      'Unknown argument: bogus',
    );
  });

  it('says a command is unknown, where yargs gives only its suggestion', () => {
    expect(explain('Did you mean login?', OPTIONS)).toBe(
      'Unknown command. Did you mean login?',
    );
  });

  it('says an argument is missing, with the usage that shows which', () => {
    expect(
      explain(
        'Not enough non-option arguments: got 0, need at least 1',
        OPTIONS,
        'formspree forms get <form>',
      ),
    ).toBe('Missing an argument: formspree forms get <form>');
  });

  it('passes on anything else as it came', () => {
    expect(
      explain('Arguments project and account are mutually exclusive', []),
    ).toBe('Arguments project and account are mutually exclusive');
  });
});
