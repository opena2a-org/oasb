/**
 * DVAA controlled benchmark suite.
 *
 * Runs the HMA pipeline against every DVAA scenario (ground-truth labeled).
 * Each scenario has:
 *   - vulnerable/ directory with intentionally vulnerable files
 *   - expected-checks.json with HMA check IDs that should fire
 *   - README.md with attack category description
 *
 * Shared by scripts/run-dvaa-benchmark.ts and the pinned harness
 * (src/benchmark/pinned/), so both apply one verdict rule.
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Category mapping from DVAA scenario names/check prefixes to OASB attack categories
export const SCENARIO_CATEGORY_MAP: Record<string, string> = {
  // Injection scenarios
  'clipboard-prompt-injection': 'prompt_injection',
  'indirect-prompt-injection-doc': 'prompt_injection',
  'xml-injection-tool-response': 'prompt_injection',
  'multimodal-injection-image': 'prompt_injection',
  'token-smuggling-unicode': 'prompt_injection',
  'encoding-bypass-base64': 'prompt_injection',
  'codeinj-exec-template': 'heartbeat_rce',

  // Exfiltration scenarios
  'dns-exfil-via-tools': 'data_exfiltration',
  'tool-chain-exfiltration': 'data_exfiltration',
  'training-data-extraction': 'data_exfiltration',
  'model-weight-extraction': 'data_exfiltration',
  'behavioral-drift-to-exfil': 'data_exfiltration',

  // Credential scenarios
  'agent-cred-no-protection': 'credential_exfiltration',
  'envleak-process-env': 'credential_exfiltration',
  'query-param-token': 'credential_exfiltration',
  'clipass-token-in-args': 'credential_exfiltration',
  'oauth-token-relay': 'credential_exfiltration',
  'webcred-api-key': 'credential_exfiltration',
  'prompt-leak-finetune-api': 'credential_exfiltration',
  'webexpose-env-file': 'credential_exfiltration',

  // Supply chain scenarios
  'dependency-confusion-attack': 'supply_chain',
  'install-curl-pipe-sh': 'supply_chain',
  'mcp-rug-pull': 'supply_chain',
  'typosquatting-mcp': 'supply_chain',
  'pickle-deserialization': 'supply_chain',
  'plugin-extension-confusion': 'supply_chain',
  'docker-provenance-disabled': 'supply_chain',
  'skill-backdoor-install': 'supply_chain',
  'supply-chain-to-rce': 'supply_chain',
  'finetune-backdoor': 'supply_chain',
  'federated-learning-poisoning': 'supply_chain',
  'stego-binary-asset': 'supply_chain',
  'cicd-ai-review-bypass': 'supply_chain',
  'integrity-digest-bypass': 'supply_chain',

  // Persistence scenarios
  'memory-poison-no-sanitize': 'persistence',
  'cross-session-persistence': 'persistence',
  'context-cache-poisoning': 'persistence',

  // Privilege escalation scenarios
  'delegation-privilege-escalation': 'privilege_escalation',
  'soul-override-via-skill': 'privilege_escalation',
  'reward-model-hacking': 'privilege_escalation',

  // Social engineering scenarios
  'agent-impersonation-a2a': 'social_engineering',
  'rag-poison-to-impersonation': 'social_engineering',
  'atc-forgery-attack': 'social_engineering',
  'consensus-manipulation': 'social_engineering',

  // Heartbeat/RCE scenarios
  'docker-exec-interpolation': 'heartbeat_rce',
  'prompt-to-lateral-movement': 'heartbeat_rce',

  // Unicode steganography
  'unicode-stego-package': 'unicode_stego',

  // Infrastructure/auth (mapped to closest category)
  'a2a-agent-noauth': 'privilege_escalation',
  'a2a-worm-propagation': 'persistence',
  'timing-unsafe-auth': 'credential_exfiltration',
  'timing-side-channel-inference': 'data_exfiltration',
  'toctou-verify-then-apply': 'supply_chain',
  'sandbox-telegram-allowed': 'privilege_escalation',
  'rate-limit-absent': 'privilege_escalation',
  'security-headers-missing': 'privilege_escalation',
  'websocket-preauth-flood': 'privilege_escalation',
  'mcp-discovery-exposed': 'privilege_escalation',
  'embedding-adversarial-rag': 'prompt_injection',

  // AI tool exposure
  'aitool-gradio-share': 'privilege_escalation',
  'aitool-jupyter-noauth': 'privilege_escalation',
  'aitool-langserve-exposed': 'privilege_escalation',
  'aitool-mlflow-noauth': 'privilege_escalation',
  'aitool-streamlit-public': 'privilege_escalation',
  'llm-exposed-ollama': 'privilege_escalation',
  'llm-openai-compat-noauth': 'privilege_escalation',
  'llm-textgen-listen': 'privilege_escalation',
  'llm-vllm-exposed': 'privilege_escalation',
  'gateway-exposed-openclaw': 'privilege_escalation',
  'webexpose-claude-md': 'data_exfiltration',
  'tmppath-hardcoded': 'privilege_escalation',
};

// Posture / hardening checks flag missing defenses or an over-permissive
// posture, not a present attack; they fire on benign and malicious alike, so
// they are excluded from the detection verdict (same set as the corpus
// full-pipeline adapter's HARDENING_CHECK_IDS, incl. AST-SCOPE-001 wildcard
// tool access). AST-SCOPE-003 stays a verdict driver.
const HARDENING = new Set([
  'AST-PROMPT-001', 'AST-PROMPT-003', 'AST-PROMPT-004',
  'AST-GOV-001', 'AST-GOV-002', 'AST-GOV-003', 'AST-GOV-004', 'AST-GOV-005',
  'AST-SCOPE-001',
]);

export interface DVAAScenario {
  name: string;
  expectedChecks: string[];
  category: string;
  vulnerableFiles: string[];
  fileContents: Map<string, string>;
}

/** A file the loader read, by its path inside the DVAA checkout. */
export interface DVAAReadFile {
  path: string;
  /** Git blob id of the bytes read, in the given object format. */
  blobId: string;
}

