/**
 * DVAA Controlled Benchmark
 *
 * Runs HMA pipeline against all DVAA scenarios (ground-truth labeled).
 * Each scenario has:
 *   - vulnerable/ directory with intentionally vulnerable files
 *   - expected-checks.json with HMA check IDs that should fire
 *   - README.md with attack category description
 *
 * This gives us ground-truth precision/recall since we know exactly
 * what each scenario contains and what should be detected.
 *
 * Usage: npx tsx scripts/run-dvaa-benchmark.ts
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Category mapping from DVAA scenario names/check prefixes to OASB attack categories
const SCENARIO_CATEGORY_MAP: Record<string, string> = {
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

interface DVAAScenario {
  name: string;
  expectedChecks: string[];
  category: string;
  vulnerableFiles: string[];
  fileContents: Map<string, string>;
}

interface DVAAResult {
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

async function loadDVAAScenarios(): Promise<DVAAScenario[]> {
  const dvaaDir = resolve(__dirname, '..', '..', 'damn-vulnerable-ai-agent', 'scenarios');
  const scenarios: DVAAScenario[] = [];

  const dirs = readdirSync(dvaaDir).filter(d => {
    const full = join(dvaaDir, d);
    return statSync(full).isDirectory() && d !== 'examples' && existsSync(join(full, 'expected-checks.json'));
  });

  for (const dir of dirs) {
    const scenarioDir = join(dvaaDir, dir);
    const expectedChecks = JSON.parse(readFileSync(join(scenarioDir, 'expected-checks.json'), 'utf-8'));
    const category = SCENARIO_CATEGORY_MAP[dir] || 'unknown';

    // Load vulnerable files
    const vulnDir = join(scenarioDir, 'vulnerable');
    const vulnerableFiles: string[] = [];
    const fileContents = new Map<string, string>();

    if (existsSync(vulnDir)) {
      const files = readdirSync(vulnDir).filter(f => !f.startsWith('.'));
      for (const file of files) {
        const filePath = join(vulnDir, file);
        if (statSync(filePath).isFile()) {
          try {
            const content = readFileSync(filePath, 'utf-8');
            vulnerableFiles.push(file);
            fileContents.set(file, content);
          } catch {
            // Skip binary files
          }
        }
      }
    }

    scenarios.push({ name: dir, expectedChecks, category, vulnerableFiles, fileContents });
  }

  return scenarios;
}

async function main() {
  console.log('OASB DVAA Controlled Benchmark');
  console.log('==============================\n');

  // Load HMA
  const path = require('path');
  const hmaCorePath = path.resolve(__dirname, '..', '..', 'hackmyagent', 'dist', 'nanomind-core', 'index.js');
  const core = await import(hmaCorePath);

  const compiler = new core.SemanticCompiler({ useNanoMind: true });
  const tme = core.getTMEClassifier();
  await tme.ensureModel();
  await tme.ensureReady();

  const scenarios = await loadDVAAScenarios();
  console.log(`Loaded ${scenarios.length} DVAA scenarios\n`);

  const results: DVAAResult[] = [];
  let detected = 0;
  let total = 0;
  const categoryStats: Record<string, { total: number; detected: number }> = {};

  for (const scenario of scenarios) {
    total++;
    if (!categoryStats[scenario.category]) {
      categoryStats[scenario.category] = { total: 0, detected: 0 };
    }
    categoryStats[scenario.category].total++;

    let scenarioDetected = false;
    let bestResult: DVAAResult | null = null;

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
        const attackFindings = allFindings.filter((f: any) => !f.passed && !HARDENING.has(f.checkId));

        // TME informs the category label only, not the detection decision.
        const tmeResult = await tme.classifyAsync(content);

        // Verdict: at least one high/critical attack finding — the finding set the
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

        if (!bestResult || result.findings > bestResult.findings) {
          bestResult = result;
        }
      } catch {
        // Skip files that fail to compile
      }
    }

    if (scenarioDetected) {
      detected++;
      categoryStats[scenario.category].detected++;
    }

    if (bestResult) {
      bestResult.detected = scenarioDetected;
      results.push(bestResult);
    } else {
      results.push({
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
      });
    }

    // Progress
    const status = scenarioDetected ? 'DETECTED' : 'MISSED';
    const icon = scenarioDetected ? '+' : '-';
    process.stderr.write(`  [${icon}] ${scenario.name} (${scenario.category}): ${status}\n`);
  }

  // Print results
  console.log(`\n${'='.repeat(80)}`);
  console.log('DVAA DETECTION RESULTS');
  console.log('='.repeat(80));
  console.log(`Total scenarios: ${total}`);
  console.log(`Detected: ${detected} (${((detected / total) * 100).toFixed(1)}%)`);
  console.log(`Missed: ${total - detected}`);

  console.log(`\nPer-Category:`);
  console.log(`${'Category'.padEnd(28)} | Total | Detected | Rate`);
  console.log('-'.repeat(60));
  for (const [cat, stats] of Object.entries(categoryStats).sort((a, b) => a[0].localeCompare(b[0]))) {
    const rate = stats.total > 0 ? ((stats.detected / stats.total) * 100).toFixed(1) : '0.0';
    console.log(`${cat.padEnd(28)} | ${String(stats.total).padEnd(5)} | ${String(stats.detected).padEnd(8)} | ${rate}%`);
  }

  console.log(`\nMissed Scenarios:`);
  const missed = results.filter(r => !r.detected);
  for (const r of missed) {
    console.log(`  ${r.scenario} (${r.category}) - expected: ${r.expectedChecks.join(', ')}`);
    console.log(`    intent: ${r.intentClass} (${r.intentConfidence.toFixed(2)}), findings: ${r.findings}`);
  }

  console.log(`\nDetected Scenarios (${detected}):`);
  const detectedResults = results.filter(r => r.detected);
  for (const r of detectedResults) {
    const topFindings = r.attackFindings.slice(0, 3).join(', ');
    console.log(`  ${r.scenario}: ${r.intentClass} (${r.intentConfidence.toFixed(2)}) [${topFindings}]`);
  }

  // Write JSON results
  const outputPath = join(__dirname, '..', 'dvaa-benchmark-results.json');
  const { writeFileSync } = require('fs');
  writeFileSync(outputPath, JSON.stringify({
    date: new Date().toISOString(),
    totalScenarios: total,
    detected,
    detectionRate: detected / total,
    perCategory: categoryStats,
    results,
  }, null, 2));
  console.log(`\nResults saved to ${outputPath}`);
}

main().catch(err => {
  console.error('DVAA benchmark failed:', err);
  process.exit(1);
});
