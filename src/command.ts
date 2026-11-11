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
