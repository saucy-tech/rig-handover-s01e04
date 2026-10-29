import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-page-'));
const app = createApp({ adapter: 'shim', installed: 'today', beatEverySeconds: 60, runsDir });
afterAll(() => rmSync(runsDir, { recursive: true, force: true }));

describe('digest page', () => {
  it('renders sorted rows, missing values, warnings, and original offsets', async () => {
    const entries = [
      { at: '2026-10-28T03:00:00+01:00', job: 'zeta', status: 'fail', owner: null, error: 'broken' },
      ...[0, 1, 2].map((hour) => ({ at: `2026-10-28T0${hour}:00:00+01:00`, job: 'alpha', status: 'retry', owner: 'A' })),
    ];
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), entries.map((e) => JSON.stringify(e)).join('\n') + '\nbad line\n');
    const response = await app.request('/digest/2026-10-28');
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('lane-07');
    expect(html.indexOf('alpha')).toBeLessThan(html.indexOf('zeta'));
    expect(html).toContain('3 · high retries');
    expect(html).toContain('class="warn">fail');
    expect(html).toContain('—');
    expect(html).toContain('broken');
    expect(html).toContain('2026-10-28T03:00:00+01:00');
    expect(html).toContain('malformed lines: 1');
  });

  it('returns 404 for a missing night', async () => {
    expect((await app.request('/digest/2026-10-29')).status).toBe(404);
  });

  it('shows nothing ran for an empty file', async () => {
    writeFileSync(join(runsDir, '2026-10-30.jsonl'), '');
    const response = await app.request('/digest/2026-10-30');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('nothing ran');
  });
});
