#!/usr/bin/env node
// npx @opena2a/oasb <scenario ID>: runs one scenario file of the suite and
// prints its verdict. What it does is described in bin/run-scenario.mjs.
// npx @opena2a/oasb checklist: prints the OASB-1 checklist, as described in
// bin/checklist.mjs.

const args = process.argv.slice(2);

if (args[0] === 'checklist') {
  // A reader such as head that closes the pipe before the list ends is not
  // an error of the command.
  process.stdout.on('error', (err) => {
    if (err.code !== 'EPIPE') throw err;
  });
  const { main } = await import('./checklist.mjs');
  process.exitCode = main(args.slice(1));
} else {
  const { main } = await import('./run-scenario.mjs');
  process.exitCode = await main(args);
}
