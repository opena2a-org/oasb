/**
 * What scored each sample of a pinned run.
 *
 * The run record names the pinned NanoMind model, but hackmyagent can score a
 * sample without running it. Its classifier scores text with a word list when
 * the model did not load or an inference failed, and its compiler sends a
 * sample to a NanoMind daemon when the classifier is unsure of it. The daemon
 * address is checked before and after the scan, but a daemon can come up and
 * go away while the run is scanning.
 *
 * The trace loads the classifier model before the first sample and refuses the
 * run when it did not load. While the run scans, it counts for each sample the
 * classifier inferences that ran the model, the scorings that used the word
 * list, the neural classifier inferences, and the requests sent to the daemon
 * address and how many of them got an answer. A run in which the daemon
 * address answered is not written.
 *
 * The counts come from the loaded release: the classifier singleton's model
 * session and word-list scorer, the neural classifier class the compiler
 * constructs, and the global fetch the compiler sends daemon requests with.
 * Each is wrapped for the run and restored after it; the wrappers pass every
 * call and result through unchanged.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { PinError } from './pins.js';

/** Module of the neural classifier tier inside a hackmyagent package. */
export const NEURAL_CLASSIFIER_MODULE = join('dist', 'nanomind-core', 'inference', 'tme-neural.js');

export interface NanomindUse {
  /** Classifier inferences that ran the model and returned a result. */
  modelInferences: number;
  /** Classifier scorings that used the word list instead of the model. */
  wordListScorings: number;
  /** Inferences of the neural classifier tier. */
  neuralInferences: number;
  /** Requests sent to the daemon address. */
  daemonRequests: number;
  /**
   * Requests something at the daemon address answered: with a response, or by
   * accepting the connection before the request failed. Only a refused
   * connection is not an answer.
   */
  daemonAnswers: number;
}

export function noUse(): NanomindUse {
  return { modelInferences: 0, wordListScorings: 0, neuralInferences: 0, daemonRequests: 0, daemonAnswers: 0 };
}

export function addUse(into: NanomindUse, from: NanomindUse): NanomindUse {
  for (const key of Object.keys(into) as Array<keyof NanomindUse>) into[key] += from[key];
  return into;
}

export interface NanomindTraceOptions {
  /** hackmyagent version, for messages. */
  version: string;
  /** Installed hackmyagent package directory, verified against the tarball. */
  packageDir: string;
  /** The daemon address the other model sources check probes, as a URL. */
  daemonUrl: string | null;
}

/** Replace `target[key]` and return a function that puts the original back. */
function wrap(target: any, key: string, make: (original: (...args: any[]) => any) => (...args: any[]) => any): () => void {
  const own = Object.prototype.hasOwnProperty.call(target, key);
  const original = target[key];
  target[key] = make(original);
  return () => {
    if (own) target[key] = original;
    else delete target[key];
  };
}

/** True when a failed fetch failed because nothing accepted the connection. */
function connectionRefused(err: unknown): boolean {
  const cause = (err as { cause?: { code?: unknown; errors?: Array<{ code?: unknown }> } } | null)?.cause;
  const codes = Array.isArray(cause?.errors) ? cause!.errors.map(e => e?.code) : [cause?.code];
  return codes.length > 0 && codes.every(code => code === 'ECONNREFUSED');
}

function requestOrigin(input: unknown): string | null {
  try {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as { url?: unknown })?.url;
    return typeof href === 'string' ? new URL(href).origin : null;
  } catch {
    return null;
  }
}

export class NanomindTrace {
  private readonly store = new AsyncLocalStorage<NanomindUse>();
  private readonly total = noUse();
  private readonly restores: Array<() => void> = [];

  private constructor(
    private readonly opts: NanomindTraceOptions,
    private readonly tme: any,
    private readonly session: any,
  ) {}

