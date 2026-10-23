// The checklist command: `npx @opena2a/oasb checklist`, which bin/oasb.mjs
// passes here. It prints the controls of OASB-1 by level, each with its
// requirement, a question to ask the vendor of an agent, the steps that
// verify it and, where HackMyAgent maps a check to the control, the command
// that prints the control from a HackMyAgent report with its status.
//
//   npx @opena2a/oasb checklist              every control, levels L1 to L3
//   npx @opena2a/oasb checklist --level L1   the controls a run at L1 checks
//   npx @opena2a/oasb checklist --json       the same list, as JSON
//
// A level adds its controls to those of the levels below it, as
// `hackmyagent secure -b oasb-1 -l <level>` checks them. The controls are
// read from oasb-1-checklist.json beside this file. docs/oasb-1-checklist.md
// is the same checklist as a page, and scripts/oasb-1-checklist.test.mjs
// fails when the page and the command's output differ.
//
// Exits 0 with the list on stdout, and 1, with the usage on stderr, on an
// argument it does not take or a level other than L1, L2 and L3.

import { readFileSync } from 'node:fs';

export const CHECKLIST_USAGE = 'Usage: npx @opena2a/oasb checklist [--level L1|L2|L3] [--json]';

/** The directory a command names for the one that holds the agent's code and configuration. */
export const AGENT_DIR = './my-agent';

const WIDTH = 80;

/** The checklist: the standard, its levels and its controls. */
export function loadChecklist() {
  return JSON.parse(readFileSync(new URL('./oasb-1-checklist.json', import.meta.url), 'utf8'));
}

/** The IDs of the level `level` and of the levels below it, lowest first. */
export function levelsUpTo(checklist, level) {
  const ids = checklist.levels.map((l) => l.id);
  return ids.slice(0, ids.indexOf(level) + 1);
}

