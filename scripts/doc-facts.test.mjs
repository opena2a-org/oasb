// Tests that statements in README.md, BENCHMARK-RESULTS.md,
// docs/pinned-benchmark.md, docs/test-catalog.md, docs/adapters.md,
// docs/how-it-works.md and docs/owasp-agentic-mapping.md match the corpus,
// scripts, adapters and scenario files they describe, that docs/demo.tape
// states no count and writes the results file its report step reads, that
// docs/oasb-demo.gif is the recording of that tape docs/captures/demo.json
// records, and that the verdict methodology in scripts/run-benchmark-v2.ts,
// benchmark-results-v6.json and src/benchmark/hma-pipeline-adapter.ts does
// not give the server count BENCHMARK-RESULTS.md withdrew.
// Run with: npm run test:scripts (node --test). Kept outside src/ so the
// vitest totals the README claims stay a count of benchmark tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateReport, readPackage, readScenarios } from './scenario-report.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(repo, file), 'utf8');
// Prose and blockquotes wrap anywhere; compare on single-spaced text.
const flat = (file) => read(file).replace(/\n[ \t]*>?[ \t]*/g, ' ').replace(/\s+/g, ' ');

const DOCS = ['README.md', 'BENCHMARK-RESULTS.md'];
const samples = JSON.parse(read('corpus/v2.json')).samples;

test('a cited script line holds the code the docs say it hard-codes', () => {
  const cite = /`(scripts\/[\w.-]+):(\d+)` hard-codes `([^`]+)`/g;
  let seen = 0;
  for (const doc of DOCS) {
    for (const [, file, line, code] of flat(doc).matchAll(cite)) {
      seen++;
      const at = read(file).split('\n')[Number(line) - 1] ?? '';
      assert.ok(at.includes(code), `${doc} cites ${file}:${line} for \`${code}\`, but that line is: ${at.trim()}`);
    }
  }
  assert.ok(seen > 0, 'no `file:line` hard-codes `code` citation found; update this test with the wording');
});

test('BENCHMARK-RESULTS.md states the source of each hand-authored benign sample', () => {
  const unscanned = samples.filter((s) => s.label === 'benign' && !s.metadata?.scanVerdict);
  const bySource = new Map();
  for (const s of unscanned) bySource.set(s.source, (bySource.get(s.source) ?? 0) + 1);
  const text = flat('BENCHMARK-RESULTS.md');
  assert.ok(text.includes(`further ${unscanned.length} are hand-authored fixtures`), `the ${unscanned.length} total is not stated`);
  for (const [source, n] of bySource) {
    assert.ok(text.includes(`${n} declare \`source: '${source}'\``), `${n} declare \`source: '${source}'\` is not stated`);
  }
});

// A number of tests or scenarios, with at most one word between them.
const COUNT = /\b\d+\s+(?:\w+\s+)?(?:tests?|scenarios?)\b/i;

test('the count pattern finds a count with or without a word before "tests" or "scenarios"', () => {
  for (const line of ['# 222 attack scenarios', '# 222 tests', 'Type "Run all 223 Scenarios"', '1 benchmark test']) {
    assert.ok(COUNT.test(line), `${line} is not found as a count`);
  }
  for (const line of ['# Step 1: Run the full benchmark (README.md states the test counts)', 'Type "npm test"', 'Sleep 8s']) {
    assert.ok(!COUNT.test(line), `${line} is found as a count`);
  }
});

test('docs/demo.tape states no test or scenario count', () => {
  // The tape is recorded once and kept, so a count in it goes stale as tests
  // are added; docs/test-catalog.md states the counts, and
  // scripts/check-readme.mjs holds them to the suite.
  const counted = read('docs/demo.tape')
    .split('\n')
    .map((line, i) => `docs/demo.tape:${i + 1}: ${line.trim()}`)
    .filter((line) => COUNT.test(line.replace(/^[^ ]+ /, '')));
  assert.deepEqual(counted, [], 'refer to the counts docs/test-catalog.md states instead');
});

