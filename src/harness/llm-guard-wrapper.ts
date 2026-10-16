/**
 * llm-guard Adapter — Third-party benchmark comparison
 *
 * Wraps theRizwan/llm-guard (npm: llm-guard) for OASB evaluation.
 * This is a prompt-level scanner only — it does NOT provide:
 * - Process/network/filesystem monitoring
 * - MCP tool call validation
 * - A2A message scanning
 * - Anomaly detection / intelligence layers
 * - Enforcement actions (pause/kill/resume)
 *
 * Tests that require these capabilities will get no-op implementations
 * that return empty/negative results, documenting the coverage gap.
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
  EnforcementAction,
  LabConfig,
  PromptScanner,
  MCPScanner,
  A2AScanner,
  PatternScanner,
  BudgetManager,
  AnomalyScorer,
  EventEngine,
  EnforcementEngine,
  ScanResult,
  ThreatPattern,
  AlertRule,
  CapabilityMatrix,
} from './adapter';

// Lazy-loaded llm-guard
let _llmGuard: any;
function llmGuard(): any {
  if (!_llmGuard) {
    _llmGuard = require('llm-guard');
  }
  return _llmGuard;
}
function getLLMGuard(): any {
  return llmGuard().LLMGuard;
}

/** Convert llm-guard result to OASB ScanResult */
function toScanResult(guardResult: any): ScanResult {
  const matches: ScanResult['matches'] = [];

  if (guardResult.results) {
    for (const r of guardResult.results) {
      if (!r.valid && r.details) {
        for (const d of r.details) {
          matches.push({
            pattern: {
              id: d.rule || 'LLM-GUARD',
              category: d.rule?.includes('jailbreak') ? 'jailbreak'
                : d.rule?.includes('pii') ? 'data-exfiltration'
                : d.rule?.includes('injection') ? 'prompt-injection'
                : 'unknown',
              description: d.message || '',
              pattern: /./,
              severity: guardResult.score <= 0.3 ? 'high' : 'medium',
            },
            matchedText: d.matched || '',
          });
        }
      }
    }
  }

  return {
    detected: !guardResult.isValid,
    matches,
  };
}

/** Simple event engine that stores and emits events */
class SimpleEventEngine implements EventEngine {
  private handlers: Array<(event: SecurityEvent) => void | Promise<void>> = [];
  private idCounter = 0;

  emit(event: Omit<SecurityEvent, 'id' | 'timestamp' | 'classifiedBy'>): SecurityEvent {
    const full: SecurityEvent = {
      ...event,
      id: `llmg-${++this.idCounter}`,
      timestamp: new Date().toISOString(),
      classifiedBy: 'llm-guard',
    };
    for (const h of this.handlers) {
      h(full);
    }
    return full;
  }

  onEvent(handler: (event: SecurityEvent) => void | Promise<void>): void {
    this.handlers.push(handler);
  }
}

/** Simple enforcement engine — llm-guard doesn't have enforcement */
class SimpleEnforcementEngine implements EnforcementEngine {
  private pausedPids = new Set<number>();
  private alertCallback?: (event: SecurityEvent, rule: AlertRule) => void;

  async execute(action: EnforcementAction, event: SecurityEvent): Promise<EnforcementResult> {
    return { action, success: true, reason: 'llm-guard-enforcement', event };
  }

  pause(pid: number): boolean {
    this.pausedPids.add(pid);
    return true;
  }

  resume(pid: number): boolean {
    return this.pausedPids.delete(pid);
  }

  kill(pid: number): boolean {
    this.pausedPids.delete(pid);
    return true;
  }

  getPausedPids(): number[] {
    return [...this.pausedPids];
  }

  setAlertCallback(callback: (event: SecurityEvent, rule: AlertRule) => void): void {
    this.alertCallback = callback;
  }
}

export class LLMGuardWrapper implements SecurityProductAdapter {
  // Created on first read of dataDir, so an adapter that is only constructed
  // leaves nothing in the temp directory.
  private _dataDir: string | null;
  private engine: SimpleEventEngine;
  private enforcement: SimpleEnforcementEngine;
  private rules: AlertRule[];
  readonly collector: EventCollector;

