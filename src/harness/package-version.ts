/**
 * The version an adapter reports in its capability matrix: the `version`
 * field of the installed package's own package.json.
 *
 * A VERSION export can be a stale constant (arp-guard 0.3.0 exports a VERSION
 * that is not its package version), so it is read only when package.json
 * cannot be resolved, as behind an `exports` map that hides it, and the
 * reported version then says so.
 */

/**
 * Loads the package with `load` first, so a package that is not installed
 * fails with the loader's own error, then reads `<name>/package.json`.
 */
export function packageVersion(name: string, load: () => { VERSION?: unknown }): string {
  const mod = load();
  let pkg: { version?: unknown };
  try {
    pkg = require(`${name}/package.json`);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED' && code !== 'MODULE_NOT_FOUND') throw err;
    if (typeof mod?.VERSION === 'string') return `${mod.VERSION} (VERSION export; package.json not resolvable)`;
    return 'unknown (no VERSION export; package.json not resolvable)';
  }
  return typeof pkg.version === 'string' ? pkg.version : `unknown (${name}/package.json has no version)`;
}
