/**
 * Scheduling rules for the admin batch upload: files of every lesson in the
 * batch share one queue with a small concurrency, a failed file only fails
 * its own lesson, and a retry re-sends only the files that did not land.
 * Pure: the caller supplies the worker that sends one file.
 */

export type JobStatus = 'pending' | 'running' | 'done' | 'error';

export interface UploadJob {
  /** File id, unique across the batch. */
  id: string;
  draftKey: string;
  /** Bytes, to weight progress. */
  bytes: number;
}

export type JobOutcome = { ok: true } | { ok: false; error: unknown };

/** Files that still need sending: never tried or failed. Files that landed are never re-sent. */
export function pendingJobs<J extends UploadJob>(jobs: J[], status: Record<string, JobStatus | undefined>): J[] {
  return jobs.filter((job) => status[job.id] !== 'done');
}

/**
 * Run `worker` over `jobs` in order with at most `concurrency` in flight.
 * Never rejects: every job's outcome is reported to `onSettled`, which may be
 * async (it runs before that lane takes its next job).
 */
export async function runQueue<J>(
  jobs: J[],
  concurrency: number,
  worker: (job: J) => Promise<void>,
  onSettled: (job: J, outcome: JobOutcome) => void | Promise<void>,
): Promise<void> {
  let next = 0;
  const lane = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      let outcome: JobOutcome;
      try {
        await worker(job);
        outcome = { ok: true };
      } catch (error) {
        outcome = { ok: false, error };
      }
      await onSettled(job, outcome);
    }
  };
  await Promise.all(Array.from({ length: Math.max(0, Math.min(concurrency, jobs.length)) }, lane));
}

/** Where a lesson's files stand: still uploading, all landed, or finished with failures. */
export function draftOutcome(
  jobIds: string[],
  status: Record<string, JobStatus | undefined>,
): 'uploading' | 'complete' | 'failed' {
  let failed = false;
  for (const id of jobIds) {
    const s = status[id];
    if (s !== 'done' && s !== 'error') return 'uploading';
    if (s === 'error') failed = true;
  }
  return failed ? 'failed' : 'complete';
}

/** Percent of bytes sent, counting running files by their own progress. */
export function queueProgress(
  jobs: UploadJob[],
  status: Record<string, JobStatus | undefined>,
  progress: Record<string, number | undefined>,
): number {
  let total = 0;
  let sent = 0;
  for (const job of jobs) {
    total += job.bytes;
    if (status[job.id] === 'done') sent += job.bytes;
    else if (status[job.id] === 'running') sent += (job.bytes * (progress[job.id] ?? 0)) / 100;
  }
  return total > 0 ? Math.floor((sent / total) * 100) : 0;
}
