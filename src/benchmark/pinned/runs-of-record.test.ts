/**
 * Committed pinned runs.
 *
 * Every directory under results/ is a run the pinned harness wrote. These
 * tests read each committed run and check that it is complete and that its
 * summary is the one its per-sample predictions give: the record names every
 * pinned input, the NanoMind manifest sha256 is the hash of the file list it
 * records, every sample was scanned once by every adapter, and every count in
 * summary.json can be recomputed from corpus-predictions.jsonl and
 * dvaa-predictions.jsonl. A run whose summary cannot be recomputed from its
 * own predictions is not a figure of record.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RECORD_SCHEMA, RECORD_SCHEMA_V1, SUMMARY_NOTE, type PinnedRunRecord, type PinnedRunSummary } from './harness.js';
import { gitEnv, SECOND_CLASSIFIER_FILES } from './inputs.js';
import { addUse, noUse, type NanomindUse } from './nanomind-use.js';

const OASB_ROOT = resolve(__dirname, '..', '..', '..');
const RESULTS_ROOT = join(OASB_ROOT, 'results');
const RUN_FILES = ['corpus-predictions.jsonl', 'dvaa-predictions.jsonl', 'record.json', 'summary.json'];
/** The documents that lead with the scanner's detection figures. */
const FIGURE_DOCUMENTS = ['docs/pinned-benchmark.md', 'BENCHMARK-RESULTS.md'];

interface CorpusPrediction {
  adapterId: string;
  sampleId: string;
  label: string;
  category: string | null;
  source: string;
  verdict: string;
  nanomind?: NanomindUse;
}

interface DvaaPrediction {
  scenario: string;
  category: string;
  detected: boolean;
  files: Array<{ file: string; detected: boolean }>;
  nanomind?: NanomindUse;
}

function sumUse(rows: Array<{ nanomind?: NanomindUse }>, key: string) {
  const uses = rows.map(r => r.nanomind!);
  for (const use of uses) expect(Object.keys(use ?? {}).sort()).toEqual(Object.keys(noUse()).sort());
  const total = uses.reduce((sum, u) => addUse(sum, u), noUse());
  return { ...total, [key]: uses.filter(u => u.wordListScorings > 0).length };
}

/**
 * The record schema of a run the external skill-scanner benchmark writes
 * (RUN_SCHEMA in scripts/external-skill-benchmark.ts). Those runs sit under
 * results/ too, and scripts/external-skill-benchmark.test.mjs checks each of
 * them; every other directory under results/ is checked here.
 */
const EXTERNAL_RUN_SCHEMA = 'oasb-external-skill-run/v1';

function isExternalRun(dir: string): boolean {
  const record = join(dir, 'record.json');
  if (!existsSync(record)) return false;
  try {
    return JSON.parse(readFileSync(record, 'utf-8')).schema === EXTERNAL_RUN_SCHEMA;
  } catch {
    return false;
  }
}

function runDirectories(): string[] {
  if (!existsSync(RESULTS_ROOT)) return [];
  return readdirSync(RESULTS_ROOT)
    .filter(name => statSync(join(RESULTS_ROOT, name)).isDirectory())
    .filter(name => !isExternalRun(join(RESULTS_ROOT, name)))
    .sort();
}

function git(...args: string[]) {
  return spawnSync('git', ['-C', OASB_ROOT, ...args], { encoding: 'utf-8', env: gitEnv() });
}

/**
 * True when the OASB checkout has its full history, so a commit missing from
 * it is not a commit of the repository. A shallow clone, or a copy that is
 * not a git checkout of its own, cannot show that.
 */
function fullHistory(): boolean {
  const top = git('rev-parse', '--show-toplevel');
  if (top.status !== 0 || realpathSync(top.stdout.trim()) !== realpathSync(OASB_ROOT)) return false;
  const shallow = git('rev-parse', '--is-shallow-repository');
  return shallow.status === 0 && shallow.stdout.trim() === 'false';
}

function readRecord(dir: string): PinnedRunRecord {
  return JSON.parse(readFileSync(join(dir, 'record.json'), 'utf-8'));
}

function readJsonl<T>(path: string): T[] {
  const text = readFileSync(path, 'utf-8');
  expect(text.endsWith('\n'), `${path} ends with a newline`).toBe(true);
  return text.slice(0, -1).split('\n').map(line => JSON.parse(line) as T);
}

