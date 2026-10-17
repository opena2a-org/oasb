/**
 * OASB Security Product Adapter Interface
 *
 * Implement this interface to evaluate your security product against OASB.
 * The reference implementation (ARP adapter) is in arp-wrapper.ts.
 *
 * @example
 *   // Vendor implements the adapter for their product:
 *   class MyProductAdapter implements SecurityProductAdapter { ... }
 *
 *   // OASB tests use the adapter, not your product directly:
 *   const adapter = createAdapter(); // returns configured adapter
 *   await adapter.start();
 *   await adapter.injectEvent({ ... });
 *   const threats = adapter.getEventsByCategory('threat');
 */

// ─── Core Event Types ───────────────────────────────────────────────

/**
 * 'anomaly' is the category arp-guard gives, for example, a connection to a
 * host outside its allowed hosts; the atomic and integration tests inject it
 * and write rules on it.
 */
export type EventCategory = 'normal' | 'activity' | 'anomaly' | 'threat' | 'violation';
export type EventSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type MonitorSource = 'process' | 'network' | 'filesystem' | 'prompt' | 'mcp-protocol' | 'a2a-protocol' | string;
export type EnforcementAction = 'log' | 'alert' | 'pause' | 'kill' | 'resume';

export interface SecurityEvent {
  id?: string;
  timestamp?: string;
  source: MonitorSource;
  category: EventCategory;
  severity: EventSeverity;
  description: string;
  data?: Record<string, unknown>;
  classifiedBy?: string;
}

/** Raw outbound connection facts; evaluator-held labels must never enter this path. */
export interface NetworkObservation {
  remoteAddr: string;
  remotePort: number;
  protocol: 'tcp' | 'udp';
  direction: 'outbound';
  pid?: number;
  category?: never;
  severity?: never;
}

/** Reject extra fields at runtime too, including labels supplied by JS callers. */
export function validateNetworkObservation(observation: NetworkObservation): void {
  const fields = new Set(['remoteAddr', 'remotePort', 'protocol', 'direction', 'pid']);
  if (!observation || typeof observation !== 'object'
    || Reflect.ownKeys(observation).some((key) => typeof key !== 'string' || !fields.has(key))
    || typeof observation.remoteAddr !== 'string' || observation.remoteAddr.length === 0
    || !Number.isInteger(observation.remotePort) || observation.remotePort < 1 || observation.remotePort > 65535
    || !['tcp', 'udp'].includes(observation.protocol) || observation.direction !== 'outbound'
    || (observation.pid !== undefined && (!Number.isInteger(observation.pid) || observation.pid < 0))) {
    throw new TypeError('NetworkObservation accepts only outbound connection facts, never classification labels');
  }
}

export interface EnforcementResult {
  action: EnforcementAction;
  success: boolean;
  reason: string;
  event: SecurityEvent;
  pid?: number;
  /** The process a pause or kill acted on; the reference adapter leaves it unset for log and alert */
  targetPid?: number;
}

export interface AlertRule {
  name: string;
  condition: AlertCondition;
  action: EnforcementAction;
  /**
   * Have the intelligence layer review the matched event. The reference
   * adapter does not wait for that review: it acts at once and marks the
   * event's data with _llmReviewRequested.
   */
  requireLlmConfirmation?: boolean;
}

export interface AlertCondition {
  source?: MonitorSource;
  category?: EventCategory;
  minSeverity?: EventSeverity;
  descriptionContains?: string;
  /**
   * Match only when at least `count` events (from `source`, when the
   * condition names one) arrived in the last `windowMs` milliseconds
   */
  threshold?: { count: number; windowMs: number };
}

// ─── Scanner Types ──────────────────────────────────────────────────

export interface ScanResult {
  detected: boolean;
  matches: ScanMatch[];
  truncated?: boolean;
}

export interface ScanMatch {
  pattern: ThreatPattern;
  matchedText: string;
}

export interface ThreatPattern {
  id: string;
  category: string;
  description: string;
  pattern: RegExp;
  severity: 'medium' | 'high' | 'critical';
}

// ─── Scanner Interfaces ─────────────────────────────────────────────

export interface PromptScanner {
  start(): Promise<void>;
  stop(): Promise<void>;
  scanInput(text: string): ScanResult;
  scanOutput(text: string): ScanResult;
}

export interface MCPScanner {
  start(): Promise<void>;
  stop(): Promise<void>;
  scanToolCall(toolName: string, params: Record<string, unknown>): ScanResult;
}

export interface A2AScanner {
  start(): Promise<void>;
  stop(): Promise<void>;
  scanMessage(from: string, to: string, content: string): ScanResult;
}

export interface PatternScanner {
  scanText(text: string, patterns: readonly ThreatPattern[]): ScanResult;
  getAllPatterns(): readonly ThreatPattern[];
  getPatternSets(): Record<string, readonly ThreatPattern[]>;
}

// ─── Intelligence Interfaces ────────────────────────────────────────

export interface BudgetStatus {
  spent: number;
  budget: number;
  remaining: number;
  percentUsed: number;
  callsThisHour: number;
  maxCallsPerHour: number;
  totalCalls: number;
}

export interface BudgetManager {
  canAfford(estimatedCostUsd: number): boolean;
  record(costUsd: number, tokens: number): void;
  getStatus(): BudgetStatus;
  reset(): void;
}

