import { describe, expect, it } from 'vitest';
import { draftOutcome, pendingJobs, queueProgress, runQueue, type JobStatus, type UploadJob } from './upload-queue';

const jobs: UploadJob[] = [
  { id: 'sun-1', draftKey: 'sun', bytes: 100 },
  { id: 'sun-2', draftKey: 'sun', bytes: 100 },
  { id: 'mon-1', draftKey: 'mon', bytes: 300 },
  { id: 'mon-img', draftKey: 'mon', bytes: 50 },
];
const idsOf = (key: string) => jobs.filter((j) => j.draftKey === key).map((j) => j.id);

/** Run the queue the way the upload page does, recording statuses per file. */
async function run(list: UploadJob[], status: Record<string, JobStatus>, failing: Set<string>) {
  const sent: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  await runQueue(
    list,
    2,
    async (job) => {
      sent.push(job.id);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve(); // yield so the other lane starts its file
      inFlight--;
      if (failing.has(job.id)) throw new Error(`${job.id} failed`);
    },
    (job, outcome) => {
      status[job.id] = outcome.ok ? 'done' : 'error';
    },
  );
  return { sent, maxInFlight };
}

describe('upload queue', () => {
  it('sends every file with at most two in flight; a failure only fails its own lesson', async () => {
    const status: Record<string, JobStatus> = {};
    const { sent, maxInFlight } = await run(jobs, status, new Set(['mon-img']));

    expect(sent).toEqual(['sun-1', 'sun-2', 'mon-1', 'mon-img']);
    expect(maxInFlight).toBe(2);
    expect(draftOutcome(idsOf('sun'), status)).toBe('complete');
    expect(draftOutcome(idsOf('mon'), status)).toBe('failed');
  });

  it('retries only the files that failed, then completes the lesson', async () => {
    const status: Record<string, JobStatus> = {};
    await run(jobs, status, new Set(['mon-img', 'sun-2']));

    const retry = pendingJobs(jobs, status);
    expect(retry.map((j) => j.id)).toEqual(['sun-2', 'mon-img']);
    const { sent } = await run(retry, status, new Set());
    expect(sent).toEqual(['sun-2', 'mon-img']);
    expect(draftOutcome(idsOf('sun'), status)).toBe('complete');
    expect(draftOutcome(idsOf('mon'), status)).toBe('complete');
    expect(pendingJobs(jobs, status)).toEqual([]);
  });

  it('reports a lesson as uploading until each of its files settled', () => {
    expect(draftOutcome(idsOf('mon'), { 'mon-1': 'error', 'mon-img': 'running' })).toBe('uploading');
    expect(draftOutcome(idsOf('mon'), { 'mon-1': 'done' })).toBe('uploading');
  });

  it('weights progress by bytes, counting running files by their own progress', () => {
    const status: Record<string, JobStatus> = { 'sun-1': 'done', 'sun-2': 'error', 'mon-1': 'running' };
    // 100 done + 300 × 50% of 550 bytes; the failed file counts as not sent.
    expect(queueProgress(jobs, status, { 'mon-1': 50 })).toBe(45);
    expect(queueProgress([], {}, {})).toBe(0);
  });
});
