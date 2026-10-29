import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board', () => {
  it('shows the lane banner and the nights on disk', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('2026-10-28');
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });

  it('links each night and counts valid entries, including earlier statuses for the same job', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-status-'));
    try {
      const entry = (status: string) => JSON.stringify({ at: '2026-10-29T01:00:00Z', job: 'job', status, owner: null });
      writeFileSync(join(dir, '2026-10-28.jsonl'), [entry('retry'), entry('retry'), entry('ok'), entry('invalid'), 'bad'].join('\n'));
      writeFileSync(join(dir, '2026-10-29.jsonl'), entry('fail'));
      const html = await (await createApp({ ...config, runsDir: dir }).request('/')).text();
      expect(html).toContain('<a href="/digest/2026-10-28">2026-10-28</a> · ok 1 · retry 2 · fail 0');
      expect(html).toContain('<a href="/digest/2026-10-29">2026-10-29</a> · ok 0 · retry 0 · fail 1');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
