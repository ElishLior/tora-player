'use client';

import { useEffect, useState } from 'react';
import { fetchDeployedVersion } from '@/lib/app-update';
import type { BuildIdentity } from '@/lib/app-version';

/** One bounded check; a slow or failed one simply shows nothing. */
export const DEPLOYED_VERSION_TIMEOUT_MS = 8_000;

/**
 * The build the live site serves, fetched once when the component mounts.
 * Null until it arrives, and forever when the check fails or times out (silent by design).
 */
export function useDeployedVersion(): BuildIdentity | null {
  const [deployed, setDeployed] = useState<BuildIdentity | null>(null);

  useEffect(() => {
    let active = true;
    void fetchDeployedVersion(fetch, DEPLOYED_VERSION_TIMEOUT_MS).then((version) => {
      if (active) setDeployed(version);
    });
    return () => {
      active = false;
    };
  }, []);

  return deployed;
}
