require('dotenv').config();

const log = require('./log');
const versionCheck = require('./version_check');

require('yargs')
  .usage(`\n${log.banner()}\n\n$0 <command>`)
  .commandDir('cmds')
  .demandCommand()
  .help()
  .option('skip-version-check', {
    type: 'boolean',
    describe: 'Skip checking the npm registry for updates'
  })
  .middleware(args => {
    if (args._[0] === 'login') {
      console.log('');
      console.log(log.banner());
      console.log('');
    }

    // --json keeps stdout for the response alone.
    if (args.json) return {};

    log.preamble();

    if (!args.skipVersionCheck) {
      return versionCheck();
    }

    return {};
  }).argv;
