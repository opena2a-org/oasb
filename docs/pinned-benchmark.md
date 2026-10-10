# Pinned benchmark runs

A pinned run measures one hackmyagent release against the OASB v2 corpus and
every DVAA scenario. It uses only the inputs named in a pin file, refuses to
start when an input is unpinned or dirty, and writes a new results directory
whose run record names every input.

```bash
npx tsx scripts/run-pinned-benchmark.ts --pins pins.json --hma <hma dir> --dvaa <dvaa checkout>
```

## What is pinned

| Input | Pinned by | The run is refused when |
|---|---|---|
| hackmyagent | npm version and tarball integrity | the tarball is missing or its integrity differs from the pin; a file of the installed package was changed, removed or added |
| DVAA | full commit id | HEAD is another commit; the checkout has modified or untracked files; a file the scenario loader reads is not the committed file (this catches git-ignored files) |
| NanoMind models | manifest sha256 of `~/.nanomind/models` | a model file was added, removed or changed; the directory is missing or empty |
| OASB scoring code and corpus | the OASB commit | the checkout has uncommitted changes outside `results/`; `corpus/v2.json` is not tracked |

A version range, tag, branch name, short commit id or placeholder value in the
pin file is refused. Every check runs before anything is scanned. The
hackmyagent, DVAA and NanoMind checks run again after the scan, and a run
whose inputs changed while it scanned writes nothing.

## Prepare the inputs

hackmyagent: a directory holding the published tarball and an install made
from that tarball. The harness loads the installed package and compares every
file of it with the tarball.

```bash
mkdir hma-<version> && cd hma-<version>
npm pack hackmyagent@<version>              # writes hackmyagent-<version>.tgz
npm install ./hackmyagent-<version>.tgz     # writes node_modules/hackmyagent
```

DVAA: a clone of [damn-vulnerable-ai-agent](https://github.com/opena2a-org/damn-vulnerable-ai-agent)
checked out at the commit you will pin, with no local changes.

NanoMind: the harness reads `~/.nanomind/models`, where the scanner caches its
models. The models must be in place before the run.

## Write the pin file

`--observe` prints the pin values the inputs have now, and any reason a run
would refuse them. It scans nothing and writes nothing.

```bash
npx tsx scripts/run-pinned-benchmark.ts --observe --hma hma-<version> --dvaa <dvaa checkout> > pins.json
npm view hackmyagent@<version> dist.integrity   # must equal hackmyagent.integrity in pins.json
```

The pin file has this shape:

```json
{
  "hackmyagent": { "version": "<x.y.z>", "integrity": "sha512-<base64>" },
  "dvaa": { "commit": "<full commit id>" },
  "nanomind": { "manifestSha256": "<64 hex characters>" }
}
```

The NanoMind manifest is one `<sha256>  <path>` line per file in the model
directory (paths relative to it, sorted by byte order, `.DS_Store` left out), and
`manifestSha256` is the sha256 of that text. It changes when any byte of any
model file changes, not only when a version label does.

## What a run writes

Each run writes a new `results/<date>-<runid>/` directory. The directory is
created only if it does not exist, and each file is opened for exclusive
creation, so a run never writes over an earlier result.

| File | Content |
|---|---|
| `corpus-predictions.jsonl` | one line per corpus sample and adapter: sample id, label, category, source, artifact type, verdict, predicted category |
| `dvaa-predictions.jsonl` | one line per DVAA scenario: detected or not, attack findings, and the verdict for each vulnerable file |
| `summary.json` | detection over the malicious class per adapter and per category, the DVAA-sourced corpus samples, and the DVAA scenarios |
| `record.json` | the hackmyagent version, tarball integrity and tarball sha256, the dependency lockfile sha256, the DVAA commit, the NanoMind manifest sha256 and file list, the OASB commit and corpus sha256, and the Node.js version |

The corpus set is the categorized set: malicious samples without an attack
category are left out. The summary does not compute F1, precision,
false-positive rate or flag rate: most benign samples were labeled by the
scanner under test, so any metric that reads the benign class is circular.

A pinned run is a first measurement on recorded inputs. Earlier figures came
from unpinned runs on unrecorded inputs, so they are not a baseline for it,
and a difference from them is not a regression.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | the run wrote a new results directory (with `--observe`: no problem found) |
| 1 | unexpected failure |
| 2 | refused: an input is unpinned, does not match its pin or is dirty, or the results directory exists |
| 3 | an input changed during the run; no results were written |

## Development runners

`scripts/run-benchmark-v2.ts` and `scripts/run-dvaa-benchmark.ts` load the
sibling `hackmyagent` and `damn-vulnerable-ai-agent` checkouts, which are not
pinned, so their numbers are not figures of record. They run only with
`--unpinned`, print their results, and write a file only to a new path given
with `--out=<file>`.
