// The floor under a run of attack scenarios: a vitest globalSetup module that
// vitest.config.ts registers. After the run, its teardown writes one line to
// stderr saying how many of the run's scenario tests were evaluated (passed or
// failed), and sets exit code 2 when none was. An adapter that declares none
// of the capabilities the selected scenarios need gets every one of them
// skipped; that run measured nothing, so it does not exit 0 as a passing run
// does. Exit 1 stays vitest's "measured, and a test failed".
//
//   OASB: <evaluated> of <selected> attack scenarios evaluated       (exit unchanged)
//   OASB: not measured (0 of <selected> attack scenarios evaluated)  (exit 2)
//   OASB: not measured (the run's test results could not be read)    (exit 2)
//
// A scenario test is a test in a file under one of SCENARIO_DIRS. A run that
// selects none (npx vitest run src/benchmark/) gets no line and keeps its
// exit. So does collecting the suite without running it (vitest list, npm run
// check:readme): vitest calls the teardown then too, and no test file has a
// result. No variable or flag lowers the floor.
//
// vitest calls the teardown in its main process after the reporters have
// finished, so the line follows vitest's summary and the JSON report of
// --reporter=json --outputFile is already written. Kept outside src/, so it
// is not compiled into dist.

import { relative, sep } from 'node:path';
import type { TestProject } from 'vitest/node';
import { SCENARIO_DIRS } from './readme-counts.mjs';

/** The parts of a vitest task (a file, suite or test) the floor reads. */
interface Task {
  type?: unknown;
  filepath?: unknown;
  result?: { state?: unknown } | null;
  tasks?: unknown;
}

const UNREADABLE = "OASB: not measured (the run's test results could not be read)";

/** The child tasks of `task`; throws when it has no task list. */
function children(task: Task): Task[] {
  if (!Array.isArray(task.tasks)) throw new Error('a test file or suite has no task list');
  return task.tasks as Task[];
}

/** Adds the tests under `task`, and those of them that passed or failed, to `counts`. */
function countTests(task: Task, counts: { selected: number; evaluated: number }): void {
  for (const child of children(task)) {
    if (child.type === 'test') {
      counts.selected++;
      const state = child.result?.state;
      if (state === 'pass' || state === 'fail') counts.evaluated++;
    } else {
      countTests(child, counts);
    }
  }
}

/** True when `filepath` is in one of SCENARIO_DIRS under `root`. */
function isScenarioFile(root: string, filepath: string): boolean {
  const path = relative(root, filepath).split(sep).join('/');
  return SCENARIO_DIRS.some((dir: string) => path.startsWith(`${dir}/`));
}

/**
 * The line for the run whose test files `readFiles` returns, and whether it
 * exits 2: null when the run selected no scenario test or ran no test file.
 */
function floor(root: string, readFiles: () => unknown): { line: string; notMeasured: boolean } | null {
  const counts = { selected: 0, evaluated: 0 };
  try {
    const files = readFiles();
    if (!Array.isArray(files) || files.length === 0) return { line: UNREADABLE, notMeasured: true };
    // Collecting without running leaves every test file without a result. A
    // run gives one to each file it reached that holds a test.
    if (!(files as Task[]).some((file) => file?.result != null && children(file).length > 0)) return null;
    for (const file of files as Task[]) {
      if (typeof file?.filepath !== 'string') throw new Error('a test file has no path');
      if (isScenarioFile(root, file.filepath)) countTests(file, counts);
    }
  } catch {
    return { line: UNREADABLE, notMeasured: true };
  }
  if (counts.selected === 0) return null;
  if (counts.evaluated === 0) {
    return { line: `OASB: not measured (0 of ${counts.selected} attack scenarios evaluated)`, notMeasured: true };
  }
  return { line: `OASB: ${counts.evaluated} of ${counts.selected} attack scenarios evaluated`, notMeasured: false };
}

export default function setup(project: TestProject): () => void {
  return () => {
    const result = floor(project.config.root, () => project.vitest.state.getFiles());
    if (!result) return;
    process.stderr.write(`${result.line}\n`);
    // Raise to 2; an exit vitest already set above 2 (an interrupted run) stays.
    if (result.notMeasured && !(Number(process.exitCode ?? 0) > 2)) process.exitCode = 2;
  };
}