  /**
   * Load the classifier model of the loaded hackmyagent core and start
   * counting. Refuses (PinError) when the model did not load, because every
   * sample would then be scored by the word list. Call it after the model
   * source check and before the first sample is scanned.
   */
  static async start(core: any, opts: NanomindTraceOptions): Promise<NanomindTrace> {
    const { version } = opts;
    const tme = typeof core?.getTMEClassifier === 'function' ? core.getTMEClassifier() : null;
    if (
      !tme ||
      typeof tme.load !== 'function' ||
      typeof tme.ensureReady !== 'function' ||
      typeof tme.classify !== 'function' ||
      !('onnxSession' in tme)
    ) {
      throw new PinError(
        `unpinned input: cannot tell whether hackmyagent ${version} scores samples with its NanoMind classifier ` +
          'model or with its word list, so a run cannot show that the pinned model scored them',
      );
    }
    const loaded = tme.load();
    await tme.ensureReady();
    const session = tme.onnxSession;
    if (!loaded || tme.onnxReady !== true || !session || typeof session.run !== 'function') {
      throw new PinError(
        `unpinned input: hackmyagent ${version} did not load the NanoMind classifier model in the pinned model ` +
          'directory, so it would score every sample with its word list instead; check that onnxruntime-node ' +
          'is installed with the release and that the model file is the one the release expects',
      );
    }

    const trace = new NanomindTrace(opts, tme, session);
    trace.instrument();
    return trace;
  }

  private instrument(): void {
    const count = (key: keyof NanomindUse) => this.count(key);

    // The model: the classifier's inference session. A rejected inference is
    // not counted here; the classifier then falls back to the word list.
    this.restores.push(
      wrap(this.session, 'run', original =>
        function (this: unknown, ...args: any[]) {
          return Promise.resolve(original.apply(this, args)).then(output => {
            count('modelInferences');
            return output;
          });
        },
      ),
    );

    // The word list: the classifier's synchronous scorer, which its async
    // path calls when the model is not ready or an inference failed.
    this.restores.push(
      wrap(this.tme, 'classify', original =>
        function (this: unknown, ...args: any[]) {
          count('wordListScorings');
          return original.apply(this, args);
        },
      ),
    );

    // The neural classifier tier: the compiler constructs one per sample and
    // runs it when it found a model. Loaded through require, as the compiler
    // loads it, so the class wrapped is the class the compiler constructs.
    const neuralModule = join(this.opts.packageDir, NEURAL_CLASSIFIER_MODULE);
    if (existsSync(neuralModule)) {
      const mod = createRequire(join(this.opts.packageDir, 'package.json'))(neuralModule);
      const proto = mod?.TMENeuralClassifier?.prototype;
      if (proto && typeof proto.classify === 'function') {
        this.restores.push(
          wrap(proto, 'classify', original =>
            function (this: unknown, ...args: any[]) {
              count('neuralInferences');
              return original.apply(this, args);
            },
          ),
        );
      }
    }

    // The daemon: the compiler sends a sample to it with the global fetch. A
    // request that was not refused found something listening at the address,
    // even when the connection then failed before a response arrived.
    if (this.opts.daemonUrl) {
      const daemonOrigin = requestOrigin(this.opts.daemonUrl);
      this.restores.push(
        wrap(globalThis, 'fetch', original =>
          async function (this: unknown, input: unknown, init?: unknown) {
            if (!daemonOrigin || requestOrigin(input) !== daemonOrigin) return original.call(this, input, init);
            count('daemonRequests');
            try {
              const response = await original.call(this, input, init);
              count('daemonAnswers');
              return response;
            } catch (err) {
              if (!connectionRefused(err)) count('daemonAnswers');
              throw err;
            }
          },
        ),
      );
    }
  }

  private count(key: keyof NanomindUse): void {
    this.total[key]++;
    const use = this.store.getStore();
    if (use) use[key]++;
  }

  /** Scan one sample and return what scored it. */
  async track<T>(scan: () => Promise<T>): Promise<{ result: T; use: NanomindUse }> {
    const use = noUse();
    const result = await this.store.run(use, scan);
    return { result, use };
  }

  /** Counts over the whole run, inside and outside tracked samples. */
  totals(): NanomindUse {
    return { ...this.total };
  }

  /**
   * Refuse (PinError) a run that cannot stand: the daemon address answered a
   * request while the run scanned, or the classifier no longer runs the model
   * session it loaded at the start.
   */
  check(): void {
    if (this.total.daemonAnswers > 0) {
      const { daemonAnswers: n, daemonRequests: sent } = this.total;
      throw new PinError(
        `unpinned input: a NanoMind daemon answered ${n} of ${sent} request${sent === 1 ? '' : 's'} at ` +
          `${this.opts.daemonUrl} while the run was scanning; hackmyagent ${this.opts.version} uses its results ` +
          'and its model is not pinned',
      );
    }
    if (this.tme.onnxSession !== this.session || this.tme.onnxReady !== true) {
      throw new PinError('the NanoMind classifier model the scanner runs is not the one it loaded when the run started');
    }
  }

  /** Put every wrapped function back. */
  stop(): void {
    while (this.restores.length > 0) this.restores.pop()!();
  }
}