/** "A", "A and B", "A, B and C", or with `or` in place of "and". */
function series(items, or = false) {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} ${or ? 'or' : 'and'} ${items.at(-1)}`;
}

/**
 * The command that prints the control from HackMyAgent's JSON report of a
 * run at the control's level, or null when HackMyAgent maps no check to it.
 */
export function commandFor(control) {
  if (control.checks.length === 0) return null;
  return (
    `npx hackmyagent secure ${AGENT_DIR} -b oasb-1 -l ${control.level} --format json ` +
    `| jq '.categories[].controls[] | select(.controlId == "${control.id}")'`
  );
}

/** What the Command line of a control says before its command, or in place of one. */
export function commandNote(control) {
  if (control.checks.length === 0) {
    return 'none. HackMyAgent maps no check to this control and reports it as unverified; a person confirms it with the steps above.';
  }
  const checks = series(control.checks);
  if (control.verification === 'automated') return `HackMyAgent checks this control with ${checks}:`;
  return `HackMyAgent checks this control with ${checks}, which can fail it but not pass it; a person confirms it with the steps above:`;
}

/**
 * The checklist of the level `level`: the standard, the levels up to it and
 * their controls, level by level, each with its command (null when it has
 * none).
 */
export function checklistAt(checklist, level) {
  const levels = levelsUpTo(checklist, level);
  return {
    standard: checklist.standard,
    title: checklist.title,
    version: checklist.version,
    spec: checklist.spec,
    source: checklist.source,
    levels: checklist.levels.filter((l) => levels.includes(l.id)),
    controls: levels.flatMap((id) =>
      checklist.controls.filter((c) => c.level === id).map((c) => ({ ...c, command: commandFor(c) })),
    ),
  };
}

/**
 * `text` as lines of at most WIDTH characters, broken at spaces outside a
 * `code span`, so that a command stays on one line: the first starts with
 * `first`, the others with `rest`. A word longer than a line gets a line of
 * its own.
 */
function wrap(text, first, rest) {
  const lines = [];
  let line = first;
  let start = true;
  for (const word of text.match(/(?:`[^`]*`|[^ `])+/g)) {
    if (!start && line.length + 1 + word.length > WIDTH) {
      lines.push(line);
      line = rest + word;
    } else {
      line += start ? word : ` ${word}`;
    }
    start = false;
  }
  lines.push(line);
  return lines;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The heading of a level and its controls: "L1 Essential: 26 controls". */
export function levelHeading(level, controls) {
  return `${level.id} ${level.name}: ${plural(controls.filter((c) => c.level === level.id).length, 'control')}`;
}

/** The checklist `list` (from checklistAt) as the text the command prints. */
export function checklistText(list) {
  const ids = list.levels.map((l) => l.id);
  const lines = [
    `OASB-1 checklist: ${plural(list.controls.length, 'control')} of ${list.standard} ${list.version}, ` +
      `${ids.length === 1 ? 'level' : 'levels'} ${series(ids)}`,
    `Specification: ${list.spec}`,
    ...wrap(
      'The command of a control prints it from the JSON report of a HackMyAgent run at its level, with its ' +
        'status: passed, failed, not-applicable, or unverified when no check produced a result for it. ' +
        `Replace ${AGENT_DIR} with the directory that holds the agent's code and configuration. ` +
        'The command needs Node.js and jq.',
      '',
      '',
    ),
  ];
  for (const level of list.levels) {
    lines.push('', levelHeading(level, list.controls));
    for (const c of list.controls.filter((x) => x.level === level.id)) {
      lines.push(
        '',
        `${c.id} ${c.name}`,
        ...wrap(`Category: ${c.category}. Verification: ${c.verification}.`, '    ', '      '),
        ...wrap(c.requirement, '    Requirement: ', '      '),
        ...wrap(c.question, '    Ask the vendor: ', '      '),
        '    How to verify:',
        ...c.steps.flatMap((step, i) => wrap(step, `      ${i + 1}. `, '         ')),
        ...wrap(commandNote(c), '    Command: ', '      '),
      );
      if (c.command) lines.push(`      ${c.command}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

/** The text --help prints. */
export function checklistHelp() {
  return [
    CHECKLIST_USAGE,
    '',
    'Prints the OASB-1 checklist: the controls of OASB-1 by level, each with its',
    'requirement, a question to ask the vendor of an agent, the steps that verify',
    'it and the HackMyAgent command that checks it, where HackMyAgent maps a check',
    'to it. docs/oasb-1-checklist.md in this package is the same checklist.',
    '',
    '  --level L1|L2|L3  the controls a HackMyAgent run at that level checks: those',
    '                    of the level and of the levels below it. Without it, every',
    '                    control.',
    '  --json            the list as JSON',
    '',
  ].join('\n');
}

/**
 * Runs the checklist command with `args` (those after "checklist") and
 * returns its exit code. Writes to the process's stdout and stderr.
 */
export function main(args) {
  const checklist = loadChecklist();
  const ids = checklist.levels.map((l) => l.id);
  let level = ids.at(-1);
  let json = false;
  const refuse = (why) => {
    process.stderr.write(`oasb checklist: ${why}\n${CHECKLIST_USAGE}\n`);
    return 1;
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(checklistHelp());
      return 0;
    }
    if (arg === '--json') {
      json = true;
    } else if (arg === '--level' || arg.startsWith('--level=')) {
      const value = arg === '--level' ? args[++i] : arg.slice('--level='.length);
      const id = ids.find((x) => x === String(value ?? '').toUpperCase());
      if (!id) return refuse(`--level takes ${series(ids, true)}, not ${value === undefined ? 'nothing' : `"${value}"`}`);
      level = id;
    } else {
      return refuse(`"${arg}" is not an argument of the checklist command`);
    }
  }
  const list = checklistAt(checklist, level);
  process.stdout.write(json ? `${JSON.stringify(list, null, 2)}\n` : checklistText(list));
  return 0;
}
