import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight } from './types.js';

type Entry = {
  at: string;
  job: string;
  status: DigestRow['lastStatus'];
  owner: string | null;
  error?: string;
};

function parseEntry(line: string): Entry | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  if (typeof entry.at !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(entry.at) ||
      !Number.isFinite(Date.parse(entry.at)) ||
      typeof entry.job !== 'string' || entry.job.length === 0 ||
      (entry.status !== 'ok' && entry.status !== 'retry' && entry.status !== 'fail') ||
      (typeof entry.owner !== 'string' && entry.owner !== null) ||
      (entry.error !== undefined && typeof entry.error !== 'string')) return null;
  return entry as Entry;
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;
  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }

  const jobs = new Map<string, { row: DigestRow; first: number; last: number; errorTime: number }>();
  let malformedLines = 0;
  const statusCounts = { ok: 0, retry: 0, fail: 0 };
  const lines = contents.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  for (const line of lines) {
    const entry = parseEntry(line);
    if (!entry) {
      malformedLines++;
      continue;
    }
    statusCounts[entry.status]++;
    const time = Date.parse(entry.at);
    const existing = jobs.get(entry.job);
    if (!existing) {
      jobs.set(entry.job, {
        row: { job: entry.job, owner: entry.owner, runs: 1, retries: Number(entry.status === 'retry'),
          lastStatus: entry.status, lastError: entry.error ?? null, firstTime: entry.at, lastTime: entry.at },
        first: time, last: time, errorTime: entry.error !== undefined ? time : -Infinity,
      });
      continue;
    }
    const { row } = existing;
    row.runs++;
    if (entry.status === 'retry') row.retries++;
    if (time < existing.first) { existing.first = time; row.firstTime = entry.at; }
    if (time >= existing.last) {
      existing.last = time;
      row.lastTime = entry.at;
      row.lastStatus = entry.status;
      row.owner = entry.owner;
    }
    if (entry.error !== undefined && time >= existing.errorTime) {
      existing.errorTime = time;
      row.lastError = entry.error;
    }
  }
  return { rows: [...jobs.values()].map(({ row }) => row).sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0), malformedLines, statusCounts };
};
