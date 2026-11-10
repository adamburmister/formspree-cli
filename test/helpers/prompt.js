const readline = require('readline');
const { EventEmitter } = require('events');

// In place of an answer: the question is abandoned.
const CTRL_C = Symbol('Ctrl+C');
const CTRL_D = Symbol('Ctrl+D');

/**
 * Makes stdin look like a terminal, or not.
 */
const setTTY = value => {
  Object.defineProperty(process.stdin, 'isTTY', {
    value,
    configurable: true
  });
};

const unsetTTY = () => {
  delete process.stdin.isTTY;
};

/**
 * Stands in for the terminal: answers each question with the next of
 * `answers`, and Enter once they run out. Returns the questions asked,
 * without colors, and the close spy.
 */
const answerPrompts = (answers = []) => {
  const terminal = new EventEmitter();
  const queue = answers.slice();
  const asked = [];

  terminal.close = jest.fn(() => terminal.emit('close'));
  terminal.question = (question, callback) => {
    asked.push(question.replace(/\u001b\[[0-9;]*m/g, '').trim());
    const answer = queue.length ? queue.shift() : '';

    if (answer === CTRL_C) terminal.emit('SIGINT');
    else if (answer === CTRL_D) terminal.emit('close');
    else callback(answer);
  };

  const open = jest
    .spyOn(readline, 'createInterface')
    .mockReturnValue(terminal);

  return { asked, close: terminal.close, open };
};

module.exports = { CTRL_C, CTRL_D, setTTY, unsetTTY, answerPrompts };
