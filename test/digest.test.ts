import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('readNight', () => {
  it('reads the actual night, preserving null owners, retries and failure', () => {
    const digest = readNight('runs', '2026-10-28');
    expect(digest?.malformedLines).toBe(1);
    expect(digest?.rows.map((row) => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(digest?.rows[0].owner).toBeNull();
    expect(digest?.rows[1]).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503' });
    expect(digest?.rows[3]).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('distinguishes a missing night from an empty night', () => {
    const dir = tempDir();
    expect(readNight(dir, '2026-10-28')).toBeNull();
    writeFileSync(join(dir, '2026-10-28.jsonl'), '');
    expect(readNight(dir, '2026-10-28')).toEqual({ rows: [], malformedLines: 0, statusCounts: { ok: 0, retry: 0, fail: 0 } });
    expect(readNight(dir, '../outside')).toBeNull();
  });

  it('uses actual timestamp order and counts invalid entries', () => {
    const dir = tempDir();
    const entries = [
      { at: '2026-10-29T03:00:00+02:00', job: 'job', status: 'fail', owner: null, error: 'later' },
      { at: '2026-10-29T00:30:00+00:00', job: 'job', status: 'retry', owner: 'first', error: 'earlier' },
      { at: '2026-10-29T02:30:00+01:00', job: 'job', status: 'ok', owner: 'last' },
      { at: 'bad', job: 'job', status: 'ok', owner: null },
      { at: '2026-10-29T00:00:00Z', job: 'job', status: 'other', owner: null },
    ];
    writeFileSync(join(dir, '2026-10-28.jsonl'), entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
    expect(readNight(dir, '2026-10-28')).toEqual({ malformedLines: 2, statusCounts: { ok: 1, retry: 1, fail: 1 }, rows: [{
      job: 'job', owner: 'last', runs: 3, retries: 1, lastStatus: 'ok', lastError: 'later',
      firstTime: '2026-10-29T00:30:00+00:00', lastTime: '2026-10-29T02:30:00+01:00',
    }] });
  });
});
