import { copyFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const JOBS = ['digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs'];

// Temp runs dir: runs/ stays read-only. 10-28 has one truncated last line, 10-30 is empty, 10-31 has no file.
let app: ReturnType<typeof createApp>;
beforeAll(() => {
  const runsDir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  copyFileSync('runs/2026-10-28.jsonl', join(runsDir, '2026-10-28.jsonl'));
  writeFileSync(join(runsDir, '2026-10-30.jsonl'), '');
  app = createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });
});

describe('digest page', () => {
  it('renders every job and flags the bad line', async () => {
    const res = await app.request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    for (const job of JOBS) expect(html).toContain(job);
    expect(html).toContain('could not be read');
  });

  it('marks 3+ retries and any fail, nothing else', async () => {
    const html = await (await app.request('/digest/2026-10-28')).text();
    const warned = [...html.matchAll(/<tr class="warn"><td>([^<]+)<\/td>/g)].map((m) => m[1]);
    expect(warned).toEqual(['fixtures/refresh', 'notes/backup']);
  });

  it('404s a night with no file', async () => {
    expect((await app.request('/digest/2026-10-31')).status).toBe(404);
  });

  it('says nothing ran for the empty night', async () => {
    const res = await app.request('/digest/2026-10-30');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });
});

describe('digest json', () => {
  it('returns night, rows and badLines', async () => {
    const res = await app.request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { night: string; rows: { job: string; owner: string | null }[]; badLines: number };
    expect(body.night).toBe('2026-10-28');
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(JOBS);
    expect(body.rows.find((r) => r.job === 'digest/render')?.owner).toBeNull();
  });

  it('404s a night with no file', async () => {
    expect((await app.request('/api/digest/2026-10-31')).status).toBe(404);
  });

  it('returns no rows for the empty night', async () => {
    const res = await app.request('/api/digest/2026-10-30');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { rows: unknown[] }).rows).toEqual([]);
  });
});

describe('page and json agree', () => {
  it('lists the same jobs in the same order', async () => {
    const html = await (await app.request('/digest/2026-10-28')).text();
    const { rows } = (await (await app.request('/api/digest/2026-10-28')).json()) as { rows: { job: string }[] };
    const jobs = rows.map((r) => r.job);
    const positions = jobs.map((j) => html.indexOf(j));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});
