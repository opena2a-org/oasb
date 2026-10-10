# Pinned benchmark runs

A pinned run measures one hackmyagent release against the OASB v2 corpus and
the DVAA scenarios (each directory under `scenarios/` that has an
`expected-checks.json`, except `examples`). Before it scans anything it checks
four inputs: the hackmyagent package, the DVAA checkout and the NanoMind model
directory against a pin file, and the OASB checkout against its own commit. It
refuses to start when one of them fails its check, or when the scanner could
take results from a model source the pin file does not cover, and it writes a
new results directory whose run record names the versions and hashes it
checked. It does not verify everything the scanner reads; see
[What a run does not verify](#what-a-run-does-not-verify).

```bash
npx tsx scripts/run-pinned-benchmark.ts --pins ../pins.json --hma ../hma-<version> --dvaa <dvaa checkout>
```

The pin file and the hackmyagent directory belong outside the OASB checkout
(here, in its parent directory): a run is refused while the checkout has
uncommitted or untracked files, and a pin file written inside it is one.

## What is pinned

| Input | Pinned by | The run is refused when |
|---|---|---|
| hackmyagent | npm version and tarball integrity | the tarball is missing or its integrity differs from the pin; a file of the installed package was changed, removed or added |
| DVAA | full commit id | HEAD is another commit; the checkout has modified or untracked files; a file the scenario loader reads is not the committed file (this catches git-ignored files); the commit has no `scenarios/` directory or an `expected-checks.json` that is not valid JSON |
| NanoMind models | manifest sha256 of `~/.nanomind/models` | a model file was added, removed or changed; the directory is missing or empty; the scanner's classifier reports a model or tokenizer file that is not a file of that directory; the classifier model does not load, so the scanner would score every sample with its word list; the classifier has no `load`, `ensureReady`, `classify` or `onnxSession` member, so the harness cannot tell whether the model or the word list scores a sample (exit 2); after the scan, the classifier's model session is not the one it loaded when the run started, or the classifier no longer reports its model ready (exit 3, nothing written) |
| OASB scoring code and corpus | the OASB commit | the checkout has uncommitted changes outside `results/`; `corpus/v2.json` is not tracked, or the bytes read from it are not the committed file; a tracked file is marked skip-worktree or assume-unchanged, which hides a change from `git status` |
| Other model sources of the scanner | not pinned, so they must be absent | `~/.opena2a/nanomind/models`, or `node_modules/nanomind/training/models-tme-v3`, `models-tme-v2` or `models-tme` in the `--hma` directory, holds both `nanomind-tme.bin` and `tokenizer.json`; anything accepts a connection at `127.0.0.1:47200` before or after the scan, or answers a request the scanner sends there during the scan |

The last row covers two sources the scanner's compiler can take its intent
result from, besides the classifier that the NanoMind check covers. In
hackmyagent 0.33.2 the compiler, which the full-pipeline adapter and the DVAA
scan use, loads a second classifier from `nanomind-tme.bin` and
`tokenizer.json` when both files are in `~/.opena2a/nanomind/models` or in
one of the training directories of a `nanomind` package beside the installed
hackmyagent (`node_modules/nanomind/training/models-tme-v3`, `models-tme-v2`
and `models-tme` in the `--hma` directory), and asks a NanoMind daemon at
`http://127.0.0.1:47200` when the classifier's confidence is 0.6 or lower.
Move those files out of those directories and stop whatever listens on that
port before the run. `record.json` names the files and the address the run
checked.

A version range, tag, branch name, short commit id or placeholder value in the
pin file is refused. Every check runs before anything is scanned. After the
scan the hackmyagent check, the NanoMind check (the files the classifier
reports included), the DVAA commit and status check and the other model
sources check run again, and a run that fails one of them writes nothing. The
OASB checkout and the per-file DVAA comparison are not checked a second time.

The daemon address is checked again after the scan, but a daemon can come up
and go away while the run scans. The harness therefore watches every request
the scanner sends to the daemon address during the scan. A request that is not
refused (a response, or a connection that was accepted and then failed) means
a daemon was there, and the run writes nothing and exits 3.

## What scored each sample

A model file in the pinned directory does not show that the model produced
the verdicts. hackmyagent 0.33.2 scores a sample with a word list when its
classifier model did not load or an inference failed, and sends a sample its
classifier is unsure about to the daemon address. The harness loads the
classifier model before the first sample and refuses the run when it does not
load. During the scan it counts, for each sample:

| Field | Counts |
|---|---|
| `modelInferences` | classifier inferences that ran the model and returned |
| `wordListScorings` | classifier scorings that used the word list instead of the model |
| `neuralInferences` | inferences of the neural classifier tier |
| `daemonRequests` | requests sent to the daemon address |
| `daemonAnswers` | requests something at the daemon address answered; 0 in every written run |

A sample with `wordListScorings` above 0 had at least one verdict input that
did not come from the model. The full pipeline adapter compiles each sample
once, and the compiler runs the classifier unless the neural classifier tier
already decided; a DVAA scenario counts every file compiled plus the
classifier call that labels each file's category. The counts come from the
loaded release: the harness wraps the classifier's model
session and word-list scorer, the neural classifier class, and the global
`fetch` the compiler sends daemon requests with, for the duration of the run.
The wrappers pass every call and result through unchanged. In hackmyagent
0.33.2 the neural classifier tier is the second classifier above, and it looks
for its model only in the directories that check covers, so a written run on
that release has `neuralInferences` 0.

## What a run does not verify

The checks cover the inputs in the table above. They do not cover everything
the scanner reads:

- **The scanner's dependencies.** The packages npm installs for hackmyagent
  (the other directories under `node_modules` in the `--hma` directory, and a
  `node_modules` directory inside the installed package) are not compared
  with anything. The run records the sha256 of `package-lock.json` in the
  `--hma` directory when the file exists, and nothing else about them. npm
  writes the name of the `--hma` directory into the top-level `name` field of
  that file, so the sha256 also depends on the directory name: the same
  tarball installed in a directory with another name gives another value.
  The steps below name it `hma-<version>`. The
  one check among them is the second classifier check above, which looks in
  three directories of `node_modules/nanomind`.
- **The runtime.** The Node.js version, platform and architecture are
  recorded in `record.json`, not pinned.

## Prepare the inputs

hackmyagent: a directory outside the OASB checkout holding the published
tarball and an install made from that tarball. The harness loads the installed
package and compares it with the tarball: each file in the tarball must be
identical in the install, and the install must hold no other file outside a
`node_modules` directory.

```bash
cd ..                                       # from the OASB checkout to its parent
mkdir hma-<version> && cd hma-<version>
npm pack hackmyagent@<version>              # writes hackmyagent-<version>.tgz
npm install ./hackmyagent-<version>.tgz     # writes node_modules/hackmyagent
```

DVAA: a clone of [damn-vulnerable-ai-agent](https://github.com/opena2a-org/damn-vulnerable-ai-agent)
checked out at the commit you will pin, with no local changes.

NanoMind: the harness verifies `~/.nanomind/models`, the directory hackmyagent
downloads its classifier model to. The models must be in place before the run.
The classifier model runs on `onnxruntime-node`, which the hackmyagent install
brings in; a run is refused when the model does not load.

The scanner does not load its classifier model from that directory alone. It
takes the first directory that holds a `tokenizer.json` from a list in which
`models/` under the working directory comes before `~/.nanomind/models`, and
loads the model beside it. The harness asks the classifier that hackmyagent's
`getTMEClassifier()` returns which model and tokenizer files it loads, and
refuses the run when either is not a file of `~/.nanomind/models`. Start the
run from a directory that has no `models/` directory.

## Write the pin file

`--observe` prints the pin values the inputs have now and the problems it
finds in the hackmyagent install, the DVAA checkout, the model directory and
the scanner's other model sources. It does not load the scanner, so it does
not report which model files the classifier would load. It scans nothing and
writes nothing. Run it from the OASB checkout and write its output to a file
outside the checkout:

```bash
npx tsx scripts/run-pinned-benchmark.ts --observe --hma ../hma-<version> --dvaa <dvaa checkout> > ../pins.json
npm view hackmyagent@<version> dist.integrity   # must equal hackmyagent.integrity in ../pins.json
```

To keep the pin file in the checkout instead, commit it before the run.

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
| `corpus-predictions.jsonl` | one line per corpus sample and adapter: sample id, label, category, source, artifact type, verdict, predicted category, and what scored it (`nanomind`) |
| `dvaa-predictions.jsonl` | one line per DVAA scenario: detected or not, attack findings, the verdict for each vulnerable file, and what scored it (`nanomind`) |
| `summary.json` | detection over the malicious class per adapter and per category, the DVAA-sourced corpus samples, the DVAA scenarios, and what scored the samples per adapter and for DVAA (`nanomindUse`). The adapters that use NanoMind name the model by the `version` in `nanomind-version.json` of the verified model directory, or, when the directory has no version, by its manifest sha256 |
| `record.json` | the hackmyagent version, tarball integrity and tarball sha256, the dependency lockfile sha256, the DVAA commit, the NanoMind manifest sha256 and file list, the OASB commit and corpus sha256, the other model sources checked, what scored samples over the whole run (`nanomindUse`), and the Node.js version |

The record schema is `oasb-pinned-run/v2`. A `oasb-pinned-run/v1` run, such as
`results/2026-10-10-d8306ef8/`, does not record what scored its samples.

The corpus set is the categorized set: malicious samples without an attack
category are left out. The summary does not compute F1, precision,
false-positive rate or flag rate: most benign samples were labeled by the
scanner under test, so any metric that reads the benign class is circular.

A pinned run is a first measurement on recorded inputs. Earlier figures came
from unpinned runs on unrecorded inputs, so they are not a baseline for it,
and a difference from them is not a regression.

## Runs of record

A run directory committed under `results/` is a run of record.
`src/benchmark/pinned/runs-of-record.test.ts` checks each one: the directory
holds the four files a run writes, the record names the hackmyagent version,
tarball integrity and tarball sha256, the DVAA commit and the NanoMind
manifest sha256, the manifest sha256 is the hash of the file list in the
record, the record names the other model sources the run checked before and
after the scan, every sample was scanned once by every adapter, and every
count in `summary.json` is the one the two predictions files give. In a
checkout with full history (not a shallow clone) it checks that the record's
`oasb.commit` is an ancestor of `HEAD`. For a v2 run it also checks that the `nanomindUse` counts in the summary and the record
are the sums of the prediction lines, and that no daemon answered.

To repeat a run, check out OASB at the record's `oasb.commit`, write a pin
file from its `hackmyagent.version`, `hackmyagent.integrity`, `dvaa.commit`
and `nanomind.manifestSha256`, and prepare the inputs as above. The record
lists the sha256 of each model file, so model files fetched again can be
checked before the run.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | the run wrote a new results directory (with `--observe`: no problem found) |
| 1 | unexpected failure |
| 2 | refused: an input is unpinned, does not match its pin or is dirty, or the results directory exists. This includes a scanner whose classifier has no `load`, `ensureReady`, `classify` or `onnxSession` member: the harness cannot tell whether the model or the word list scores a sample |
| 3 | an input changed during the run, or a daemon answered a request during the scan; no results were written. This includes a classifier whose model session after the scan is not the one it loaded when the run started, or that no longer reports its model ready |

## Development runners

`scripts/run-benchmark-v2.ts` and `scripts/run-dvaa-benchmark.ts` load the
sibling `hackmyagent` and `damn-vulnerable-ai-agent` checkouts, which are not
pinned, so their numbers are not figures of record. They run only with
`--unpinned`, print their results, and write a file only to a new path given
with `--out=<file>`.