export interface AnomalyScorer {
  score(event: SecurityEvent): number;
  record(event: SecurityEvent): void;
  getBaseline(source: string): { mean: number; stddev: number; count: number } | null;
  reset(): void;
  /**
   * Write the learned baselines to dataDir, as the product does before it
   * stops. Required when the adapter declares 'baseline-persistence'.
   */
  save?(dataDir: string): void;
  /**
   * Replace this scorer's baselines with the ones saved in dataDir, as the
   * product does when it starts again with the same data directory.
   * Required when the adapter declares 'baseline-persistence'.
   */
  load?(dataDir: string): void;
}

// ─── LLM Adapter (for mock testing) ────────────────────────────────

export interface LLMAdapter {
  name: string;
  assess(prompt: string): Promise<LLMResponse>;
}

export interface LLMResponse {
  content: string;
  usage?: { inputTokens: number; outputTokens: number };
}

// ─── Event Engine Interface ─────────────────────────────────────────

export interface EventEngine {
  emit(event: Omit<SecurityEvent, 'id' | 'timestamp' | 'classifiedBy'>): SecurityEvent;
  onEvent(handler: (event: SecurityEvent) => void | Promise<void>): void;
}

// ─── Enforcement Interface ──────────────────────────────────────────

export interface EnforcementEngine {
  /** targetPid, when given, is the process to act on instead of the event's data.pid */
  execute(action: EnforcementAction, event: SecurityEvent, targetPid?: number): Promise<EnforcementResult>;
  pause(pid: number): boolean;
  resume(pid: number): boolean;
  kill(pid: number, signal?: string): boolean;
  getPausedPids(): number[];
  setAlertCallback(callback: (event: SecurityEvent, rule: AlertRule) => void): void;
}

// ─── Capability Declaration ─────────────────────────────────────────

/**
 * Capabilities that a security product may or may not support.
 * Adapters declare their capabilities via getCapabilities().
 * Tests check capabilities before running — unsupported tests are
 * marked N/A instead of FAIL, producing an honest scorecard.
 */
export type Capability =
  | 'process-monitoring'
  | 'network-monitoring'
  /** Raw observations reach the product classifier, not the labelled event engine. */
  | 'raw-network-observation'
  | 'filesystem-monitoring'
  | 'prompt-input-scanning'
  | 'prompt-output-scanning'
  | 'mcp-scanning'
  | 'a2a-scanning'
  | 'anomaly-detection'
  /** The anomaly scorer saves its baselines and loads them after a restart */
  | 'baseline-persistence'
  | 'budget-management'
  | 'enforcement-log'
  | 'enforcement-alert'
  | 'enforcement-pause'
  | 'enforcement-kill'
  | 'enforcement-resume'
  | 'pattern-scanning'
  | 'event-correlation';

/** Full capability declaration for a product */
export interface CapabilityMatrix {
  /** Product name */
  product: string;
  /** Product version */
  version: string;
  /** Set of supported capabilities */
  capabilities: Set<Capability>;
}

// ─── Main Adapter Interface ─────────────────────────────────────────

export interface SecurityProductAdapter {
  /** Declare which capabilities this product supports */
  getCapabilities(): CapabilityMatrix;

  /** Start the security product */
  start(): Promise<void>;
  /** Stop the security product */
  stop(): Promise<void>;

  /** Inject a synthetic event for testing */
  injectEvent(event: Omit<SecurityEvent, 'id' | 'timestamp' | 'classifiedBy'>): Promise<SecurityEvent>;

  /**
   * Optional component-level path for outbound connection facts. Required when
   * declaring raw-network-observation; resolves after resulting events are collected.
   * Must classify with the product, never forward a benchmark-supplied label.
   * Does not promise live OS/network acquisition. Reject unknown/label fields.
   */
  observeNetwork?(observation: NetworkObservation): Promise<void>;

  /** Wait for an event matching a predicate */
  waitForEvent(predicate: (event: SecurityEvent) => boolean, timeoutMs?: number): Promise<SecurityEvent>;

  /** Get collected events */
  getEvents(): SecurityEvent[];
  getEventsByCategory(category: EventCategory): SecurityEvent[];
  getEnforcements(): EnforcementResult[];
  getEnforcementsByAction(action: EnforcementAction): EnforcementResult[];

  /** Reset collected events */
  resetCollector(): void;

  /** Access sub-components (for tests that need direct access) */
  getEventEngine(): EventEngine;
  getEnforcementEngine(): EnforcementEngine;

  /** Factory methods for component-level testing */
  createPromptScanner(): PromptScanner;
  createMCPScanner(allowedTools?: string[]): MCPScanner;
  createA2AScanner(trustedAgents?: string[]): A2AScanner;
  createPatternScanner(): PatternScanner;
  createBudgetManager(dataDir: string, config?: { budgetUsd?: number; maxCallsPerHour?: number }): BudgetManager;
  createAnomalyScorer(): AnomalyScorer;
}

// ─── Lab Config ─────────────────────────────────────────────────────

export interface LabConfig {
  monitors?: {
    process?: boolean;
    network?: boolean;
    filesystem?: boolean;
  };
  rules?: AlertRule[];
  intelligence?: {
    enabled?: boolean;
  };
  dataDir?: string;
  filesystemWatchPaths?: string[];
  filesystemAllowedPaths?: string[];
  networkAllowedHosts?: string[];
  processIntervalMs?: number;
  networkIntervalMs?: number;
  interceptors?: {
    process?: boolean;
    network?: boolean;
    filesystem?: boolean;
  };
  interceptorNetworkAllowedHosts?: string[];
  interceptorFilesystemAllowedPaths?: string[];
}