export interface DVAAResult {
  scenario: string;
  category: string;
  expectedChecks: string[];
  detected: boolean;
  detectedCategory: string | undefined;
  findings: number;
  intentClass: string;
  intentConfidence: number;
  scanTimeMs: number;
  attackFindings: string[];
}

/** The verdict for one vulnerable file of a scenario. */
export interface DVAAFilePrediction {
  file: string;
  detected: boolean;
  attackFindings: string[];
  /** Set when the file failed to compile and was skipped. */
  error?: string;
}

export interface DVAAScenarioOutcome {
  result: DVAAResult;
  files: DVAAFilePrediction[];
}

function gitBlobId(bytes: Buffer, objectFormat: 'sha1' | 'sha256'): string {
  return createHash(objectFormat)
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');
}

/**
 * Load every scenario under `<dvaaRoot>/scenarios`. Returns the scenarios and
 * the list of files read, each with the git blob id of the bytes read, so a
 * caller can prove every byte scanned is the committed byte.
 */
export function loadDVAAScenarios(
  dvaaRoot: string,
  objectFormat: 'sha1' | 'sha256' = 'sha1',
): { scenarios: DVAAScenario[]; readFiles: DVAAReadFile[] } {
  const dvaaDir = join(dvaaRoot, 'scenarios');
  const scenarios: DVAAScenario[] = [];
  const readFiles: DVAAReadFile[] = [];

  const dirs = readdirSync(dvaaDir).sort().filter(d => {
    const full = join(dvaaDir, d);
    return statSync(full).isDirectory() && d !== 'examples' && existsSync(join(full, 'expected-checks.json'));
  });

  for (const dir of dirs) {
    const scenarioDir = join(dvaaDir, dir);
    const expectedBytes = readFileSync(join(scenarioDir, 'expected-checks.json'));
    readFiles.push({ path: `scenarios/${dir}/expected-checks.json`, blobId: gitBlobId(expectedBytes, objectFormat) });
    const expectedChecks = JSON.parse(expectedBytes.toString('utf-8'));
    const category = SCENARIO_CATEGORY_MAP[dir] || 'unknown';

    // Load vulnerable files
    const vulnDir = join(scenarioDir, 'vulnerable');
    const vulnerableFiles: string[] = [];
    const fileContents = new Map<string, string>();

    if (existsSync(vulnDir)) {
      // Walk vulnerable/ recursively, mirroring what HMA reads on a real repo.
      // A top-level-only read missed scenarios whose payload lives in a
      // subdirectory (knowledge-base/, public/) or a dot-directory/dot-file
      // (.well-known/, .github/, .streamlit/, an exposed .env) - those were
      // scanned as nothing and scored as misses. Only true noise is skipped.
      const SKIP = new Set(['.git', '.DS_Store', 'node_modules']);
      const walk = (d: string, rel: string) => {
        for (const entry of readdirSync(d).sort()) {
          if (SKIP.has(entry)) continue;
          const filePath = join(d, entry);
          const relPath = rel ? `${rel}/${entry}` : entry;
          const st = statSync(filePath);
          if (st.isDirectory()) {
            walk(filePath, relPath);
          } else if (st.isFile()) {
            try {
              const bytes = readFileSync(filePath);
              const content = bytes.toString('utf-8');
              vulnerableFiles.push(relPath);
              fileContents.set(relPath, content);
              readFiles.push({
                path: `scenarios/${dir}/vulnerable/${relPath}`,
                blobId: gitBlobId(bytes, objectFormat),
              });
            } catch {
              // Skip unreadable files
            }
          }
        }
      };
      walk(vulnDir, '');
    }

    scenarios.push({ name: dir, expectedChecks, category, vulnerableFiles, fileContents });
  }

  return { scenarios, readFiles };
}