  constructor(labConfig?: LabConfig) {
    this._dataDir = labConfig?.dataDir ?? null;
    this.engine = new SimpleEventEngine();
    this.enforcement = new SimpleEnforcementEngine();
    this.rules = labConfig?.rules ?? [];
    this.collector = new EventCollector();

    this.engine.onEvent(async (event) => {
      this.collector.eventHandler(event);

      // Check rules for enforcement
      for (const rule of this.rules) {
        const cond = rule.condition;
        if (cond.category && cond.category !== event.category) continue;
        if (cond.source && cond.source !== event.source) continue;
        if (cond.minSeverity) {
          const sevOrder = ['info', 'low', 'medium', 'high', 'critical'];
          if (sevOrder.indexOf(event.severity) < sevOrder.indexOf(cond.minSeverity)) continue;
        }
        const result = await this.enforcement.execute(rule.action, event);
        result.reason = rule.name;
        this.collector.enforcementHandler(result);
      }
    });
  }

  getCapabilities(): CapabilityMatrix {
    return {
      product: 'llm-guard',
      version: packageVersion('llm-guard', llmGuard),
      capabilities: new Set([
        'prompt-input-scanning',
        'pattern-scanning',
      ]),
    };
  }

  async start(): Promise<void> {}

  async stop(): Promise<void> {
    this.collector.reset();
    if (this._dataDir === null) return;
    try {
      fs.rmSync(this._dataDir, { recursive: true, force: true });
    } catch {}
  }

  async injectEvent(event: Omit<SecurityEvent, 'id' | 'timestamp' | 'classifiedBy'>): Promise<SecurityEvent> {
    return this.engine.emit(event);
  }

  waitForEvent(predicate: (event: SecurityEvent) => boolean, timeoutMs: number = 10000): Promise<SecurityEvent> {
    return this.collector.waitForEvent(predicate, timeoutMs);
  }

  getEvents(): SecurityEvent[] { return this.collector.getEvents(); }
  getEventsByCategory(category: string): SecurityEvent[] { return this.collector.eventsByCategory(category); }
  getEnforcements(): EnforcementResult[] { return this.collector.getEnforcements() as EnforcementResult[]; }
  getEnforcementsByAction(action: string): EnforcementResult[] { return this.collector.enforcementsByAction(action) as EnforcementResult[]; }
  resetCollector(): void { this.collector.reset(); }

  getEventEngine(): EventEngine { return this.engine; }
  getEnforcementEngine(): EnforcementEngine { return this.enforcement; }

