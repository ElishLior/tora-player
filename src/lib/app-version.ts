/**
 * The one identity of the running build. Both values are baked in at build
 * time (next.config.ts `env`): APP_VERSION is package.json's version,
 * BUILD_ID is the deploy id that also versions the service worker.
 *
 * Keep the literal `process.env.NEXT_PUBLIC_*` reads: Next only inlines
 * literal property access. The client shows these values as RUNNING; the
 * server's /api/version is only compared against them for update detection.
 */
export const APP_VERSION: string = process.env.NEXT_PUBLIC_APP_VERSION || 'dev';
export const BUILD_ID: string = process.env.NEXT_PUBLIC_BUILD_ID || 'dev';

/** Short, readable build id for display: the deploy prefix dropped, 7 characters. */
export function shortBuildId(buildId: string = BUILD_ID): string {
  return buildId.replace(/^dpl_/, '').slice(0, 7);
}

/** A build identity: the version (package.json) and the deploy id. */
export interface BuildIdentity {
  version: string;
  buildId: string;
}

/** Whether two builds differ, by version or by deploy id. */
export function buildsDiffer(running: BuildIdentity, deployed: BuildIdentity): boolean {
  return running.version !== deployed.version || running.buildId !== deployed.buildId;
}
