import fs from 'node:fs';
import { errorCode } from './util.ts';

/** A local formspree.json. */
export interface SiteConfig {
  forms?: Record<string, { name: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

/**
 * Reads a config file and parses its contents as JSON. A file that does
 * not exist is an empty config. Throws if it can't be parsed.
 */
export const readConfig = (file: string): SiteConfig => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as SiteConfig;
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return {};
    throw error;
  }
};

/** Writes the config to the file as pretty JSON. */
export const writeConfig = (file: string, config: SiteConfig): void => {
  fs.writeFileSync(file, JSON.stringify(config, null, 2));
};
