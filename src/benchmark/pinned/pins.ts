/**
 * Pin file for the pinned benchmark harness.
 *
 * A pin file names the exact inputs a run may use:
 *
 *   {
 *     "hackmyagent": { "version": "<x.y.z>", "integrity": "sha512-<base64>" },
 *     "dvaa": { "commit": "<40 or 64 hex characters>" },
 *     "nanomind": { "manifestSha256": "<64 hex characters>" }
 *   }
 *
 * `hackmyagent.integrity` is the npm tarball integrity
 * (`npm view hackmyagent@<x.y.z> dist.integrity`). `dvaa.commit` is a full
 * commit id of the damn-vulnerable-ai-agent checkout. `nanomind.manifestSha256`
 * is the sha256 of the model directory manifest (see `nanomindManifest` in
 * inputs.ts). A missing field, a version range, a tag name, a short commit id
 * or a placeholder value is refused.
 */

import { readFileSync } from 'node:fs';

/** An input is unpinned, dirty or does not match its pin. Nothing was scanned. */
export class PinError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PinError';
  }
}

export interface HackmyagentPin {
  version: string;
  integrity: string;
}

export interface DvaaPin {
  commit: string;
}

export interface NanomindPin {
  manifestSha256: string;
}

export interface BenchmarkPins {
  hackmyagent: HackmyagentPin;
  dvaa: DvaaPin;
  nanomind: NanomindPin;
}

const EXACT_VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const SRI = /^(sha256|sha384|sha512)-[A-Za-z0-9+/]+={0,2}$/;
const SRI_LENGTH: Record<string, number> = { sha256: 32, sha384: 48, sha512: 64 };
const COMMIT = /^([0-9a-f]{40}|[0-9a-f]{64})$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

function field(obj: unknown, section: string, name: string): string {
  const sec = (obj as Record<string, unknown> | null)?.[section];
  const value = (sec as Record<string, unknown> | null | undefined)?.[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new PinError(`unpinned input: ${section}.${name} is missing from the pin file`);
  }
  return value;
}

export function parsePins(raw: unknown): BenchmarkPins {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new PinError('unpinned input: the pin file must be a JSON object');
  }

  const version = field(raw, 'hackmyagent', 'version');
  if (!EXACT_VERSION.test(version)) {
    throw new PinError(
      `unpinned input: hackmyagent.version "${version}" is not an exact version (x.y.z); ranges and tags are refused`,
    );
  }
  const integrity = field(raw, 'hackmyagent', 'integrity');
  const sri = SRI.exec(integrity);
  if (!sri || Buffer.from(integrity.slice(sri[1].length + 1), 'base64').length !== SRI_LENGTH[sri[1]]) {
    throw new PinError(
      `unpinned input: hackmyagent.integrity "${integrity}" is not a tarball integrity (sha512-<base64>)`,
    );
  }

  const commit = field(raw, 'dvaa', 'commit');
  if (!COMMIT.test(commit)) {
    throw new PinError(
      `unpinned input: dvaa.commit "${commit}" is not a full commit id; branch names and short ids are refused`,
    );
  }

  const manifestSha256 = field(raw, 'nanomind', 'manifestSha256');
  if (!SHA256_HEX.test(manifestSha256)) {
    throw new PinError(
      `unpinned input: nanomind.manifestSha256 "${manifestSha256}" is not a sha256 (64 lowercase hex characters)`,
    );
  }

  return {
    hackmyagent: { version, integrity },
    dvaa: { commit },
    nanomind: { manifestSha256 },
  };
}

export function loadPins(path: string): BenchmarkPins {
  let text: string;
  try {
    text = readFileSync(path, 'utf-8');
  } catch (err) {
    throw new PinError(`unpinned input: cannot read the pin file (${(err as NodeJS.ErrnoException).code ?? err})`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new PinError('unpinned input: the pin file is not valid JSON');
  }
  return parsePins(raw);
}
