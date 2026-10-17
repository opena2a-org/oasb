/**
 * ARP Adapter — Reference implementation of SecurityProductAdapter
 *
 * Wraps HackMyAgent's ARP (Agent Runtime Protection) for OASB evaluation.
 * Other vendors implement their own adapter against the same interface.
 *
 * Uses lazy require() for arp-guard so the module is only loaded when
 * this adapter is actually selected. Tests that use a different adapter
 * never trigger the arp-guard import.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EventCollector } from './event-collector';
import { packageVersion } from './package-version';
import type {
  SecurityProductAdapter,
  SecurityEvent,
  EnforcementResult,
  LabConfig,
  PromptScanner,
  MCPScanner,
  A2AScanner,
  PatternScanner,
  BudgetManager,
  AnomalyScorer,
  EventEngine,
  EnforcementEngine as EnforcementEngineInterface,
  ScanResult,
  ThreatPattern,
  CapabilityMatrix,
  Capability,
} from './adapter';

// arp-guard is an optional dependency, so an install that omits optional
// dependencies (`npm install @opena2a/oasb --omit=optional`) leaves it out.
// Name the package and the alternative instead of surfacing a bare "Cannot
// find module".
const ARP_GUARD_MISSING =
  'The default OASB adapter (OASB_ADAPTER unset or "arp") needs arp-guard, which is not installed. ' +
  'Run "npm install arp-guard", or set OASB_ADAPTER to select another adapter: "llm-guard", ' +
  '"rebuff" (each needs its own package) or the path of a module that exports your ' +
  'SecurityProductAdapter class.';

// Lazy-loaded arp-guard module
let _arp: any;
function arp(): any {
  if (!_arp) {
    try {
      _arp = require('arp-guard');
    } catch (err) {
      // Only arp-guard itself missing; a module arp-guard fails to load is
      // reported as it is.
      const e = err as NodeJS.ErrnoException;
      if (e.code === 'MODULE_NOT_FOUND' && e.message.startsWith("Cannot find module 'arp-guard'")) {
        throw new Error(ARP_GUARD_MISSING);
      }
      throw err;
    }
  }
  return _arp;
}

/**
 * True when the installed AnomalyDetector can save its baselines to a data
 * directory and load them back. arp-guard accepts any hackmyagent from
 * 0.11.0, so the installed version may predate these methods.
 */
function anomalyPersistenceSupported(): boolean {
  const { AnomalyDetector } = arp();
  return typeof AnomalyDetector?.load === 'function'
    && typeof AnomalyDetector.prototype?.save === 'function';
}

export class ArpWrapper implements SecurityProductAdapter {
  private _arpInstance: any = null;
  private _dataDir: string | null;
  private readonly _labConfig?: LabConfig;
  readonly collector: EventCollector;

  // The ARP instance and its data directory are created on first use, not
  // here: test files construct adapters at describe level, and collecting
  // them (vitest list, npm run check:readme) runs no hook that would stop
  // the adapter and remove the directory.
  constructor(labConfig?: LabConfig) {
    this._labConfig = labConfig;
    this._dataDir = labConfig?.dataDir ?? null;
    this.collector = new EventCollector();
  }

  private get arpInstance(): any {
    if (!this._arpInstance) this._arpInstance = this.createInstance();
    return this._arpInstance;
  }

  private createInstance(): any {
    const labConfig = this._labConfig;
    const { AgentRuntimeProtection } = arp();

    const config = {
      agentName: 'arp-lab-target',
      agentDescription: 'Test target for ARP security lab',
      declaredCapabilities: ['file read/write', 'HTTP requests'],
      dataDir: this.dataDir,
      monitors: {
        process: {
          enabled: labConfig?.monitors?.process ?? false,
          intervalMs: labConfig?.processIntervalMs,
        },
        network: {
          enabled: labConfig?.monitors?.network ?? false,
          intervalMs: labConfig?.networkIntervalMs,
          allowedHosts: labConfig?.networkAllowedHosts,
        },
        filesystem: {
          enabled: labConfig?.monitors?.filesystem ?? false,
          watchPaths: labConfig?.filesystemWatchPaths,
          allowedPaths: labConfig?.filesystemAllowedPaths,
        },
      },
      rules: labConfig?.rules,
      intelligence: {
        enabled: labConfig?.intelligence?.enabled ?? false,
        budgetUsd: 0,
      },
      interceptors: {
        process: { enabled: labConfig?.interceptors?.process ?? false },
        network: {
          enabled: labConfig?.interceptors?.network ?? false,
          allowedHosts: labConfig?.interceptorNetworkAllowedHosts,
        },
        filesystem: {
          enabled: labConfig?.interceptors?.filesystem ?? false,
          allowedPaths: labConfig?.interceptorFilesystemAllowedPaths,
        },
      },
    };

    const instance = new AgentRuntimeProtection(config);
    instance.onEvent(this.collector.eventHandler);
    instance.onEnforcement(this.collector.enforcementHandler);
    return instance;
  }

  getCapabilities(): CapabilityMatrix {
    const capabilities = new Set<Capability>([
      'process-monitoring',
      'network-monitoring',
      'filesystem-monitoring',
      'prompt-input-scanning',
      'prompt-output-scanning',
      'mcp-scanning',
      'a2a-scanning',
      'anomaly-detection',
      'budget-management',
      'enforcement-log',
      'enforcement-alert',
      'enforcement-pause',
      'enforcement-kill',
      'enforcement-resume',
      'pattern-scanning',
    ]);
    if (anomalyPersistenceSupported()) capabilities.add('baseline-persistence');
    return {
      product: 'arp-guard',
      version: packageVersion('arp-guard', arp),
      capabilities,
    };
  }