// The text of each Type line of docs/demo.tape, in order: the commands the
// recording types.
const tapeCommands = () =>
  read('docs/demo.tape')
    .split('\n')
    .map((line) => /^Type\s+(["'`])(.*)\1\s*$/.exec(line.trim())?.[2])
    .filter((command) => command !== undefined);

test('docs/demo.tape writes the vitest JSON report its npm run report step reads, in a step before it', () => {
  // npm run report reads test-results.json, or the file named after "--", and
  // writes no report when that file does not exist (scripts/generate-report.ts).
  // The tape ran npm test, which writes no JSON report, before npm run report.
  const commands = tapeCommands();
  const at = commands.findIndex((command) => /^npm run report\b/.test(command));
  assert.ok(at >= 0, 'docs/demo.tape types no npm run report; update this test with the step that writes the report');
  const reads = /^npm run report -- (\S+)/.exec(commands[at])?.[1] ?? 'test-results.json';
  const file = reads.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const writes = new RegExp(`\\bvitest run\\b.*--reporter[= ]json\\b.*--outputFile(?:\\.json)?[= ]${file}(?:\\s|$)`);
  assert.ok(
    commands.slice(0, at).some((command) => writes.test(command)),
    `no step of docs/demo.tape before "${commands[at]}" writes ${reads} with vitest run --reporter=json --outputFile=${reads}`,
  );
});

test('docs/demo.tape and docs/oasb-demo.gif are the files docs/captures/demo.json records', () => {
  // The README links the GIF as a recording of a run. The recording of
  // 2026-03-11 showed the test total and the MITRE ATLAS mapping of that day
  // and was kept through later changes to the tape. The digests tie the GIF
  // to the tape it was recorded from: a change to either fails here until
  // the GIF is recorded again (vhs docs/demo.tape) and the record updated.
  const record = 'docs/captures/demo.json';
  assert.ok(existsSync(join(repo, record)), `${record} does not exist; record the GIF with vhs docs/demo.tape and describe the recording there`);
  const capture = JSON.parse(read(record));
  // The tape's digest is taken with LF line endings, so a checkout that
  // writes CRLF ones matches too.
  const tape = createHash('sha256').update(read('docs/demo.tape').replace(/\r\n/g, '\n')).digest('hex');
  const gif = createHash('sha256').update(readFileSync(join(repo, 'docs/oasb-demo.gif'))).digest('hex');
  assert.equal(tape, capture.tape?.sha256, `docs/demo.tape differs from the tape ${record} records; record the GIF again with vhs docs/demo.tape and update ${record}`);
  assert.equal(gif, capture.outputs?.gif?.sha256, `docs/oasb-demo.gif differs from the recording ${record} records; update ${record} with the recording`);
});

// The README section shows the commands; docs/how-it-works.md took the
// paragraph that says how each percentage is computed.
for (const doc of ['README.md', 'docs/how-it-works.md']) {
  test(`${doc} does not say opena2a benchmark and hackmyagent secure -b oasb-1 check the same controls`, () => {
    // opena2a benchmark reports check IDs over the level's check-ID set, and
    // hackmyagent secure -b oasb-1 reports control IDs over verified controls,
    // so the two percentages are not the same figure.
    const heading = '## Usage via OpenA2A CLI';
    const text = read(doc);
    const start = text.indexOf(`\n${heading}\n`);
    assert.ok(start >= 0, `${doc} has no "${heading}" section; update this test with the heading`);
    const end = text.indexOf('\n## ', start + heading.length + 1);
    const section = (end < 0 ? text.slice(start) : text.slice(start, end)).replace(/\s+/g, ' ');
    assert.ok(!/the same controls/i.test(section), `${doc}: "${heading}" says "the same controls"`);
  });
}

// Of the README's OASB-1 commands, only the hackmyagent ones exit non-zero on
// a Not Passing rating: on a copy of DVAA 0.9.2 that both CLIs rate Not
// Passing, `hackmyagent secure -b oasb-1` of hackmyagent 0.33.2 exits 1, and
// `opena2a benchmark` of opena2a-cli 0.10.13 exits 0, also with --ci. When
// opena2a benchmark gains a flag that exits non-zero on the rating, update
// the README and this test.
test('the README says which of its OASB-1 commands exit non-zero on a Not Passing rating', () => {
  const section = read('README.md')
    .split(/^## /m)
    .find((s) => s.startsWith('Usage via OpenA2A CLI\n'))
    ?.replace(/\s+/g, ' ');
  assert.ok(section, 'the README has no Usage via OpenA2A CLI section; update this test with the heading');
  const says = {
    'only the hackmyagent commands exit non-zero on a Not Passing rating':
      /only the `hackmyagent` ones exit non-zero on a Not Passing rating/,
    'hackmyagent secure -b oasb-1 exits 1': /`hackmyagent secure -b oasb-1` \(hackmyagent \d+\.\d+\.\d+\) exits 1\b/,
    'opena2a benchmark exits 0, also with --ci':
      /`opena2a benchmark` \(opena2a-cli \d+\.\d+\.\d+\) prints the rating and exits 0, also with `--ci`/,
  };
  for (const [what, re] of Object.entries(says)) {
    assert.match(section, re, `the README's Usage via OpenA2A CLI section does not say ${what}; update this test with the wording`);
  }
});

// The commands that write the scorecard, from the Usage lines of the
// generator's header, and the file the header says it writes.
const usage = (() => {
  const header = read('scripts/generate-report.ts').split('\n');
  const start = header.findIndex((l) => l.trim() === '* Usage:');
  const commands = [];
  for (const l of header.slice(start + 1)) {
    const command = l.replace(/^\s*\*\s*/, '');
    if (!command) break;
    commands.push(command);
  }
  return { commands, output: header.join('\n').match(/Writes (\S+\.md)/)?.[1] };
})();

test('the generator header names the commands that write the scorecard and its output file', () => {
  assert.equal(usage.commands.length, 2, 'scripts/generate-report.ts no longer has two Usage lines; update this test');
  assert.ok(usage.commands[0].includes('--reporter=json --outputFile='), usage.commands[0]);
  assert.ok(usage.commands[1].startsWith('npm run report'), usage.commands[1]);
  assert.equal(usage.output, 'REPORT.generated.md');
});

for (const doc of ['README.md', 'docs/test-catalog.md']) {
  test(`${doc} runs npm run report on the JSON report of the suite, in one code block`, () => {
    const blocks = read(doc).split(/^```.*$/m).filter((_, i) => i % 2 === 1);
    const block = blocks.find((b) => b.includes('npm run report'));
    assert.ok(block, `${doc} has no code block with npm run report, the command that writes the scorecard`);
    const lines = block.split('\n').map((l) => l.replace(/\s+#.*$/, '').trim()).filter(Boolean);
    const at = usage.commands.map((c) => lines.indexOf(c));
    assert.ok(at.every((i) => i !== -1), `the code block does not hold ${usage.commands.join(' then ')}:\n${block}`);
    assert.ok(at[0] < at[1], 'npm run report comes before the vitest run that writes its input');
    assert.ok(block.includes(usage.output), `the code block does not name ${usage.output}, the file npm run report writes`);
  });
}

test('the README names the scorecard command where Evaluating Other Products runs the suite', () => {
  const section = read('README.md').split(/^## /m).find((s) => s.startsWith('Evaluating Other Products'));
  assert.ok(section, 'the README has no Evaluating Other Products section');
  assert.ok(section.includes('npm run report'), 'Evaluating Other Products does not name npm run report');
  assert.ok(section.includes('REPORT.md'), 'Evaluating Other Products does not say what REPORT.md, the tracked report, is');
});

// A report npm run report writes, from a run with a passed, a not applicable
// and an otherwise skipped scenario, a scenario file that failed outside a
// test and a harness self-test, so that every row of the Summary is written.
const generated = (() => {
  const file = (path, statuses, suite = path, status = 'passed') => ({
    name: join(repo, path),
    status,
    assertionResults: statuses.map((s, i) => ({ ancestorTitles: [suite], title: `test ${i + 1}`, status: s })),
  });
  const files = [
    file('src/atomic/process/AT-PROC-001.spawn-child.test.ts', ['passed']),
    file('src/integration/INT-002.mcp-tool-abuse.test.ts', ['skipped'], 'INT-002 [requires: mcp-scanning]'),
    file('src/baseline/BL-003.baseline-persistence.test.ts', ['skipped']),
    file('src/e2e/E2E-001.live-filesystem-detection.test.ts', [], undefined, 'failed'),
    file('src/benchmark/scoring.test.ts', ['passed']),
  ];
  const tests = files.flatMap((f) => f.assertionResults);
  const count = (s) => tests.filter((t) => t.status === s).length;
  const results = {
    numTotalTests: tests.length,
    numPassedTests: count('passed'),
    numFailedTests: count('failed'),
    numPendingTests: count('skipped'),
    testResults: files,
  };
  const adapter = { adapter: 'reference', product: 'arp-guard', version: '0.0.0', capabilities: ['process-monitoring'] };
  return generateReport({ scenarios: readScenarios(repo), results, adapter, benchmark: readPackage(repo), date: '2026-10-17' });
})();

// The README links this paragraph from Evaluating Other Products.
test('docs/test-catalog.md describes the Summary npm run report writes', () => {
  const paragraph = read('docs/test-catalog.md')
    .split(/\n\s*\n/)
    .find((p) => p.startsWith('`REPORT.generated.md` '))
    ?.replace(/`/g, '')
    .replace(/\s+/g, ' ');
  assert.ok(paragraph, 'docs/test-catalog.md has no paragraph that starts with `REPORT.generated.md`; update this test with the wording');
  const summary = generated.slice(generated.indexOf('\n## Summary\n')).split(/\n(?=## )/)[1];
  const facts = {
    'the benchmark line': generated.match(/^(Benchmark): /m)?.[1],
    'the product under test line': generated.match(/^(Product under test): /m)?.[1],
    'the directories of the attack scenarios': summary.match(/^Counts of the attack scenarios, the tests under (.+)\.$/m)?.[1],
    'what the pass rate is over': summary.match(/the pass rate is (over [^.]+)\./)?.[1],
    'the harness self-tests line': summary.match(/^(Harness self-tests): /m)?.[1],
    'the known gaps heading': generated.match(/^## (Known Gaps.*)$/m)?.[1],
  };
  for (const [what, text] of Object.entries(facts)) {
    assert.ok(text, `the generated report has no ${what}; update this test with its wording`);
    assert.ok(paragraph.includes(text), `docs/test-catalog.md does not name ${what}, "${text}"`);
  }
  const rows = [...summary.matchAll(/^\| ([^|]+?) \| [^|]+ \|$/gm)].map(([, row]) => row).filter((row) => !/^(Metric|-+)$/.test(row));
  assert.ok(rows.length > 0, 'the generated Summary has no table rows');
  for (const row of rows) assert.ok(paragraph.includes(row), `docs/test-catalog.md does not name the Summary row "${row}"`);
  assert.ok(!/skipped tests/.test(paragraph), 'docs/test-catalog.md counts tests where the Summary counts attack scenarios');
});

// The paragraph on what REPORT.generated.md holds moved from the README to
// docs/test-catalog.md; the 0.4.1 entries of CHANGELOG.md name the page that
// holds it.
test('CHANGELOG.md names the page that says what REPORT.generated.md holds', () => {
  const pages = { 'The README': 'README.md', '`docs/test-catalog.md`': 'docs/test-catalog.md' };
  const holds = (doc) => read(doc).split(/\n\s*\n/).some((p) => p.startsWith('`REPORT.generated.md` starts with'));
  const entry = read('CHANGELOG.md').split(/^## /m).find((s) => s.startsWith('0.4.1 '))?.replace(/\s+/g, ' ');
  assert.ok(entry, 'CHANGELOG.md has no 0.4.1 section');
  for (const says of ['says what that file holds', 'describes the Summary `npm run report` writes']) {
    const claims = [...entry.matchAll(new RegExp(`(The README|\`docs/test-catalog\\.md\`)(?:'s Evaluating Other Products section)? ${says}`, 'g'))];
    assert.equal(claims.length, 1, `the 0.4.1 section of CHANGELOG.md does not say once which page ${says}; update this test with the wording`);
    const [[claim, name]] = claims;
    assert.ok(holds(pages[name]), `CHANGELOG.md says "${claim}", but ${pages[name]} has no paragraph that starts with \`REPORT.generated.md\` starts with`);
  }
});

// The sentence on the shapes a custom adapter module may export its class in
// was removed from the README; docs/adapters.md states them. The 0.4.1 entry
// on `module.exports = Class` names the page that does.
test('CHANGELOG.md names the page that states the accepted adapter export shapes', () => {
  const pages = { 'the README': 'README.md', '`docs/adapters.md`': 'docs/adapters.md' };
  const shapes = ['default export', 'named export `Adapter`', '`module.exports = Class`'];
  const entry = read('CHANGELOG.md').split(/^## /m).find((s) => s.startsWith('0.4.1 '))?.replace(/\s+/g, ' ');
  assert.ok(entry, 'CHANGELOG.md has no 0.4.1 section');
  const page = '(?:the README|`docs/adapters\\.md`)';
  const claims = [...entry.matchAll(new RegExp(`\`module\\.exports = Class\`, which (${page}(?: and ${page})?) (?:now )?states?\\b`, 'g'))];
  assert.equal(claims.length, 1, 'the 0.4.1 section of CHANGELOG.md does not say once which page states the shapes after `module.exports = Class`; update this test with the wording');
  const [[claim, named]] = claims;
  for (const name of named.split(' and ')) {
    const text = flat(pages[name]);
    const missing = shapes.filter((shape) => !text.includes(shape));
    assert.deepEqual(missing, [], `CHANGELOG.md says "${claim}", but ${pages[name]} does not state ${missing.join(', ')}`);
  }
});

test('docs/pinned-benchmark.md states the uncategorized malicious count corpus/v2.json holds', () => {
  const n = samples.filter((s) => s.label === 'malicious' && !s.category).length;
  assert.ok(flat('docs/pinned-benchmark.md').includes(`also holds ${n} uncategorized malicious samples`), `${n} uncategorized malicious samples is not stated`);
});

test('docs/adapters.md says a missing rebuff fails each scenario file at collection, and a missing typescript each scan', () => {
  // getCapabilities() of the rebuff adapter reads rebuff's package.json, and
  // each scenario file calls it through describeWithCapability while vitest
  // collects the file, so a missing rebuff fails the file before any of its
  // tests runs. typescript is loaded by a scan, so a missing typescript fails
  // each scan. src/harness/rebuff-wrapper.test.ts holds both cases.
  assert.match(
    read('src/harness/rebuff-wrapper.ts'),
    /version: rebuffVersion\(\)/,
    'getCapabilities() of the rebuff adapter no longer calls rebuffVersion(); update docs/adapters.md and this test',
  );
  const paragraph = read('docs/adapters.md').split(/\n\s*\n/).find((p) => p.startsWith('The rebuff adapter runs'));
  assert.ok(paragraph, 'docs/adapters.md has no paragraph that starts "The rebuff adapter runs"; update this test with the wording');
  const text = paragraph.replace(/\s+/g, ' ');
  assert.doesNotMatch(text, /either package is missing/, 'the paragraph says a missing rebuff fails each scan, as a missing typescript does');
  assert.match(text, /When the rebuff package is missing, each scenario file fails while vitest collects it/);
  assert.match(text, /When `typescript` is missing, [^.]*each scan fails/);
});

// Section 3 of BENCHMARK-RESULTS.md withdrew the count of benign registry MCP
// servers once given as a reason to leave AST-SCOPE-001 out of the verdict:
// the corpus export script wrote allowedTools:["*"] into the samples it
// synthesized, so the count measured the script, not the servers. The earlier
// runner writes its methodology note into each results file it writes,
// section 7 names the note of benchmark-results-v6.json as the verdict
// methodology, and the pipeline adapter holds the exclusion.
const WITHDRAWN_COUNT = /\b2,?900\b|(?:\b\d[\d,]*\+?|\bthousands of)\s+benign\b/i;

test('the withdrawn-count pattern finds a count of benign servers with or without a sign around it', () => {
  for (const text of [
    'posture issue that >2,900 benign registry MCP servers also declare via allowedTools:["*"]',
    'Over 2,900 benign registry MCP servers declare allowedTools:["*"]',
    'that 2,900+ benign registry MCP servers also declare',
    'a signal that fires on thousands of benign configs',
    'over 2900 servers declare it',
  ]) {
    assert.ok(WITHDRAWN_COUNT.test(text), `${text} is not found as the count`);
  }
  for (const text of [
    'a least-privilege posture issue, not an attack, however many configs declare it',
    'BENCHMARK-RESULTS.md section 3 withdraws the count of benign registry MCP servers',
    'fire on benign and malicious artifacts alike',
  ]) {
    assert.ok(!WITHDRAWN_COUNT.test(text), `${text} is found as the count`);
  }
});

// The value of a constant a script joins from single-quoted string literals.
function joinedConstant(file, name) {
  const text = read(file);
  const start = text.indexOf(`\nconst ${name} =`);
  if (start < 0) return undefined;
  const literals = text.slice(start, text.indexOf(';\n', start)).matchAll(/'((?:[^'\\\n]|\\.)*)'/g);
  return [...literals].map(([, s]) => s.replace(/\\(.)/g, '$1')).join('');
}

const methodologyNotes = {
  'METHODOLOGY_NOTE in scripts/run-benchmark-v2.ts': () => joinedConstant('scripts/run-benchmark-v2.ts', 'METHODOLOGY_NOTE'),
  'the note of benchmark-results-v6.json': () => JSON.parse(read('benchmark-results-v6.json')).note,
};

for (const [where, note] of Object.entries(methodologyNotes)) {
  test(`${where} gives the posture argument for excluding AST-SCOPE-001 and not the withdrawn server count`, () => {
    const text = note();
    assert.ok(text, `${where} is not found; update this test`);
    assert.ok(text.includes('AST-SCOPE-001 (wildcard tool access'), `${where} does not name AST-SCOPE-001 among the excluded findings; update this test with the wording`);
    assert.ok(text.includes('least-privilege posture issue'), `${where} does not say AST-SCOPE-001 is a least-privilege posture issue`);
    assert.ok(!WITHDRAWN_COUNT.test(text), `${where} gives the withdrawn count: ${text.match(WITHDRAWN_COUNT)?.[0]}`);
  });
}

test('the note of benchmark-results-v6.json says the server count it gave is withdrawn', () => {
  assert.match(methodologyNotes['the note of benchmark-results-v6.json'](), /BENCHMARK-RESULTS\.md section 3 withdraws that count/);
});

test('src/benchmark/hma-pipeline-adapter.ts gives no count of benign servers as a reason for excluding AST-SCOPE-001', () => {
  // Comment lines read as one text, so a count is found where a line wraps.
  const text = read('src/benchmark/hma-pipeline-adapter.ts').replace(/\n[ \t]*\/\/[ \t]*/g, ' ');
  assert.ok(text.includes("'AST-SCOPE-001',"), 'the adapter no longer excludes AST-SCOPE-001; update this test');
  assert.ok(!WITHDRAWN_COUNT.test(text), `the adapter gives the withdrawn count: ${text.match(WITHDRAWN_COUNT)?.[0]}`);
});

// The LLM07 row of the gaps table on docs/owasp-agentic-mapping.md said there
// was no system-prompt-extraction detection, while AT-AI-001 tests that
// prompt-input scanning detects a request to repeat the system prompt
// (pattern DE-001) and AT-AI-002 that prompt-output scanning detects a system
// prompt disclosed in a response (pattern OL-003). The row names each test
// with its pattern, each test file holds the test the row names, and no
// scenario header cites LLM07, as the row says.
test('the LLM07 row of docs/owasp-agentic-mapping.md names the system-prompt extraction and leak tests the scenario files hold', () => {
  const rows = read('docs/owasp-agentic-mapping.md').split('\n').filter((line) => /^\|\s*LLM07\s*\|/.test(line));
  assert.equal(rows.length, 1, `docs/owasp-agentic-mapping.md has ${rows.length} LLM07 rows; update this test with the table`);
  const gap = rows[0].split('|')[3].trim();
  assert.doesNotMatch(gap, /\bno\b[^;]*\bdetection\b|\bnot detected\b/i, `the LLM07 row says there is no detection: ${gap}`);
  const scenarios = readScenarios(repo);
  for (const { id, scan, pattern } of [
    { id: 'AT-AI-001', scan: 'scanInput', pattern: 'DE-001' },
    { id: 'AT-AI-002', scan: 'scanOutput', pattern: 'OL-003' },
  ]) {
    assert.ok(gap.includes(`${pattern} in ${id}`), `the LLM07 row does not name ${pattern} in ${id}; update this test with the wording: ${gap}`);
    const file = scenarios.find((s) => s.id === id)?.file;
    assert.ok(file, `no scenario file has the ID ${id}`);
    // Each it() of the file, up to the next one; a skipped or todo test is
    // left out.
    const tests = read(file).split(/^(?=[ \t]*(?:it|test)\b[.(])/m).filter((t) => /^[ \t]*(?:it|test)\(/.test(t));
    const detects = new RegExp(String.raw`scanner\.${scan}\([\s\S]*expect\([^;]*===\s*['"]${pattern}['"][^;]*\)\.toBe\(true\)`);
    assert.ok(tests.some((t) => detects.test(t)), `${file} has no test that asserts scanner.${scan}() matches ${pattern}`);
  }
  const citing = scenarios
    .filter(({ file }) => {
      const text = read(file);
      return /^\/\/ OWASP:.*\bLLM07\b/m.test(text.slice(0, text.search(/^(?!\/\/)/m)));
    })
    .map(({ file }) => file);
  assert.deepEqual(citing, [], 'the LLM07 row says no scenario cites LLM07');
});
