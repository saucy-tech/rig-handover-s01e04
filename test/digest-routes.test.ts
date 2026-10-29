import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { NightDigest } from '../src/digest/types.js';

const dirs: string[] = [];
const night = '2026-10-28';

function setup(contents?: string) {
  const runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  dirs.push(runsDir);
  if (contents !== undefined) writeFileSync(join(runsDir, `${night}.jsonl`), contents);
  return createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const entries = [
  { at: '2026-10-28T22:00:00-04:00', job: 'zeta', status: 'fail', owner: 'Lee', error: 'disk full' },
  { at: '2026-10-28T21:00:00-04:00', job: 'alpha', status: 'retry', owner: null, error: 'timeout' },
  { at: '2026-10-28T21:01:00-04:00', job: 'alpha', status: 'ok', owner: null },
];
const log = entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n';

describe('digest routes', () => {
  it('serves the same jobs in sorted order on the page and in JSON', async () => {
    const app = setup(log);
    const page = await app.request(`/digest/${night}`);
    const api = await app.request(`/api/digest/${night}`);
    expect(page.status).toBe(200);
    expect(api.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(api.headers.get('content-type')).toContain('application/json');

    const html = await page.text();
    const digest = await api.json() as NightDigest;
    expect(digest.malformedLines).toBe(0);
    expect(digest.rows).toEqual([
      { job: 'alpha', owner: null, runs: 2, retries: 1, lastStatus: 'ok', lastError: 'timeout',
        firstTime: '2026-10-28T21:00:00-04:00', lastTime: '2026-10-28T21:01:00-04:00' },
      { job: 'zeta', owner: 'Lee', runs: 1, retries: 0, lastStatus: 'fail', lastError: 'disk full',
        firstTime: '2026-10-28T22:00:00-04:00', lastTime: '2026-10-28T22:00:00-04:00' },
    ]);
    const table = html.match(/<table\b[\s\S]*?<\/table>/i)?.[0] ?? '';
    const pageJobs = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
      .flatMap((match) => [...match[1].matchAll(/<(?:td|th)\b[^>]*>\s*(alpha|zeta)\s*<\/(?:td|th)>/gi)]
        .map((cell) => cell[1]));
    expect(pageJobs).toEqual(digest.rows.map((row) => row.job));
    expect(html).toContain('—');
    expect(html).toContain('disk full');
    expect(html).toContain('-04:00');
  });

  it('returns 404 from both endpoints for a missing night', async () => {
    const app = setup();
    expect((await app.request(`/digest/${night}`)).status).toBe(404);
    expect((await app.request(`/api/digest/${night}`)).status).toBe(404);
  });

  it('renders an empty night and returns an empty digest', async () => {
    const app = setup('');
    const page = await app.request(`/digest/${night}`);
    const api = await app.request(`/api/digest/${night}`);
    expect(page.status).toBe(200);
    expect(await page.text()).toMatch(/nothing ran/i);
    expect(api.status).toBe(200);
    expect(await api.json()).toEqual({ rows: [], malformedLines: 0, statusCounts: { ok: 0, retry: 0, fail: 0 } });
  });

  it('keeps valid jobs when a line is malformed', async () => {
    const app = setup(log + '{bad json\n');
    const page = await app.request(`/digest/${night}`);
    const api = await app.request(`/api/digest/${night}`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('alpha');
    expect(html).toContain('zeta');
    expect(api.status).toBe(200);
    const digest = await api.json() as NightDigest;
    expect(digest.malformedLines).toBe(1);
    expect(digest.rows.map((row) => row.job)).toEqual(['alpha', 'zeta']);
  });
});