  async start(): Promise<void> {
    await this.arpInstance.start();
  }

  async stop(): Promise<void> {
    if (this._arpInstance) await this._arpInstance.stop();
    this.collector.reset();
    if (this._dataDir === null) return;
    try {
      fs.rmSync(this._dataDir, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  }

  async injectEvent(event: Omit<SecurityEvent, 'id' | 'timestamp' | 'classifiedBy'>): Promise<SecurityEvent> {
    return this.getEngine().emit(event);
  }

  waitForEvent(predicate: (event: SecurityEvent) => boolean, timeoutMs: number = 10000): Promise<SecurityEvent> {
    return this.collector.waitForEvent(predicate, timeoutMs);
  }

  getEvents(): SecurityEvent[] {
    return this.collector.getEvents();
  }

  getEventsByCategory(category: string): SecurityEvent[] {
    return this.collector.eventsByCategory(category);
  }

  getEnforcements(): EnforcementResult[] {
    return this.collector.getEnforcements() as EnforcementResult[];
  }

  getEnforcementsByAction(action: string): EnforcementResult[] {
    return this.collector.enforcementsByAction(action) as EnforcementResult[];
  }

  resetCollector(): void {
    this.collector.reset();
  }

  getInstance(): any {
    return this.arpInstance;
  }

  getEventEngine(): EventEngine {
    return this.arpInstance.getEngine() as unknown as EventEngine;
  }

  getEnforcementEngine(): EnforcementEngineInterface {
    return this.arpInstance.getEnforcement() as unknown as EnforcementEngineInterface;
  }

  getEngine(): any {
    return this.arpInstance.getEngine();
  }

  getEnforcement(): any {
    return this.arpInstance.getEnforcement();
  }

  get dataDir(): string {
    if (this._dataDir === null) this._dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arp-lab-'));
    return this._dataDir;
  }

  // ─── Factory Methods ────────────────────────────────────────────

  createPromptScanner(): PromptScanner {
    const { EventEngine, PromptInterceptor } = arp();
    const engine = new EventEngine({ agentName: 'oasb-prompt-test' });
    const interceptor = new PromptInterceptor(engine);
    return {
      start: () => interceptor.start(),
      stop: () => interceptor.stop(),
      scanInput: (text: string) => interceptor.scanInput(text),
      scanOutput: (text: string) => interceptor.scanOutput(text),
    };
  }

  createMCPScanner(allowedTools?: string[]): MCPScanner {
    const { EventEngine, MCPProtocolInterceptor } = arp();
    const engine = new EventEngine({ agentName: 'oasb-mcp-test' });
    const interceptor = new MCPProtocolInterceptor(engine, allowedTools);
    return {
      start: () => interceptor.start(),
      stop: () => interceptor.stop(),
      scanToolCall: (toolName: string, params: Record<string, unknown>) => interceptor.scanToolCall(toolName, params),
    };
  }

  createA2AScanner(trustedAgents?: string[]): A2AScanner {
    const { EventEngine, A2AProtocolInterceptor } = arp();
    const engine = new EventEngine({ agentName: 'oasb-a2a-test' });
    const interceptor = new A2AProtocolInterceptor(engine, trustedAgents);
    return {
      start: () => interceptor.start(),
      stop: () => interceptor.stop(),
      scanMessage: (from: string, to: string, content: string) => interceptor.scanMessage(from, to, content),
    };
  }

  createPatternScanner(): PatternScanner {
    const { scanText: _scanText, ALL_PATTERNS: _allPatterns, PATTERN_SETS: _patternSets } = arp();
    return {
      scanText: (text: string, patterns: readonly ThreatPattern[]) => _scanText(text, patterns) as ScanResult,
      getAllPatterns: () => _allPatterns as unknown as readonly ThreatPattern[],
      getPatternSets: () => _patternSets as unknown as Record<string, readonly ThreatPattern[]>,
    };
  }

  createBudgetManager(dataDir: string, config?: { budgetUsd?: number; maxCallsPerHour?: number }): BudgetManager {
    const { BudgetController } = arp();
    const controller = new BudgetController(dataDir, config);
    return {
      canAfford: (cost: number) => controller.canAfford(cost),
      record: (cost: number, tokens: number) => controller.record(cost, tokens),
      getStatus: () => controller.getStatus(),
      reset: () => controller.reset(),
    };
  }

  createAnomalyScorer(): AnomalyScorer {
    const { AnomalyDetector } = arp();
    let detector = new AnomalyDetector();
    const scorer: AnomalyScorer = {
      score: (event: SecurityEvent) => detector.score(event),
      record: (event: SecurityEvent) => detector.record(event),
      getBaseline: (source: string) => detector.getBaseline(source),
      reset: () => detector.reset(),
    };
    if (anomalyPersistenceSupported()) {
      scorer.save = (dataDir: string) => detector.save(dataDir);
      // AnomalyDetector.load returns a new detector holding the saved baselines
      scorer.load = (dataDir: string) => { detector = AnomalyDetector.load(dataDir); };
    }
    return scorer;
  }
}