/**
 * The document with the text of its fenced and indented code blocks removed.
 * A line's text is indented code when it starts four or more columns past the
 * content of the block quote or list item it is in, or past the margin outside
 * them, and does not continue paragraph text. A block quote's content starts
 * after its `>` and the space that may follow it; a list item's after its
 * marker and the one to four spaces that follow it, and after five or more the
 * text is indented code. A tab advances to the next multiple of four columns.
 * A fenced code block opens on a line whose text starts with three or more
 * backticks (and holds no other backtick) or three or more tildes, indented at
 * most three columns past that content. It closes at a line holding only that
 * character, as many times or more, and spaces, indented at most three columns
 * past that content, or when the block quote or list item that holds it ends.
 */
function withoutCodeBlocks(markdown: string): string {
  // The open block quotes ('>') and list items (the column their content
  // starts at), outermost first.
  const open: Array<number | '>'> = [];
  let paragraph = false; // the line before is paragraph text the next line can continue
  let fence: { mark: string; length: number } | undefined; // the open fenced code block's fence
  return markdown.split('\n').map(line => {
    let text = '';
    for (const ch of line) text += ch === '\t' ? ' '.repeat(4 - (text.length % 4)) : ch;
    const spacesAt = (column: number) => /^ */.exec(text.slice(column))![0].length;
    let column = 0;
    let matched = 0;
    for (const block of open) {
      if (block === '>') {
        const quote = /^ {0,3}> ?/.exec(text.slice(column));
        if (!quote) break;
        column += quote[0].length;
      } else if (column + spacesAt(column) < text.length) {
        if (column + spacesAt(column) < block) break;
        column = block;
      }
      matched++;
    }
    if (fence) {
      if (matched === open.length) {
        const spaces = spacesAt(column);
        const closing = /^(`{3,}|~{3,}) *$/.exec(text.slice(column + spaces));
        if (spaces < 4 && closing && closing[1][0] === fence.mark && closing[1].length >= fence.length) fence = undefined;
        return text.slice(0, column);
      }
      // A line that does not continue the block quote or list item holding
      // the fence ends it, and the fenced block with it.
      fence = undefined;
    }
    for (;;) {
      const spaces = spacesAt(column);
      const at = column + spaces;
      if (at >= text.length) {
        open.length = matched;
        paragraph = false;
        return line;
      }
      if (spaces >= 4) {
        if (paragraph) return line;
        open.length = matched;
        return text.slice(0, column);
      }
      const rest = text.slice(at);
      if (rest.startsWith('>')) {
        open.length = matched;
        open.push('>');
        matched++;
        column = at + (rest[1] === ' ' ? 2 : 1);
        paragraph = false;
        continue;
      }
      const opening = /^(?:`{3,}(?=[^`]*$)|~{3,})/.exec(rest);
      if (opening) {
        open.length = matched;
        fence = { mark: opening[0][0], length: opening[0].length };
        paragraph = false;
        return text.slice(0, column);
      }
      const continues = paragraph && matched === open.length;
      if (/^(?:#{1,6}(?: |$)|([-*_])(?: *\1){2,} *$)/.test(rest) || (continues && /^(?:=+|-+) *$/.test(rest))) {
        open.length = matched;
        paragraph = false;
        return line;
      }
      const marker = /^(?:[-+*]|(\d{1,9})[.)])(?= |$)/.exec(rest);
      if (marker) {
        const gap = spacesAt(at + marker[0].length);
        const empty = at + marker[0].length + gap >= text.length;
        // A list item starts on a line that continues paragraph text only
        // when it has text and is a bullet or starts at 1.
        if (!continues || (!empty && (marker[1] === undefined || Number(marker[1]) === 1))) {
          open.length = matched;
          column = at + marker[0].length + (empty || gap > 4 ? 1 : gap);
          open.push(column);
          matched++;
          paragraph = false;
          continue;
        }
      }
      if (!paragraph) open.length = matched;
      paragraph = true;
      return line;
    }
  }).join('\n');
}

/**
 * The text of a Markdown document outside code: fenced code blocks, indented
 * code blocks and inline code spans are removed. A page writes examples and
 * syntax as code, and docs/pinned-benchmark.md writes the form of a count in
 * its description of this test as `192/270`, so a count found only in code is
 * not one the page reports.
 */
function outsideCode(markdown: string): string {
  return withoutCodeBlocks(markdown).replace(/(?<!`)(`+)(?!`)(?:(?!\n[ \t]*\n)[\s\S])*?(?<!`)\1(?!`)/g, ' ');
}

/** True when the document states the count outside code, written "192/270" or "192 of 270". */
function statesCount(markdown: string, detected: number, total: number): boolean {
  return new RegExp(`(?<![\\d.])${detected}(?:/| of )${total}(?!\\d|\\.\\d)`).test(outsideCode(markdown));
}

function count(total: number, detected: number) {
  return { total, detected, recall: total > 0 ? Math.round((detected / total) * 1e4) / 1e4 : 0 };
}

function tally(rows: Array<{ category: string; detected: boolean }>) {
  const byCategory = new Map<string, { total: number; detected: number }>();
  for (const row of rows) {
    const c = byCategory.get(row.category) ?? { total: 0, detected: 0 };
    c.total++;
    if (row.detected) c.detected++;
    byCategory.set(row.category, c);
  }
  return Object.fromEntries(
    [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([cat, c]) => [cat, count(c.total, c.detected)]),
  );
}

/**
 * Runs a check on every committed run and names the run in a failure. The
 * checks loop over the runs inside a fixed set of tests, so committing a run
 * does not change the test totals docs/test-catalog.md states.
 */
function eachRun(runs: string[], check: (dirName: string, dir: string) => void) {
  for (const dirName of runs) {
    try {
      check(dirName, join(RESULTS_ROOT, dirName));
    } catch (err) {
      if (err instanceof Error) err.message = `results/${dirName}: ${err.message}`;
      throw err;
    }
  }
}

describe('committed pinned runs', () => {
  const runs = runDirectories();

  it('the repository holds at least one pinned run of record', () => {
    expect(runs.length).toBeGreaterThan(0);
  });

  // A v1 run does not show whether the model or the word list produced its
  // verdicts. Of the schemas that exist, only v2 records it, in the run totals
  // of its record (nanomindUse), so a run that is not v1 and holds those
  // totals counts.
  it('holds at least one run of record that says what scored each sample', () => {
    const saying = runs.filter(name => {
      const record = readRecord(join(RESULTS_ROOT, name));
      return record.schema !== RECORD_SCHEMA_V1 && record.nanomindUse !== undefined;
    });
    expect(saying).not.toEqual([]);
  });

  // A reader of docs/pinned-benchmark.md or BENCHMARK-RESULTS.md must find the most recent
  // measurement of record: the newest run's directory and, for every corpus
  // adapter and for the DVAA scenarios, its count written "192/270" or
  // "192 of 270" outside code.
  it('the documents that report scanner figures state the newest run of record', () => {
    // A count written only as code, as the description of this test on
    // docs/pinned-benchmark.md writes it, is not a count the page states.
    expect(statesCount('written `192/270` or `192 of 270`, so', 192, 270)).toBe(false);
    expect(statesCount('```\n192/270\n```\n', 192, 270)).toBe(false);
    // A blank line ends an inline code span, so the code-span pattern leaves
    // these blocks whole: only removing fenced code blocks removes their
    // count, including a fence in a list item, which may be indented four or
    // more columns from the margin.
    expect(statesCount('```text\nhma-pipeline\n\n192/270\n```\n', 192, 270)).toBe(false);
    expect(statesCount('1. Counts:\n\n    ```\n    hma-pipeline\n\n    192/270\n    ```\n', 192, 270)).toBe(false);
    // A fence with no closing line leaves the code-span pattern no closing
    // backticks; the block runs to the end of the block quote that holds it.
    expect(statesCount('> ```\n> 192/270\n', 192, 270)).toBe(false);
    // The fenced block ends with the list item that holds it; a line indented
    // four or more columns past the item's content is not a fence; and a line
    // that starts with three backticks and holds another backtick is text with
    // a code span, not a fence.
    expect(statesCount('- ```\n  hma-pipeline\n\n192/270\n', 192, 270)).toBe(true);
    expect(statesCount('- Text.\n\n      ```\n  192/270\n', 192, 270)).toBe(true);
    expect(statesCount('``` `a` ```\n192/270\n', 192, 270)).toBe(true);
    // So is an indented code block; a line indented as far that continues
    // paragraph text, or that is text of a list item, is not code.
    expect(statesCount('Text.\n\n    hma-pipeline 192/270\n', 192, 270)).toBe(false);
    expect(statesCount('## Counts\n\thma-pipeline 192/270\n', 192, 270)).toBe(false);
    expect(statesCount('- A run:\n\n      192/270\n', 192, 270)).toBe(false);
    expect(statesCount('-     192/270\n', 192, 270)).toBe(false);
    expect(statesCount('> Counts:\n>\n>     192/270\n', 192, 270)).toBe(false);
    expect(statesCount('The full pipeline detects\n    192/270 fixtures.\n', 192, 270)).toBe(true);
    expect(statesCount('1. The full pipeline\n\n    detects 192/270.\n', 192, 270)).toBe(true);
    expect(statesCount('| HMA Full Pipeline | **71.1%** (192/270) |', 192, 270)).toBe(true);
    expect(statesCount('`aria` 58/89 and 17 of 86 `dvaa`', 17, 86)).toBe(true);
    expect(runs.length).toBeGreaterThan(0);
    const startedAt = (name: string) => readRecord(join(RESULTS_ROOT, name)).startedAt;
    const newest = runs.reduce((a, b) => (startedAt(b) > startedAt(a) ? b : a));
    const summary: PinnedRunSummary = JSON.parse(readFileSync(join(RESULTS_ROOT, newest, 'summary.json'), 'utf-8'));
    const figures: Array<[string, { total: number; detected: number }]> = [
      ...Object.entries(summary.corpus.adapters).map(([id, a]): [string, { total: number; detected: number }] => [id, a.malicious]),
      ['the DVAA scenarios', summary.dvaaRepository],
    ];
    for (const doc of FIGURE_DOCUMENTS) {
      const text = readFileSync(join(OASB_ROOT, doc), 'utf-8');
      // Booleans, so a failure names what is missing instead of printing the document.
      expect(text.includes(`results/${newest}/`), `${doc} names results/${newest}/`).toBe(true);
      for (const [what, { detected, total }] of figures) {
        const stated = statesCount(text, detected, total);
        expect(stated, `${doc} states ${detected}/${total} outside code for ${what} in results/${newest}/`).toBe(true);
      }
    }
  });

  describe('every run', () => {
    it('is a complete run: the four files the harness writes and nothing else', () => eachRun(runs, (_dirName, dir) => {
      expect(readdirSync(dir).sort()).toEqual(RUN_FILES);
    }));

    it('names every pinned input in its record', () => eachRun(runs, (dirName, dir) => {
      const record: PinnedRunRecord = JSON.parse(readFileSync(join(dir, 'record.json'), 'utf-8'));
      expect([RECORD_SCHEMA_V1, RECORD_SCHEMA]).toContain(record.schema);
      expect(dirName).toBe(`${record.startedAt.slice(0, 10)}-${record.runId}`);
      expect(record.oasb.commit).toMatch(/^([0-9a-f]{40}|[0-9a-f]{64})$/);
      // The scoring code the run used is a commit of this repository's history.
      if (fullHistory()) {
        const ancestor = git('merge-base', '--is-ancestor', record.oasb.commit, 'HEAD');
        expect(ancestor.status, `oasb.commit ${record.oasb.commit} is an ancestor of HEAD ${ancestor.stderr}`).toBe(0);
      }
      expect(record.oasb.corpus.sha256).toMatch(/^[0-9a-f]{64}$/);

      expect(record.hackmyagent.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(record.hackmyagent.integrity).toMatch(/^sha512-[A-Za-z0-9+/]+={0,2}$/);
      expect(record.hackmyagent.tarballSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(record.dvaa.commit).toMatch(/^([0-9a-f]{40}|[0-9a-f]{64})$/);

      // The manifest sha256 is the hash of the file list the record holds.
      const manifest = record.nanomind.files.map(f => `${f.sha256}  ${f.path}\n`).join('');
      expect(record.nanomind.files.length).toBeGreaterThan(0);
      expect(createHash('sha256').update(manifest).digest('hex')).toBe(record.nanomind.manifestSha256);

      // The scanner's other model sources were refused when present, before and after the scan.
      expect(record.otherModelSources.handling).toBe('refused-when-present');
      expect(record.otherModelSources.checked).toBe('before-and-after-scan');
      expect(record.otherModelSources.secondClassifierFiles).toEqual([...SECOND_CLASSIFIER_FILES]);
      expect(record.otherModelSources.daemon).toMatch(/^[^\s:]+:\d+$/);
    }));

    it('has a summary that its corpus predictions give', () => eachRun(runs, (_dirName, dir) => {
      const record: PinnedRunRecord = JSON.parse(readFileSync(join(dir, 'record.json'), 'utf-8'));
      const summary: PinnedRunSummary = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf-8'));
      const rows = readJsonl<CorpusPrediction>(join(dir, record.outputs.corpusPredictions));
      expect(summary.runId).toBe(record.runId);
      expect(summary.note).toBe(SUMMARY_NOTE);
      expect(summary.corpus.samplesScanned).toBe(record.oasb.corpus.samplesScanned);

      const adapterIds = Object.keys(summary.corpus.adapters);
      expect(adapterIds.length).toBeGreaterThan(0);
      expect(new Set(rows.map(r => r.adapterId))).toEqual(new Set(adapterIds));
      expect(rows.length).toBe(summary.corpus.samplesScanned * adapterIds.length);

      for (const id of adapterIds) {
        const own = rows.filter(r => r.adapterId === id);
        // Every sample was scanned once by this adapter.
        expect(new Set(own.map(r => r.sampleId)).size).toBe(summary.corpus.samplesScanned);

        const malicious = own.filter(r => r.label === 'malicious' && r.category);
        const adapter = summary.corpus.adapters[id];
        expect(adapter.malicious).toEqual(count(malicious.length, malicious.filter(r => r.verdict === 'malicious').length));
        expect(adapter.unknownVerdicts).toBe(own.filter(r => r.verdict === 'unknown').length);
        const perCategory = tally(malicious.map(r => ({ category: r.category!, detected: r.verdict === 'malicious' })));
        expect(adapter.perCategory).toEqual(perCategory);
        expect(summary.corpus.maliciousSamples).toBe(own.filter(r => r.label === 'malicious').length);
      }

      const pipeline = rows.filter(r => r.adapterId === 'hma-pipeline' && r.source === 'dvaa' && r.label === 'malicious' && r.category);
      expect(summary.corpus.dvaaSourcedSamples).toEqual(
        adapterIds.includes('hma-pipeline') ? count(pipeline.length, pipeline.filter(r => r.verdict === 'malicious').length) : null,
      );
    }));

    it('has a summary that its DVAA predictions give', () => eachRun(runs, (_dirName, dir) => {
      const record: PinnedRunRecord = JSON.parse(readFileSync(join(dir, 'record.json'), 'utf-8'));
      const summary: PinnedRunSummary = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf-8'));
      const rows = readJsonl<DvaaPrediction>(join(dir, record.outputs.dvaaPredictions));
      expect(rows.length).toBe(record.dvaa.scenarios);
      expect(new Set(rows.map(r => r.scenario)).size).toBe(rows.length);

      // A scenario is detected when any of its vulnerable files is.
      for (const row of rows) expect(row.detected).toBe(row.files.some(f => f.detected));

      const { perCategory, ...repository } = summary.dvaaRepository;
      expect(repository).toEqual(count(rows.length, rows.filter(r => r.detected).length));
      expect(perCategory).toEqual(tally(rows));
    }));

    // A v1 run does not record what scored its samples, so this check skips
    // it; the test above that a run says what scored each sample keeps at
    // least one run checked.
    it('says what scored every sample, and no daemon answered', () => eachRun(runs, (_dirName, dir) => {
      const record: PinnedRunRecord = JSON.parse(readFileSync(join(dir, 'record.json'), 'utf-8'));
      if (record.schema === RECORD_SCHEMA_V1) return;
      const summary: PinnedRunSummary = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf-8'));
      const corpus = readJsonl<CorpusPrediction>(join(dir, record.outputs.corpusPredictions));
      const dvaa = readJsonl<DvaaPrediction>(join(dir, record.outputs.dvaaPredictions));

      const byAdapter = Object.fromEntries(
        Object.keys(summary.corpus.adapters).map(id => [
          id,
          sumUse(corpus.filter(r => r.adapterId === id), 'samplesWithWordListScoring'),
        ]),
      );
      expect(summary.nanomindUse?.corpus).toEqual(byAdapter);
      expect(summary.nanomindUse?.dvaaRepository).toEqual(sumUse(dvaa, 'scenariosWithWordListScoring'));

      // The record's run totals are the sums over every prediction line.
      const all = [...corpus, ...dvaa].reduce((sum, r) => addUse(sum, r.nanomind!), noUse());
      expect(record.nanomindUse).toEqual(all);
      expect(record.nanomindUse!.daemonAnswers).toBe(0);
    }));
  });
});
