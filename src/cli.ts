#!/usr/bin/env node
import { config as loadEnv } from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { command as deploy } from './cmds/deploy.ts';
import { command as forms } from './cmds/forms.ts';
import { command as init } from './cmds/init.ts';
import { command as login } from './cmds/login.ts';
import { command as logout } from './cmds/logout.ts';
import { command as projects } from './cmds/projects.ts';
import { command as whoami } from './cmds/whoami.ts';
import * as log from './log.ts';
import { version } from './version.ts';
import { versionCheck } from './version_check.ts';

// A project's .env supplies deploy keys and the secrets formspree.json
// refers to. Quiet: dotenv would otherwise announce itself on stdout.
loadEnv({ quiet: true });

const argv = hideBin(process.argv);

// The banner heads the help: `--help`, and the help a bare `formspree`
// gets on stderr for naming no command. yargs would trim the banner's
// indent out of its own usage text, so it's printed ahead of it here.
if (argv.includes('--help')) {
  console.log(`\n${log.banner()}\n`);
} else if (argv.length === 0) {
  console.error(`\n${log.banner()}\n`);
}

await yargs(argv)
  .scriptName('formspree')
  .version(version)
  // An option that can repeat takes one value each time, so the words
  // after it are still the command's own: `--email a@b.c Contact`.
  .parserConfiguration({ 'greedy-arrays': false })
  .usage('$0 <command>')
  .command(deploy)
  .command(forms)
  .command(init)
  .command(login)
  .command(logout)
  .command(projects)
  .command(whoami)
  .demandCommand()
  // A mistyped option or command stops the command, rather than being
  // dropped and leaving it to run without what was asked for.
  .strict()
  .recommendCommands()
  .help()
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

    // --json keeps stdout for the response alone.
    if (args.json) return;

    log.preamble();

    if (!args.skipVersionCheck) versionCheck();
  })
  .parse();
