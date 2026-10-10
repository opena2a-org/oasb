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

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RECORD_SCHEMA, SUMMARY_NOTE, type PinnedRunRecord, type PinnedRunSummary } from './harness.js';
import { SECOND_CLASSIFIER_FILES } from './inputs.js';

const RESULTS_ROOT = resolve(__dirname, '..', '..', '..', 'results');
const RUN_FILES = ['corpus-predictions.jsonl', 'dvaa-predictions.jsonl', 'record.json', 'summary.json'];

interface CorpusPrediction {
  adapterId: string;
  sampleId: string;
  label: string;
  category: string | null;
  source: string;
  verdict: string;
}

interface DvaaPrediction {
  scenario: string;
  category: string;
  detected: boolean;
  files: Array<{ file: string; detected: boolean }>;
}

function runDirectories(): string[] {
  if (!existsSync(RESULTS_ROOT)) return [];
  return readdirSync(RESULTS_ROOT)
    .filter(name => statSync(join(RESULTS_ROOT, name)).isDirectory())
    .sort();
}

function readJsonl<T>(path: string): T[] {
  const text = readFileSync(path, 'utf-8');
  expect(text.endsWith('\n'), `${path} ends with a newline`).toBe(true);
  return text.slice(0, -1).split('\n').map(line => JSON.parse(line) as T);
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

describe('committed pinned runs', () => {
  const runs = runDirectories();

  it('the repository holds at least one pinned run of record', () => {
    expect(runs.length).toBeGreaterThan(0);
  });

  describe.each(runs)('results/%s', dirName => {
    const dir = join(RESULTS_ROOT, dirName);

    it('is a complete run: the four files the harness writes and nothing else', () => {
      expect(readdirSync(dir).sort()).toEqual(RUN_FILES);
    });

    it('names every pinned input in its record', () => {
      const record: PinnedRunRecord = JSON.parse(readFileSync(join(dir, 'record.json'), 'utf-8'));
      expect(record.schema).toBe(RECORD_SCHEMA);
      expect(dirName).toBe(`${record.startedAt.slice(0, 10)}-${record.runId}`);
      expect(record.oasb.commit).toMatch(/^([0-9a-f]{40}|[0-9a-f]{64})$/);
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
    });

    it('has a summary that its corpus predictions give', () => {
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
    });

    it('has a summary that its DVAA predictions give', () => {
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
    });
  });
});
