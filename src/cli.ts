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
import * as log from './log.ts';
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
    if (args._[0] === 'login') {
      console.log('');
      console.log(log.banner());
      console.log('');
    }

    // --json keeps stdout for the response alone, and `open --url` for
    // the link.
    if (args.json || args.url) return;

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

// The banner heads the help wherever it's asked for: `--help`, `-h` or
// `help`, for the CLI or for one command. It also heads the help that
// naming no command gets, on stderr: `formspree`, or `formspree forms`.
// Help that comes with an error, like a mistyped option, goes without.
// It's printed ahead of yargs' help, not put in its usage text, where
// yargs would trim the banner's indent.
const showHelp = cli.showHelp.bind(cli);
cli.showHelp = (level?: string | ((message: string) => void)) => {
  // yargs prints help that was asked for itself, through a function.
  if (typeof level === 'function') {
    console.log(`\n${log.banner()}\n`);
    return showHelp(level);
  }
  if (namesNoCommand()) console.error(`\n${log.banner()}\n`);
  return level === undefined ? showHelp() : showHelp(level);
};

await cli.parse();
