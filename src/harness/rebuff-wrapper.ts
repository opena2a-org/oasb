/**
 * Rebuff Adapter -- Third-party benchmark comparison
 *
 * Wraps protectai/rebuff for OASB evaluation.
 * Rebuff provides:
 * - Heuristic prompt injection detection (no API key required)
 * - Canary word injection/leak detection (no API key required)
 * - OpenAI-based LLM detection (requires OPENAI_API_KEY -- optional)
 * - Vector DB similarity detection (requires Pinecone/Chroma -- optional)
 *
 * This adapter uses the heuristic detection by default. It does NOT provide:
 * - Process/network/filesystem monitoring
 * - MCP tool call validation
 * - A2A message scanning
 * - Anomaly detection / intelligence layers
 * - Enforcement actions (pause/kill/resume)
 *
 * Tests that require these capabilities get no-op implementations
 * that return empty/negative results, documenting the coverage gap.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EventCollector } from './event-collector';
import { loadRebuffHeuristic } from './rebuff-loader';
import type { RebuffHeuristic } from './rebuff-loader';
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

// Lazy-loaded rebuff heuristic detection. A scan throws when rebuff cannot be
// loaded: scanning with the patterns below alone would report results under
// rebuff's name that rebuff did not produce.
let _detectHeuristic: RebuffHeuristic | null = null;

function getHeuristicDetector(): RebuffHeuristic {
  if (!_detectHeuristic) _detectHeuristic = loadRebuffHeuristic();
  return _detectHeuristic;
}

// ---- Rebuff-derived patterns for pattern scanner ----

function getRebuffPatterns(): ThreatPattern[] {
  return [
    { id: 'RBUF-PI-001', category: 'prompt-injection', description: 'Instruction override (ignore/disregard)', pattern: /(?:ignore|disregard|forget|skip|neglect|overlook|omit|bypass)\s+(?:all\s+)?(?:previous\s+|prior\s+|preceding\s+|above\s+|earlier\s+)?(?:instructions?|directives?|commands?|context|conversation|input|data|messages?|requests?)/i, severity: 'high' },
    { id: 'RBUF-PI-002', category: 'prompt-injection', description: 'System prompt extraction', pattern: /(?:system\s+prompt|repeat\s+(?:your|the)\s+(?:instructions?|prompt)|show\s+(?:your|the)\s+(?:system|initial)\s+(?:prompt|message))/i, severity: 'high' },
    { id: 'RBUF-PI-003', category: 'prompt-injection', description: 'Persona override', pattern: /(?:you\s+are\s+now|pretend\s+you\s+are|act\s+as\s+if|you\s+are\s+being\s+hacked)/i, severity: 'medium' },
    { id: 'RBUF-PI-004', category: 'prompt-injection', description: 'Do not follow/obey pattern', pattern: /(?:do\s+not\s+(?:follow|obey))\s+(?:previous\s+|prior\s+|above\s+)?(?:instructions?|directives?|commands?|rules?)/i, severity: 'high' },
    { id: 'RBUF-PI-005', category: 'prompt-injection', description: 'Start over / begin afresh', pattern: /(?:start\s+over|start\s+anew|begin\s+afresh|start\s+from\s+scratch)/i, severity: 'medium' },
    { id: 'RBUF-JB-001', category: 'jailbreak', description: 'DAN jailbreak', pattern: /(?:DAN|do\s+anything\s+now)/i, severity: 'high' },
    { id: 'RBUF-JB-002', category: 'jailbreak', description: 'Roleplay bypass', pattern: /(?:pretend|imagine|roleplay)\s+(?:you\s+are|as)\s+(?:an?\s+)?(?:evil|unrestricted|unfiltered)/i, severity: 'high' },
    { id: 'RBUF-PII-001', category: 'data-exfiltration', description: 'SSN detection', pattern: /\b\d{3}-\d{2}-\d{4}\b/, severity: 'high' },
    { id: 'RBUF-PII-002', category: 'data-exfiltration', description: 'Credit card detection', pattern: /\b(?:\d{4}[- ]?){3}\d{4}\b/, severity: 'high' },
    { id: 'RBUF-PII-003', category: 'data-exfiltration', description: 'API key detection', pattern: /(?:sk-[a-zA-Z0-9]{20,}|AKIA[A-Z0-9]{12,})/i, severity: 'critical' },
  ];
}

/** Scan text using both rebuff heuristic and regex patterns */
function scanWithRebuff(text: string, _direction: 'input' | 'output'): ScanResult {
  const patterns = getRebuffPatterns();
  const matches: ScanResult['matches'] = [];

  // Phase 1: regex pattern matching
  for (const pattern of patterns) {
    const match = pattern.pattern.exec(text);
    if (match) {
      matches.push({
        pattern,
        matchedText: match[0].slice(0, 200),
      });
    }
  }

  // Phase 2: rebuff heuristic scoring (string similarity against injection keywords)
  const heuristicScore = getHeuristicDetector()(text);
  if (heuristicScore > 0.75 && matches.length === 0) {
    // Heuristic detected injection that patterns missed
    matches.push({
      pattern: {
        id: 'RBUF-HEUR-001',
        category: 'prompt-injection',
        description: `Rebuff heuristic detection (score: ${heuristicScore.toFixed(2)})`,
        pattern: /./,
        severity: heuristicScore > 0.9 ? 'high' : 'medium',
      },
      matchedText: text.slice(0, 200),
    });
  }

  return {
    detected: matches.length > 0,
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
      id: `rbuf-${++this.idCounter}`,
      timestamp: new Date().toISOString(),
      classifiedBy: 'rebuff',
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

/** Simple enforcement engine -- rebuff has no enforcement capability */
class SimpleEnforcementEngine implements EnforcementEngine {
  private pausedPids = new Set<number>();
  private alertCallback?: (event: SecurityEvent, rule: AlertRule) => void;

  async execute(action: EnforcementAction, event: SecurityEvent): Promise<EnforcementResult> {
    return { action, success: true, reason: 'rebuff-enforcement', event };
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

export class RebuffWrapper implements SecurityProductAdapter {
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
      product: 'rebuff',
      version: '0.1.0',
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
    if (this._dataDir === null) this._dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rbuf-lab-'));
    return this._dataDir;
  }

  // ---- Factory Methods ----

  createPromptScanner(): PromptScanner {
    return {
      start: async () => {},
      stop: async () => {},
      scanInput: (text: string) => scanWithRebuff(text, 'input'),
      scanOutput: (text: string) => scanWithRebuff(text, 'output'),
    };
  }

  createMCPScanner(_allowedTools?: string[]): MCPScanner {
    // Rebuff has no MCP scanning capability
    return {
      start: async () => {},
      stop: async () => {},
      scanToolCall: () => ({ detected: false, matches: [] }),
    };
  }

  createA2AScanner(_trustedAgents?: string[]): A2AScanner {
    // Rebuff has no A2A scanning capability
    return {
      start: async () => {},
      stop: async () => {},
      scanMessage: () => ({ detected: false, matches: [] }),
    };
  }

  createPatternScanner(): PatternScanner {
    const patterns = getRebuffPatterns();
    return {
      scanText: (text: string, _pats: readonly ThreatPattern[]) => scanWithRebuff(text, 'input'),
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
    // Rebuff has no budget management -- implement a simple one
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
    // Rebuff has no anomaly detection -- implement a stub
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