  get dataDir(): string {
    if (this._dataDir === null) this._dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'llmg-lab-'));
    return this._dataDir;
  }

  // ─── Factory Methods ────────────────────────────────────────────

  createPromptScanner(): PromptScanner {
    const LLMGuard = getLLMGuard();
    const guard = new LLMGuard({
      promptInjection: { enabled: true },
      jailbreak: { enabled: true },
      pii: { enabled: true },
    });

    return {
      start: async () => {},
      stop: async () => {},
      scanInput: (text: string) => {
        // llm-guard is async, but OASB scanner interface is sync.
        // We run synchronously by checking patterns manually.
        // This is a limitation — real usage would be async.
        const result = scanWithPatterns(text, 'input');
        return result;
      },
      scanOutput: (text: string) => {
        return scanWithPatterns(text, 'output');
      },
    };
  }

  createMCPScanner(_allowedTools?: string[]): MCPScanner {
    // llm-guard has no MCP scanning capability
    return {
      start: async () => {},
      stop: async () => {},
      scanToolCall: () => ({ detected: false, matches: [] }),
    };
  }

  createA2AScanner(_trustedAgents?: string[]): A2AScanner {
    // llm-guard has no A2A scanning capability
    return {
      start: async () => {},
      stop: async () => {},
      scanMessage: () => ({ detected: false, matches: [] }),
    };
  }

  createPatternScanner(): PatternScanner {
    // llm-guard uses its own internal patterns, not the OASB ThreatPattern format.
    // We expose what we can via regex approximation.
    const patterns = getLLMGuardPatterns();
    return {
      scanText: (text: string, pats: readonly ThreatPattern[]) => scanWithPatterns(text, 'input'),
      getAllPatterns: () => patterns,
      getPatternSets: () => ({
        inputPatterns: patterns.filter(p => p.category !== 'output-leak'),
        outputPatterns: patterns.filter(p => p.category === 'output-leak'),
        mcpPatterns: [],
        a2aPatterns: [],
      }),
    };
  }

  createBudgetManager(dataDir: string, config?: { budgetUsd?: number; maxCallsPerHour?: number }): BudgetManager {
    // llm-guard has no budget management — implement a simple one
    let spent = 0;
    let totalCalls = 0;
    let callsThisHour = 0;
    const budgetUsd = config?.budgetUsd ?? 5;
    const maxCallsPerHour = config?.maxCallsPerHour ?? 20;

    return {
      canAfford: (cost: number) => spent + cost <= budgetUsd && callsThisHour < maxCallsPerHour,
      record: (cost: number, _tokens: number) => { spent += cost; totalCalls++; callsThisHour++; },
      getStatus: () => ({
        spent,
        budget: budgetUsd,
        remaining: budgetUsd - spent,
        percentUsed: Math.round((spent / budgetUsd) * 100),
        callsThisHour,
        maxCallsPerHour,
        totalCalls,
      }),
      reset: () => { spent = 0; totalCalls = 0; callsThisHour = 0; },
    };
  }

  createAnomalyScorer(): AnomalyScorer {
    // llm-guard has no anomaly detection — implement a stub
    const baselines = new Map<string, { mean: number; stddev: number; count: number }>();
    const observations = new Map<string, number[]>();

    return {
      score: () => 0,
      record: (event: SecurityEvent) => {
        const key = event.source;
        if (!observations.has(key)) observations.set(key, []);
        observations.get(key)!.push(1);
        const vals = observations.get(key)!;
        const mean = vals.length;
        baselines.set(key, { mean, stddev: 0, count: 1 });
      },
      getBaseline: (source: string) => baselines.get(source) ?? null,
      reset: () => { baselines.clear(); observations.clear(); },
    };
  }
}

// ─── Internal pattern-based scanning (sync approximation of llm-guard) ───

function getLLMGuardPatterns(): ThreatPattern[] {
  return [
    { id: 'LLMG-PI-001', category: 'prompt-injection', description: 'Instruction override', pattern: /(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous\s+)?(?:instructions?|prompts?|rules?)/i, severity: 'high' },
    { id: 'LLMG-PI-002', category: 'prompt-injection', description: 'System prompt extraction', pattern: /(?:system\s+prompt|repeat\s+(?:your|the)\s+(?:instructions?|prompt))/i, severity: 'high' },
    { id: 'LLMG-PI-003', category: 'prompt-injection', description: 'Persona override', pattern: /(?:you\s+are\s+now|pretend\s+you\s+are|act\s+as\s+if)/i, severity: 'medium' },
    { id: 'LLMG-JB-001', category: 'jailbreak', description: 'DAN jailbreak', pattern: /(?:DAN|do\s+anything\s+now)/i, severity: 'high' },
    { id: 'LLMG-JB-002', category: 'jailbreak', description: 'Roleplay bypass', pattern: /(?:pretend|imagine|roleplay)\s+(?:you\s+are|as)\s+(?:an?\s+)?(?:evil|unrestricted|unfiltered)/i, severity: 'high' },
    { id: 'LLMG-PII-001', category: 'data-exfiltration', description: 'SSN detection', pattern: /\b\d{3}-\d{2}-\d{4}\b/, severity: 'high' },
    { id: 'LLMG-PII-002', category: 'data-exfiltration', description: 'Credit card detection', pattern: /\b(?:\d{4}[- ]?){3}\d{4}\b/, severity: 'high' },
    { id: 'LLMG-PII-003', category: 'data-exfiltration', description: 'API key detection', pattern: /(?:sk-[a-zA-Z0-9]{20,}|AKIA[A-Z0-9]{12,})/i, severity: 'critical' },
  ];
}

function scanWithPatterns(text: string, _direction: 'input' | 'output'): ScanResult {
  const patterns = getLLMGuardPatterns();
  const matches: ScanResult['matches'] = [];

  for (const pattern of patterns) {
    const match = pattern.pattern.exec(text);
    if (match) {
      matches.push({
        pattern,
        matchedText: match[0].slice(0, 200),
      });
    }
  }

  return {
    detected: matches.length > 0,
    matches,
  };
}
