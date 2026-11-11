import type { ArgumentsCamelCase, Argv, CommandModule } from 'yargs';

/** A function that declares a command's options on yargs. */
type Builder = (yargs: Argv) => Argv<unknown>;

/** The options a builder declares, as yargs types them. */
type Options<B extends Builder> =
  ReturnType<B> extends Argv<infer T> ? T : never;

/**
 * What a command's handler is given: the options its builder declares,
 * with a camelCase name beside each hyphenated one.
 */
export type Args<B extends Builder> = ArgumentsCamelCase<Options<B>>;

/** A command, with its handler's arguments taken from its builder. */
export type Command<B extends Builder> = CommandModule<object, Options<B>>;

/**
 * A command's builder, with examples added to the end of its help. Each
 * is a command line and what it does; `$0` stands for `formspree`. Help
 * is where an agent, which remembers nothing between runs, learns a
 * command, so every command has some.
 */
export const withExamples =
  <B extends (yargs: Argv) => Argv>(
    builder: B,
    examples: ReadonlyArray<readonly [command: string, description: string]>,
  ) =>
  (yargs: Argv): ReturnType<B> =>
    builder(yargs).example(
      examples.map(([command, description]) => [command, description]),
    ) as ReturnType<B>;