/**
 * Scan one scenario. The scenario is detected when any of its vulnerable files
 * produces at least one high/critical attack finding.
 */
export async function scanDVAAScenario(
  core: any,
  compiler: any,
  tme: any,
  scenario: DVAAScenario,
): Promise<DVAAScenarioOutcome> {
  let scenarioDetected = false;
  let bestResult: DVAAResult | null = null;
  const files: DVAAFilePrediction[] = [];

  // Scan each vulnerable file
  for (const [filename, content] of scenario.fileContents) {
    const startMs = Date.now();

    try {
      const { ast } = await compiler.compile(content, filename);

      // Run analyzers exactly as the corpus full-pipeline adapter does: pass the
      // raw content so content-based checks (AST-SCOPE-004 etc.) fire.
      const verifier = (a: any) => compiler.verifyAST(a);
      const allFindings = [
        ...core.analyzeCapabilities(ast),
        ...(core.analyzeCredentials ? core.analyzeCredentials(ast, verifier, undefined, content) : []),
        ...(core.analyzeGovernance ? core.analyzeGovernance(ast, verifier, undefined, undefined, content) : []),
        ...(core.analyzeScope ? core.analyzeScope(ast, verifier, undefined, content) : []),
        ...(core.analyzePrompt ? core.analyzePrompt(ast, verifier, undefined, content) : []),
        ...(core.analyzeCode ? core.analyzeCode(ast, verifier) : []),
      ];

      const attackFindings = allFindings.filter((f: any) => !f.passed && !HARDENING.has(f.checkId));

      // TME informs the category label only, not the detection decision.
      const tmeResult = await tme.classifyAsync(content);

      // Verdict: at least one high/critical attack finding, the finding set the
      // shipped scanner surfaces in red. Matches the corpus full-pipeline adapter.
      const highSeverityFindings = attackFindings.filter(
        (f: any) => f.severity === 'critical' || f.severity === 'high',
      );
      const isMalicious = highSeverityFindings.length > 0;

      if (isMalicious && !scenarioDetected) {
        scenarioDetected = true;
      }

      const result: DVAAResult = {
        scenario: scenario.name,
        category: scenario.category,
        expectedChecks: scenario.expectedChecks,
        detected: isMalicious,
        detectedCategory: tmeResult.attackClass !== 'none' ? tmeResult.attackClass : undefined,
        findings: attackFindings.length,
        intentClass: ast.intentClassification,
        intentConfidence: ast.intentConfidence,
        scanTimeMs: Date.now() - startMs,
        attackFindings: attackFindings.map((f: any) => `${f.checkId}:${f.attackClass || '-'}`),
      };
      files.push({ file: filename, detected: isMalicious, attackFindings: result.attackFindings });

      if (!bestResult || result.findings > bestResult.findings) {
        bestResult = result;
      }
    } catch (err) {
      // Skip files that fail to compile
      files.push({ file: filename, detected: false, attackFindings: [], error: (err as Error)?.message ?? String(err) });
    }
  }

  if (bestResult) {
    bestResult.detected = scenarioDetected;
    return { result: bestResult, files };
  }
  return {
    result: {
      scenario: scenario.name,
      category: scenario.category,
      expectedChecks: scenario.expectedChecks,
      detected: false,
      detectedCategory: undefined,
      findings: 0,
      intentClass: 'unknown',
      intentConfidence: 0,
      scanTimeMs: 0,
      attackFindings: [],
    },
    files,
  };
}
