// Run detached by version_check.ts: asks the registry for the latest
// version and saves it for the next command to read. It prints nothing,
// and a failure leaves the last answer in place.
import { readCache, writeCache } from './version_check.ts';

const LATEST = 'https://registry.npmjs.org/@formspree/cli/latest';

export const refresh = async (): Promise<void> => {
  try {
    const response = await fetch(LATEST, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return;

    const manifest = (await response.json()) as { version?: unknown };
    if (typeof manifest.version !== 'string') return;

    writeCache({
      ...readCache(),
      latest: manifest.version,
      checkedAt: Date.now(),
    });
  } catch {
    // Offline, or the registry is down: try again tomorrow.
  }
};

if (import.meta.main) await refresh();
