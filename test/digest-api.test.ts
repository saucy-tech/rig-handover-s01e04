import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { readNight } from '../src/digest/reader.js';

const dirs: string[] = [];
function setup() {
  const runsDir = mkdtempSync(join(tmpdir(), 'rig-api-'));
  dirs.push(runsDir);
  return { runsDir, app: createApp({ adapter: 'shim', installed: '', beatEverySeconds: 60, runsDir }) };
}
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('digest API', () => {
  it('returns the reader result in job order, including malformed-line count', async () => {
    const { runsDir, app } = setup();
    const entries = [
      { at: '2026-10-28T01:00:00Z', job: 'zebra', status: 'ok', owner: null },
      { at: '2026-10-28T01:00:00Z', job: 'alpha', status: 'fail', owner: 'A', error: 'failed' },
    ];
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), entries.map((entry) => JSON.stringify(entry)).join('\n') + '\ninvalid\n');
    const res = await app.request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(readNight(runsDir, '2026-10-28'));
    expect(body.rows.map((row: { job: string }) => row.job)).toEqual(['alpha', 'zebra']);
    expect(body.malformedLines).toBe(1);
  });

  it('distinguishes an empty night from a missing night', async () => {
    const { runsDir, app } = setup();
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), '');
    const empty = await app.request('/api/digest/2026-10-28');
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual({ rows: [], malformedLines: 0 });
    expect((await app.request('/api/digest/2026-10-29')).status).toBe(404);
  });
});
