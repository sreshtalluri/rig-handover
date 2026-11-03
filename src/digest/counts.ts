import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLine } from './read.js';

export type Counts = { ok: number; retry: number; fail: number };

// Counts run lines by status. Bad lines are skipped; a missing file counts as zeros.
export function countStatuses(runsDir: string, night: string): Counts {
  const counts: Counts = { ok: 0, retry: 0, fail: 0 };
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return counts;
  }
  for (const raw of text.split('\n')) {
    const l = parseLine(raw);
    if (l) counts[l.status]++;
  }
  return counts;
}
