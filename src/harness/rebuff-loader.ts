/**
 * Loads the heuristic prompt injection detection of the rebuff npm package.
 *
 * rebuff publishes TypeScript sources only (its "main" is src/index.ts), so
 * Node cannot require it. The sources the heuristic needs are compiled in
 * memory with the typescript package and run as CommonJS modules; rebuff's own
 * dependencies (string-similarity) are required from its install directory.
 * Imports rebuff uses only as types (openai, langchain) are dropped by the
 * compiler and never loaded.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import { createRequire } from 'module';

export type RebuffHeuristic = (input: string) => number;

const HEURISTIC_SOURCE = 'src/lib/detect.ts';
const HEURISTIC_EXPORT = 'detectPromptInjectionUsingHeuristicOnInput';
const HOW_TO_INSTALL =
  'Run `npm ci` in an OASB checkout, or `npm install --save-dev rebuff typescript` where OASB is a dependency.';

const reason = (err: unknown): string => (err instanceof Error ? err.message : String(err)).split('\n')[0];

/** Runs one of rebuff's TypeScript source files, and the relative files it imports, as CommonJS. */
function runSource(file: string, ts: typeof import('typescript'), loaded: Map<string, { exports: any }>): any {
  const seen = loaded.get(file);
  if (seen) return seen.exports;

  const { outputText } = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  });
  const mod = { exports: {} as any };
  loaded.set(file, mod);

  const requireFromRebuff = createRequire(file);
  const requireSource = (specifier: string): any => {
    if (!specifier.startsWith('.')) return requireFromRebuff(specifier);
    const target = path.resolve(path.dirname(file), specifier);
    const source = [`${target}.ts`, path.join(target, 'index.ts')].find((candidate) => fs.existsSync(candidate));
    if (!source) throw new Error(`${file} imports ${specifier}, which is not among rebuff's sources`);
    return runSource(source, ts, loaded);
  };
  vm.compileFunction(outputText, ['exports', 'require', 'module', '__filename', '__dirname'], { filename: file })(
    mod.exports,
    requireSource,
    mod,
    file,
    path.dirname(file),
  );
  return mod.exports;
}

/**
 * Returns rebuff's heuristic scorer (0 to 1) from the rebuff package that
 * `fromDir` resolves. Throws an Error that names what is missing when the
 * package, the compiler or the heuristic itself cannot be loaded.
 */
export function loadRebuffHeuristic(fromDir: string = __dirname): RebuffHeuristic {
  let root: string;
  try {
    root = path.dirname(createRequire(path.join(fromDir, 'rebuff-loader.js')).resolve('rebuff/package.json'));
  } catch {
    throw new Error(`The rebuff adapter needs the rebuff npm package, and it is not installed. ${HOW_TO_INSTALL}`);
  }

  let ts: typeof import('typescript');
  try {
    ts = require('typescript');
  } catch {
    throw new Error(
      `The rebuff adapter needs the typescript npm package to compile rebuff's TypeScript sources, and it is not installed. ${HOW_TO_INSTALL}`,
    );
  }

  const source = path.join(root, HEURISTIC_SOURCE);
  let detect: unknown;
  try {
    detect = runSource(source, ts, new Map())[HEURISTIC_EXPORT];
  } catch (err) {
    throw new Error(`The rebuff adapter could not load rebuff's heuristic detection from ${source}: ${reason(err)}`);
  }
  if (typeof detect !== 'function') {
    throw new Error(
      `The rebuff adapter could not load rebuff's heuristic detection: ${source} does not export ${HEURISTIC_EXPORT}.`,
    );
  }
  return detect as RebuffHeuristic;
}
