/**
 * Command line for the pinned benchmark harness (scripts/run-pinned-benchmark.ts).
 *
 * Exit codes:
 *   0  the run wrote a new results directory (or --observe found no problem)
 *   1  unexpected failure
 *   2  refused: an input is unpinned, does not match its pin or is dirty, or
 *      the results directory exists; nothing was overwritten
 *   3  an input changed during the run; no results were written
 */

import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadDVAAScenarios } from '../dvaa-suite.js';
import { InputDriftError, ResultsExistError, runPinnedBenchmark, type PinnedRunOptions } from './harness.js';
import {
  defaultOtherModelSources,
  hackmyagentPackageDir,
  nanomindManifest,
  observeDvaa,
  observeHackmyagent,
  verifyDvaaFiles,
  verifyHackmyagent,
  verifyNoOtherModelSources,
  type OtherModelSources,
} from './inputs.js';
import { PinError } from './pins.js';

export const USAGE = `OASB pinned benchmark harness

Usage:
  npx tsx scripts/run-pinned-benchmark.ts --pins <file> --hma <dir> --dvaa <dir>
  npx tsx scripts/run-pinned-benchmark.ts --observe --hma <dir> --dvaa <dir>

Options:
  --pins <file>   Pin file naming the hackmyagent version and tarball integrity,
                  the DVAA commit and the NanoMind manifest sha256
  --hma <dir>     Directory holding hackmyagent-<version>.tgz (npm pack) and
                  node_modules/hackmyagent installed from that tarball
  --dvaa <dir>    damn-vulnerable-ai-agent checkout at the pinned commit
  --observe       Print the pin values of the given inputs and stop; scans nothing
  --help          Show this help

The NanoMind model directory is ~/.nanomind/models. The scanner looks in
other places before it (models/ under the working directory comes first), so
a run is refused when the scanner's classifier reports a model or tokenizer
file that is not in that directory. A run is also refused while
~/.opena2a/nanomind/models, or node_modules/nanomind/training/models-tme-v3,
models-tme-v2 or models-tme in the --hma directory, holds both
nanomind-tme.bin and tokenizer.json, or while anything accepts a connection
at 127.0.0.1:47200 (a NanoMind daemon): the scanner can take its results from
either, and neither is pinned. A run is refused when the scanner's classifier
model does not load, and writes nothing when that address answers a request
the scanner sends it during the run.

Keep the pin file and the --hma directory outside the OASB checkout: a run
is refused while the checkout has uncommitted or untracked files. Results are
written to results/<date>-<runid>/ and never overwrite an existing file. See
docs/pinned-benchmark.md.

Exit codes: 0 done, 1 unexpected failure, 2 refused (unpinned, mismatched or
dirty input, or results exist), 3 an input changed during the run.
`;

export interface CliIo {
  out: (line: string) => void;
  err: (line: string) => void;
}

const defaultIo: CliIo = {
  out: line => process.stdout.write(line + '\n'),
  err: line => process.stderr.write(line + '\n'),
};

