import { readFileSync } from 'node:fs';

interface PackageManifest {
  version: string;
}

// package.json sits one level above both src/ and dist/.
const manifest = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as PackageManifest;

/** The installed CLI's version. */
export const version = manifest.version;

/** What the CLI calls itself in requests. */
export const userAgent = `@formspree/cli@${version}`;
