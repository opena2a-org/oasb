#!/usr/bin/env node
// npx @opena2a/oasb <scenario ID>: runs one scenario file of the suite and
// prints its verdict. What it does is described in bin/run-scenario.mjs.

import { main } from './run-scenario.mjs';

process.exitCode = await main(process.argv.slice(2));
