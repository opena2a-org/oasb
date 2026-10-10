# Pinned benchmark runs

A pinned run measures one hackmyagent release against the OASB v2 corpus and
the DVAA scenarios (each directory under `scenarios/` that has an
`expected-checks.json`, except `examples`). Before it scans anything it checks
four inputs: the hackmyagent package, the DVAA checkout and the NanoMind model
directory against a pin file, and the OASB checkout against its own commit. It
refuses to start when one of them fails its check, and it writes a new results
directory whose run record names the versions and hashes it checked. It does
not verify everything the scanner reads; see
[What a run does not verify](#what-a-run-does-not-verify).

```bash
npx tsx scripts/run-pinned-benchmark.ts --pins pins.json --hma <hma dir> --dvaa <dvaa checkout>
```

## What is pinned

| Input | Pinned by | The run is refused when |
|---|---|---|
| hackmyagent | npm version and tarball integrity | the tarball is missing or its integrity differs from the pin; a file of the installed package was changed, removed or added |
| DVAA | full commit id | HEAD is another commit; the checkout has modified or untracked files; a file the scenario loader reads is not the committed file (this catches git-ignored files) |
| NanoMind models | manifest sha256 of `~/.nanomind/models` | a model file was added, removed or changed; the directory is missing or empty; the scanner's classifier reports a model or tokenizer file that is not a file of that directory |
| OASB scoring code and corpus | the OASB commit | the checkout has uncommitted changes outside `results/`; `corpus/v2.json` is not tracked |

A version range, tag, branch name, short commit id or placeholder value in the
pin file is refused. Every check runs before anything is scanned. After the
scan the hackmyagent check, the NanoMind check (the files the classifier
reports included) and the DVAA commit and status check run again, and a run
that fails one of them writes nothing. The OASB checkout and the per-file
DVAA comparison are not checked a second time.

## What a run does not verify

The checks cover the four inputs in the table above. They do not cover
everything the scanner reads:

- **The scanner's dependencies.** The packages npm installs for hackmyagent
  (the other directories under `node_modules` in the `--hma` directory, and a
  `node_modules` directory inside the installed package) are not compared
  with anything. The run records the sha256 of `package-lock.json` in the
  `--hma` directory when the file exists, and nothing else about them.
- **Other model sources of the scanner.** The NanoMind check covers the
  classifier that hackmyagent's `getTMEClassifier()` returns. In hackmyagent
  0.33.2 the scanner's compiler, which the full-pipeline adapter and the DVAA
  scan use, can take its intent result from two more places, and the harness
  checks neither. A second classifier loads `nanomind-tme.bin` and
  `tokenizer.json` from `~/.opena2a/nanomind/models` when both files exist.
  A NanoMind daemon at `http://127.0.0.1:47200` is asked when the
  classifier's confidence is 0.6 or lower. Before a run whose figures you
  will cite, make sure that directory holds no `nanomind-tme.bin` and that
  nothing is listening on that port.
- **The runtime.** The Node.js version, platform and architecture are
  recorded in `record.json`, not pinned.

## Prepare the inputs

hackmyagent: a directory holding the published tarball and an install made
from that tarball. The harness loads the installed package and compares it
with the tarball: each file in the tarball must be identical in the install,
and the install must hold no other file outside a `node_modules` directory.

```bash
mkdir hma-<version> && cd hma-<version>
npm pack hackmyagent@<version>              # writes hackmyagent-<version>.tgz
npm install ./hackmyagent-<version>.tgz     # writes node_modules/hackmyagent
```

DVAA: a clone of [damn-vulnerable-ai-agent](https://github.com/opena2a-org/damn-vulnerable-ai-agent)
checked out at the commit you will pin, with no local changes.

NanoMind: the harness verifies `~/.nanomind/models`, the directory hackmyagent
downloads its classifier model to. The models must be in place before the run.

The scanner does not load its classifier model from that directory alone. It
takes the first directory that holds a `tokenizer.json` from a list in which
`models/` under the working directory comes before `~/.nanomind/models`, and
loads the model beside it. The harness asks the classifier that hackmyagent's
`getTMEClassifier()` returns which model and tokenizer files it loads, and
refuses the run when either is not a file of `~/.nanomind/models`. Start the
run from a directory that has no `models/` directory.

## Write the pin file

`--observe` prints the pin values the inputs have now and the problems it
finds in the hackmyagent install, the DVAA checkout and the model directory.
It does not load the scanner, so it does not report which model files the
classifier would load. It scans nothing and writes nothing.

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
