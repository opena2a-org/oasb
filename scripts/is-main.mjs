// Whether node was started with a script.
//
// The scripts that import isMain run their command when node is started
// with them, and only export their functions when another file imports
// them.
//
// By default node loads the file it is started with at its real path, each
// symbolic link on the way resolved, and import.meta.url of that module
// names that path; process.argv[1] keeps the path node was started by, made
// absolute.
// Through a symbolic link, such as /tmp on macOS, a link to /private/tmp,
// the two differ. Under --preserve-symlinks-main, node keeps the link in
// import.meta.url as well. isMain compares the two once each is resolved to
// its real path, so a script runs started by its own path, through a link
// to a directory above it or to the file itself, and through a link to a
// directory above it under --preserve-symlinks-main.
// scripts/is-main.test.mjs starts each script that imports isMain in these
// ways.

import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The real path of `path`; `path` made absolute when it does not resolve. */
function realPath(path) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

/**
 * True when argv[1], the path node was started with, names the file of the
 * module whose URL is `url`, once each path is resolved to its real path.
 * False when argv holds no such path, as under `node -e`.
 */
export function isMain(url, argv = process.argv) {
  const started = argv[1];
  if (!started) return false;
  return realPath(started) === realPath(fileURLToPath(url));
}
