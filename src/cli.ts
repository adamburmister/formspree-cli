#!/usr/bin/env node
import { config as loadEnv } from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { command as deploy } from './cmds/deploy.ts';
import { command as forms } from './cmds/forms.ts';
import { command as init } from './cmds/init.ts';
import { command as login } from './cmds/login.ts';
import { command as logout } from './cmds/logout.ts';
import { command as open } from './cmds/open.ts';
import { command as projects } from './cmds/projects.ts';
import { command as whoami } from './cmds/whoami.ts';
import * as agent from './agent.ts';
import * as failure from './failure.ts';
import * as log from './log.ts';
import * as terminal from './terminal.ts';
import { version } from './version.ts';
import { versionCheck } from './version_check.ts';

// A project's .env supplies deploy keys and the secrets formspree.json
// refers to. Quiet: dotenv would otherwise announce itself on stdout.
loadEnv({ quiet: true });

const argv = hideBin(process.argv);

const cli = yargs(argv)
  .scriptName('formspree')
  .version(version)
  // An option that can repeat takes one value each time, so the words
  // after it are still the command's own: `--email a@b.c Contact`.
  .parserConfiguration({ 'greedy-arrays': false })
  .usage('$0 <command>')
  .command(deploy)
  .command(init)
  .command(login)
  .command(logout)
  .command(forms)
  .command(projects)
  .command(open)
  .command(whoami)
  .demandCommand()
  // A mistyped option or command stops the command, rather than being
  // dropped and leaving it to run without what was asked for.
  .strict()
  .recommendCommands()
  .help()
  .alias('help', 'h')
  .option('skip-version-check', {
    type: 'boolean',
    describe: 'Skip checking the npm registry for updates',
  })
  .middleware((args) => {
    // An agent reading the output gets JSON without asking for it.
    // --json and --no-json say which, whoever is asking.
    if (args.json === undefined && agent.prefersJson()) args.json = true;

    const dressed = terminal.styled(process.stdout);

    if (args._[0] === 'login' && dressed && !args.json) {
      console.log('');
      console.log(log.banner());
      console.log('');
    }

    // --json keeps stdout for the response alone, and `open --url` for
    // the link. Piped, it's for the command's output alone too.
    if (args.json || args.url || !dressed) return;

    log.preamble();

    if (!args.skipVersionCheck) versionCheck();
  });

// The commands that only hold others: `forms <command>` is named `forms`.
const groups = [forms, projects].map((group) =>
  String(group.command).replace(/ .*/, ''),
);

/**
 * Whether no command was named to run: a bare `formspree`, or a group
 * like `formspree forms` with nothing after it, whatever options came
 * with either.
 */
const namesNoCommand = (): boolean => {
  const words = argv.filter((arg) => !arg.startsWith('-'));
  const [first] = words;
  return first === undefined || (words.length === 1 && groups.includes(first));
};

// In a terminal, the banner heads the help wherever it's asked for:
// `--help`, `-h` or `help`, for the CLI or for one command. It also heads
// the help that naming no command gets, on stderr: `formspree`, or
// `formspree forms`. Help that comes with an error, like a mistyped
// option, goes without, and so does help that's piped somewhere. It's
// printed ahead of yargs' help, not put in its usage text, where yargs
// would trim the banner's indent.
const showHelp = cli.showHelp.bind(cli);
cli.showHelp = (level?: string | ((message: string) => void)) => {
  // yargs prints help that was asked for itself, through a function.
  if (typeof level === 'function') {
    if (terminal.styled(process.stdout)) {
      console.log(`\n${log.banner()}\n`);
    }
    return showHelp(level);
  }
  if (namesNoCommand() && terminal.styled(process.stderr)) {
    console.error(`\n${log.banner()}\n`);
  }
  return level === undefined ? showHelp() : showHelp(level);
};

/** Thrown out of yargs once what it refused has been reported. */
class Reported extends Error {}

// With --json, a command line yargs refuses is reported as JSON too. So
// it is for an agent, which gets JSON unless it says --no-json.
const json =
  argv.includes('--json') ||
  (!argv.includes('--no-json') && agent.prefersJson());

// yargs would print its help and the error and exit with 1. This does
// the same with the exit code for a command line that can't be used,
// and as JSON with --json.
cli.fail((message, error) => {
  // Something a command threw, not something about the command line.
  if (!message && error) {
    if (!json) throw error;
    failure.report({ json }, { code: 'UNEXPECTED', message: error.message });
    throw new Reported();
  }

  // For a command it doesn't know, yargs gives only its suggestion.
  const said = message.startsWith('Did you mean')
    ? `Unknown command. ${message}`
    : message;

  failure.report(
    { json },
    {
      code: 'INVALID_USAGE',
      message: said,
      next: [
        {
          step: 'see_help',
          detail: 'Run the command with --help to see what it takes.',
        },
      ],
    },
    () => {
      cli.showHelp('error');
      console.error('');
      console.error(said);
    },
  );
  throw new Reported();
});

try {
  await cli.parse();
} catch (error) {
  if (!(error instanceof Reported)) throw error;
}
