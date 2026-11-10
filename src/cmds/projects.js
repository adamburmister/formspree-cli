exports.command = 'projects <command>';
exports.desc = 'Manage projects';
exports.builder = yargs => {
  return yargs.commandDir('projects_cmds');
};
exports.handler = _argv => {};