function option(args: string[], name: string): string | undefined {
  const eq = args.find(a => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length && !args[i + 1].startsWith('--') ? args[i + 1] : undefined;
}

/** Print the pin values the given inputs have now, and any reason they would be refused. */
async function observe(
  hmaDir: string,
  dvaaDir: string,
  modelsDir: string,
  otherModelSources: OtherModelSources,
  io: CliIo,
): Promise<number> {
  const problems: string[] = [];
  const pins: Record<string, unknown> = {};

  try {
    const hma = observeHackmyagent(hmaDir);
    pins.hackmyagent = hma;
    try {
      verifyHackmyagent(hmaDir, hma);
    } catch (err) {
      problems.push((err as Error).message);
    }
  } catch (err) {
    problems.push((err as Error).message);
  }

  try {
    const dvaa = observeDvaa(dvaaDir);
    pins.dvaa = { commit: dvaa.commit };
    if (dvaa.dirty.length > 0) problems.push(`dirty input tree: the DVAA checkout has uncommitted changes`);
    try {
      verifyDvaaFiles(dvaaDir, dvaa.commit, loadDVAAScenarios(dvaaDir, dvaa.objectFormat).readFiles);
    } catch (err) {
      problems.push((err as Error).message);
    }
  } catch (err) {
    problems.push((err as Error).message);
  }

  try {
    pins.nanomind = { manifestSha256: nanomindManifest(modelsDir).manifestSha256 };
  } catch (err) {
    problems.push((err as Error).message);
  }

  try {
    await verifyNoOtherModelSources(otherModelSources, hackmyagentPackageDir(hmaDir));
  } catch (err) {
    problems.push((err as Error).message);
  }

  io.out(JSON.stringify(pins, null, 2));
  const version = (pins.hackmyagent as { version?: string } | undefined)?.version;
  if (version) {
    io.err(`Check the integrity against the registry before pinning it: npm view hackmyagent@${version} dist.integrity`);
  }
  for (const p of problems) io.err(`problem: ${p}`);
  return problems.length > 0 ? 2 : 0;
}

export async function runCli(
  argv: string[],
  io: CliIo = defaultIo,
  overrides: Partial<
    Pick<PinnedRunOptions, 'oasbRoot' | 'nanomindModelsDir' | 'otherModelSources' | 'runId' | 'now'>
  > = {},
): Promise<number> {
  const args = argv.filter(a => a !== '--');
  if (args.includes('--help') || args.includes('-h')) {
    io.out(USAGE);
    return 0;
  }

  const hmaDir = option(args, '--hma');
  const dvaaDir = option(args, '--dvaa');
  const pinsPath = option(args, '--pins');
  const nanomindModelsDir = overrides.nanomindModelsDir ?? join(homedir(), '.nanomind', 'models');
  const otherModelSources = overrides.otherModelSources ?? defaultOtherModelSources();
  const oasbRoot = overrides.oasbRoot ?? resolve(__dirname, '..', '..', '..');

  if (!hmaDir || !dvaaDir || (!pinsPath && !args.includes('--observe'))) {
    io.err('refused: --hma, --dvaa and --pins are required (--pins is not needed with --observe)');
    io.err(USAGE);
    return 2;
  }

  if (args.includes('--observe')) {
    return observe(resolve(hmaDir), resolve(dvaaDir), nanomindModelsDir, otherModelSources, io);
  }

  try {
    const outcome = await runPinnedBenchmark({
      pinsPath: resolve(pinsPath!),
      hmaDir: resolve(hmaDir),
      dvaaDir: resolve(dvaaDir),
      nanomindModelsDir,
      otherModelSources,
      oasbRoot,
      runId: overrides.runId,
      now: overrides.now,
      log: io.out,
    });
    const { record, summary } = outcome;
    io.out(`hackmyagent ${record.hackmyagent.version} (${record.hackmyagent.integrity})`);
    io.out(`DVAA ${record.dvaa.commit}, NanoMind manifest ${record.nanomind.manifestSha256}`);
    for (const [id, a] of Object.entries(summary.corpus.adapters)) {
      const unknown = a.unknownVerdicts > 0 ? `, ${a.unknownVerdicts} unknown verdicts (scan errors)` : '';
      const wordList = summary.nanomindUse?.corpus[id]?.samplesWithWordListScoring ?? 0;
      const scoredByWordList = wordList > 0 ? `, ${wordList} of ${summary.corpus.samplesScanned} samples scored by the word list` : '';
      io.out(`corpus ${id}: ${a.malicious.detected}/${a.malicious.total} malicious detected${unknown}${scoredByWordList}`);
    }
    io.out(`DVAA repository: ${summary.dvaaRepository.detected}/${summary.dvaaRepository.total} scenarios detected`);
    const use = record.nanomindUse;
    if (use) {
      io.out(
        `NanoMind: ${use.modelInferences} model inferences, ${use.wordListScorings} word-list scorings, ` +
          `${use.neuralInferences} neural classifier inferences, ${use.daemonRequests} daemon requests (none answered)`,
      );
    }
    io.out(`Wrote ${outcome.runDirectory}/`);
    return 0;
  } catch (err) {
    if (err instanceof PinError) {
      io.err(`refused: ${err.message}`);
      io.err('Nothing was scanned and nothing was written.');
      return 2;
    }
    if (err instanceof ResultsExistError) {
      io.err(`refused: ${err.message}`);
      return 2;
    }
    if (err instanceof InputDriftError) {
      io.err(`refused: ${err.message}`);
      return 3;
    }
    io.err(`pinned benchmark failed: ${(err as Error)?.stack ?? err}`);
    return 1;
  }
}
