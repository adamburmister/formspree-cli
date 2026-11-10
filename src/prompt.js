const readline = require('readline');
const chalk = require('chalk');

/**
 * Thrown when a question is abandoned with Ctrl+C or Ctrl+D.
 */
class Cancelled extends Error {
  constructor() {
    super('Cancelled');
  }
}

/**
 * Whether someone is at a terminal to answer questions.
 */
const interactive = () => Boolean(process.stdin.isTTY);

/**
 * Opens a prompt on the terminal. Questions go to stderr, so stdout stays
 * the command's output. Every question rejects with Cancelled if it's
 * abandoned.
 */
const open = () => {
  const terminal = readline.createInterface({
    input: process.stdin,
    output: process.stderr
  });

  const say = line => console.error(line);

  const ask = question => {
    return new Promise((resolve, reject) => {
      const cancel = () => reject(new Cancelled());
      const interrupt = () => terminal.close();

      terminal.once('close', cancel);
      terminal.once('SIGINT', interrupt);
      terminal.question(question, answer => {
        terminal.removeListener('close', cancel);
        terminal.removeListener('SIGINT', interrupt);
        resolve(String(answer).trim());
      });
    });
  };

  /**
   * Asks for a line of text. Resolves with undefined when it's skipped,
   * which a `required` question doesn't allow: it asks again.
   */
  const text = async (label, { hint, required } = {}) => {
    const note = hint ? ` ${chalk.gray(`(${hint})`)}` : '';

    for (;;) {
      const answer = await ask(`  ${label}${note}: `);
      if (answer) return answer;
      if (!required) return undefined;
    }
  };

  /**
   * Asks a yes or no question. Anything but y or yes is a no.
   */
  const confirm = async question => {
    return /^y(es)?$/i.test(await ask(`${question} (y/N) `));
  };

  /**
   * Asks for on or off. Resolves with true, false, or undefined when
   * skipped. Asks again for anything else.
   */
  const toggle = async (label, { hint } = {}) => {
    for (;;) {
      const answer = await text(label, { hint });
      if (answer === undefined) return undefined;
      if (/^(on|y|yes)$/i.test(answer)) return true;
      if (/^(off|n|no)$/i.test(answer)) return false;
    }
  };

  /**
   * Lists `items` by number and asks for one. Resolves with { item } for
   * a number on the list, with { text } for other text when `allowText`,
   * or with undefined when skipped. It asks again for a number that isn't
   * on the list (a slip, not a name), for text it doesn't allow, and for
   * a `required` answer that was skipped.
   */
  const choose = async (
    label,
    items,
    { render, hint, required, allowText } = {}
  ) => {
    say(`  ${label}`);
    items.forEach((item, i) => say(`    ${i + 1}. ${render(item)}`));

    for (;;) {
      const answer = await ask(`  ${hint}: `);
      const numeric = /^\d+$/.test(answer);
      const picked = numeric ? items[Number(answer) - 1] : null;

      if (picked) return { item: picked };
      if (answer && allowText && !numeric) return { text: answer };
      if (!answer && !required) return undefined;
    }
  };

  return {
    say,
    text,
    confirm,
    toggle,
    choose,
    close: () => terminal.close()
  };
};

/**
 * Runs `questions` with an open prompt, and closes it whatever happens.
 */
const session = async questions => {
  const form = open();
  try {
    return await questions(form);
  } finally {
    form.close();
  }
};

module.exports = { Cancelled, interactive, session };
