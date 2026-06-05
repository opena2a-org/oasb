/**
 * HMA Pipeline Adapter for OASB Benchmark v2
 *
 * Uses the REAL HackMyAgent NanoMind pipeline:
 *   1. SemanticCompiler (AST compilation + TME inference), compiling each sample under a
 *      filename that triggers the SAME artifact-type classification the shipped scanner would
 *      assign — an agent_config compiled as a `.skill.md` hides the structural scope/capability
 *      findings, which is the routing bug that produced the rejected 82.1% run.
 *   2. All 6 analyzers, invoked the way the shipped `runNanoMindScan` invokes them: each analyzer
 *      receives the raw artifact content so the content-based scope/credential/governance checks
 *      (e.g. AST-SCOPE-004 adversarial-config directives) actually fire.
 *   3. Verdict = the artifact produced at least one high/critical ATTACK finding. This mirrors the
 *      finding set the shipped `hackmyagent secure` surfaces in red. "Hardening" findings — missing
 *      defenses rather than present attacks — are excluded, because they fire equally on benign and
 *      malicious artifacts and so carry no detection signal: AST-PROMPT-001/003/004 (jailbreak /
 *      injection-resistance / trust-hierarchy gaps) and AST-GOV-001..005 (missing governance,
 *      oversight, scope limits, override resistance, governance/capability ratio). The raw TME intent
 *      label informs category only, not the malicious/benign decision (it over-flags benign artifacts).
 *
 * Re-run all three adapters together (static / tme-only / pipeline) so the leaderboard is
 * internally consistent and stamped with the real loaded build. The tme-only tier is a model-only
 * ablation, not a scanner verdict; the current classifier under-performs on this corpus (whitespace
 * vocab OOV), pending a code/text-aware classifier. The pipeline gates that signal behind severity.
 *
 * Three adapter tiers:
 *   - HMATMEOnlyAdapter: Just the ONNX TME classifier (raw model accuracy)
 *   - HMAPipelineAdapter: Full AST + analyzers (production pipeline)
 *   - HMAPipelineStaticAdapter: Static regex patterns only (no NanoMind)
 */

import type { ScannerAdapter } from './runner.js';
import type { ScannerResult, AttackCategory } from './types.js';

// Lazy-loaded HMA modules
let SemanticCompiler: any;
let analyzeCapabilities: any;
let analyzeCredentials: any;
let analyzeGovernance: any;
let analyzeScope: any;
let analyzePrompt: any;
let analyzeCode: any;
let getTMEClassifier: any;

let hmaLoaded = false;

// Version hygiene: read the REAL loaded build and model versions so the leaderboard is honestly
// tagged. These were previously hardcoded ("0.12.9" / "0.5.0") and drifted from the actual build.
// The HMA build version comes from the sibling hackmyagent package.json (the dist we load from);
// the classifier version comes from the cached model manifest every user installs.
let _hmaBuildVersion: string | null = null;
let _tmeModelVersion: string | null = null;

function hmaBuildVersion(): string {
  if (_hmaBuildVersion) return _hmaBuildVersion;
  try {
    const path = require('path');
    const fs = require('fs');
    const pkgPath = path.resolve(__dirname, '..', '..', '..', 'hackmyagent', 'package.json');
    _hmaBuildVersion = String(JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).version || 'unknown');
  } catch {
    _hmaBuildVersion = 'unknown';
  }
  return _hmaBuildVersion;
}

function tmeModelVersion(): string {
  if (_tmeModelVersion) return _tmeModelVersion;
  try {
    const path = require('path');
    const fs = require('fs');
    const os = require('os');
    const verPath = path.join(os.homedir(), '.nanomind', 'models', 'nanomind-version.json');
    _tmeModelVersion = String(JSON.parse(fs.readFileSync(verPath, 'utf-8')).version || 'unknown');
  } catch {
    _tmeModelVersion = 'unknown';
  }
  return _tmeModelVersion;
}

async function loadHMACore(): Promise<boolean> {
  if (hmaLoaded) return true;
  try {
    const path = require('path');
    const corePath = path.resolve(__dirname, '..', '..', '..', 'hackmyagent', 'dist', 'nanomind-core', 'index.js');
    const core = await import(corePath);
    SemanticCompiler = core.SemanticCompiler;
    analyzeCapabilities = core.analyzeCapabilities;
    analyzeCredentials = core.analyzeCredentials;
    analyzeGovernance = core.analyzeGovernance;
    analyzeScope = core.analyzeScope;
    analyzePrompt = core.analyzePrompt;
    analyzeCode = core.analyzeCode;
    getTMEClassifier = core.getTMEClassifier;
    hmaLoaded = true;
    return true;
  } catch (err) {
    console.error('Failed to load HMA core:', (err as Error).message);
    return false;
  }
}

/**
 * Map a corpus artifactType to a filename whose basename/extension triggers the
 * matching signature in the shipped artifact-type classifier (artifact-parser
 * `TYPE_SIGNATURES`). This is how the benchmark dispatches "by artifact type":
 * the classifier keys on the path, so we hand it the path a real artifact of
 * that kind would have. Content-based fallbacks (mcpServers object, capabilities
 * frontmatter) still apply exactly as they do in production, so a soul file that
 * happens to carry capabilities frontmatter classifies as the scanner would
 * classify it in the wild.
 */
function routeFilename(sampleId: string, artifactType?: string): string {
  switch (artifactType) {
    case 'mcp_tool':
      return `${sampleId}/mcp.json`;        // basename mcp.json -> mcp_config
    case 'soul':
      return `${sampleId}/SOUL.md`;         // path contains SOUL.MD -> soul
    case 'system_prompt':
      return `${sampleId}.system-prompt.md`; // path contains system-prompt -> system_prompt
    case 'agent_config':
      return `${sampleId}.agent-config.json`; // path contains agent-config -> agent_config
    case 'skill':
    default:
      return `${sampleId}.skill.md`;        // .skill.md suffix -> skill
  }
}

// Posture / hardening checks: findings that flag a MISSING defense or an
// over-permissive POSTURE rather than a present attack. They fire on benign and
// malicious artifacts alike, so they carry no malicious-INTENT signal and must
// not drive the binary malicious/benign verdict. The scanner still emits all of
// these to users (with severity and a fix) — this set governs the BENCHMARK
// verdict only, not the product's findings.
//
// - AST-GOV-001..005: missing governance / oversight / scope / override
//   resistance. Every governance-light system_prompt trips AST-GOV-004; it has
//   no discriminative power for malice.
// - AST-SCOPE-001 (wildcard tool access): a least-privilege posture issue. Over
//   2,900 benign registry MCP servers declare allowedTools:["*"]; a signal that
//   fires on thousands of benign configs cannot distinguish malicious intent.
//   Malicious configs are caught by the adversarial directives they layer on top
//   (AST-SCOPE-004: escalation / control-bypass / harvest), not by the wildcard.
//
// AST-SCOPE-003 (scope-purpose mismatch) is deliberately NOT excluded: it is a
// genuine trojan-detection signal that catches real privilege-escalation and
// supply-chain attacks (excluding it collapses those categories' recall from
// ~63%/47% to ~37%/33% for a marginal aggregate-F1 gain). It stays a verdict
// driver despite some false positives.
const HARDENING_CHECK_IDS = new Set([
  'AST-PROMPT-001', // Jailbreak susceptibility (missing defense)
  'AST-PROMPT-003', // Missing injection resistance
  'AST-PROMPT-004', // No trust hierarchy
  'AST-GOV-001',    // Missing governance constraints
  'AST-GOV-002',    // No human oversight
  'AST-GOV-003',    // Missing scope limitation
  'AST-GOV-004',    // No override resistance
  'AST-GOV-005',    // Governance-capability imbalance
  'AST-SCOPE-001',  // Wildcard tool access (least-privilege posture, not malice)
]);

// Attack class mapping: HMA taxonomy -> OASB benchmark categories
const ATTACK_CLASS_MAP: Record<string, AttackCategory> = {
  // TME classifier classes
  exfiltration: 'data_exfiltration',
  injection: 'prompt_injection',
  privilege_escalation: 'privilege_escalation',
  persistence: 'persistence',
  credential_abuse: 'credential_exfiltration',
  lateral_movement: 'heartbeat_rce',
  social_engineering: 'social_engineering',
  // AST risk surface / finding classes
  'CRED-HARVEST': 'credential_exfiltration',
  'CRED-EXFIL': 'credential_exfiltration',
  'CRED-EXPOSURE': 'credential_exfiltration',
  'CRED-HARDCODED': 'credential_exfiltration',
  'SKILL-EXFIL': 'data_exfiltration',
  'DATA-EXFIL': 'data_exfiltration',
  'PROMPT-INJECT': 'prompt_injection',
  'JAILBREAK': 'prompt_injection',
  'AUTHORITY-CONFUSION': 'prompt_injection',
  'HEARTBEAT-RCE': 'heartbeat_rce',
  'PRIV-ESCALATION': 'privilege_escalation',
  'PERSIST': 'persistence',
  'SOCIAL-ENG': 'social_engineering',
  'SUPPLY-CHAIN': 'supply_chain',
  'SCAN-EVASION': 'supply_chain',
  'CODE-INJECT': 'heartbeat_rce',
  'UNICODE-STEGO': 'unicode_stego',
};

function mapToCategory(attackClass?: string): AttackCategory | undefined {
  if (!attackClass) return undefined;
  // Direct match
  if (ATTACK_CLASS_MAP[attackClass]) return ATTACK_CLASS_MAP[attackClass];
  // Normalized match
  const normalized = attackClass.toLowerCase().replace(/-/g, '_');
  if (ATTACK_CLASS_MAP[normalized]) return ATTACK_CLASS_MAP[normalized];
  // Prefix match
  for (const [key, cat] of Object.entries(ATTACK_CLASS_MAP)) {
    if (attackClass.toUpperCase().startsWith(key)) return cat;
  }
  return undefined;
}

/**
 * Disambiguate between credential_exfiltration and data_exfiltration
 * based on content signals.
 */
function disambiguateExfil(content: string, defaultCat: AttackCategory): AttackCategory {
  if (defaultCat !== 'credential_exfiltration' && defaultCat !== 'data_exfiltration') return defaultCat;
  const text = content.toLowerCase();
  const credSignals = (text.match(/api.?key|token|password|credential|secret|sk-ant|akia|ghp_/gi) || []).length;
  const dataSignals = (text.match(/select|database|table|record|customer|payment|pii|financial|medical|dump/gi) || []).length;
  if (dataSignals > credSignals) return 'data_exfiltration';
  return 'credential_exfiltration';
}

// ============================================================================
// TME-Only Adapter (raw ONNX model, no analyzers)
// ============================================================================

export class HMATMEOnlyAdapter implements ScannerAdapter {
  name = `NanoMind TME v${tmeModelVersion()} (model only)`;
  version = tmeModelVersion();
  id = 'hma-tme-only';

  private tme: any = null;
  private ready = false;

  async scan(content: string, sampleId: string): Promise<ScannerResult> {
    if (!await loadHMACore()) return { sampleId, verdict: 'unknown' };

    if (!this.tme) {
      this.tme = getTMEClassifier();
      await this.tme.ensureModel();
      await this.tme.ensureReady();
      this.ready = true;
    }

    try {
      const result = await this.tme.classifyAsync(content);

      // Check for unicode steganography
      if (/[\u200B\u200C\u200D\u2060\u2062\u00AD\uFEFF]/.test(content)) {
        return {
          sampleId,
          verdict: 'malicious',
          category: 'unicode_stego',
          confidence: 0.95,
        };
      }

      // TME verdict: malicious if intentClass is malicious OR
      // if top class is an attack class with confidence > 0.5
      if (result.intentClass === 'malicious') {
        const category = mapToCategory(result.attackClass);
        return {
          sampleId,
          verdict: 'malicious',
          category: category ? disambiguateExfil(content, category) : undefined,
          confidence: result.confidence,
        };
      }

      return { sampleId, verdict: 'benign', confidence: result.confidence };
    } catch {
      return { sampleId, verdict: 'unknown' };
    }
  }
}

// ============================================================================
// Full Pipeline Adapter (SemanticCompiler + all analyzers)
// ============================================================================

export class HMAPipelineAdapter implements ScannerAdapter {
  name = `HMA Full Pipeline (AST + NanoMind v${tmeModelVersion()})`;
  version = hmaBuildVersion();
  id = 'hma-pipeline';

  private compiler: any = null;

  async scan(content: string, sampleId: string, artifactType?: string): Promise<ScannerResult> {
    if (!await loadHMACore()) return { sampleId, verdict: 'unknown' };

    if (!this.compiler) {
      this.compiler = new SemanticCompiler({ useNanoMind: true });
    }

    try {
      const startMs = Date.now();
      // Route by artifact type so the compiler classifies the sample the way the
      // shipped scanner would, instead of forcing every sample to `skill`.
      const { ast } = await this.compiler.compile(content, routeFilename(sampleId, artifactType));
      const compileMs = Date.now() - startMs;

      // Check unicode steganography first (zero-width chars)
      if (/[\u200B\u200C\u200D\u2060\u2062\u00AD\uFEFF]/.test(content)) {
        return {
          sampleId,
          verdict: 'malicious',
          category: 'unicode_stego',
          confidence: 0.95,
          scanTimeMs: compileMs,
        };
      }

      // Run all 6 analyzers, passing the raw content exactly as the shipped
      // `runNanoMindScan` does \u2014 the content-based scope/credential/governance
      // checks (incl. AST-SCOPE-004) return early without it.
      const verifier = (a: any) => this.compiler.verifyAST(a);
      const allFindings = [
        ...analyzeCapabilities(ast),
        ...(analyzeCredentials ? analyzeCredentials(ast, verifier, undefined, content) : []),
        ...(analyzeGovernance ? analyzeGovernance(ast, verifier, undefined, undefined, content) : []),
        ...(analyzeScope ? analyzeScope(ast, verifier, undefined, content) : []),
        ...(analyzePrompt ? analyzePrompt(ast, verifier, undefined, content) : []),
        ...(analyzeCode ? analyzeCode(ast, verifier) : []),
      ];

      // Filter to actual attack findings (present attacks, not missing-defense
      // hardening gaps \u2014 see HARDENING_CHECK_IDS).
      const attackFindings = allFindings.filter((f: any) => {
        if (f.passed) return false;
        if (HARDENING_CHECK_IDS.has(f.checkId)) return false;
        return true;
      });

      // Verdict: the artifact is flagged malicious when it produced at least one
      // high/critical attack finding \u2014 the finding set the shipped scanner shows
      // in red. We do NOT OR-in inferred risk surfaces: those are soft, informational
      // signals (the scanner's Observations block), not a high/critical finding, so
      // counting them as detection would overstate what the product flags. The TME
      // intent label likewise does not decide the verdict (it over-flags benign
      // artifacts); it only informs the attack CATEGORY below.
      const hasHighSeverityFindings = attackFindings.some(
        (f: any) => f.severity === 'critical' || f.severity === 'high',
      );

      if (!hasHighSeverityFindings) {
        return {
          sampleId,
          verdict: 'benign',
          confidence: ast.intentConfidence,
          scanTimeMs: Date.now() - startMs,
        };
      }

      // Determine attack category from multiple signals
      let category = this.determineCategory(ast, attackFindings, content);

      return {
        sampleId,
        verdict: 'malicious',
        category,
        confidence: ast.intentConfidence,
        scanTimeMs: Date.now() - startMs,
      };
    } catch {
      return { sampleId, verdict: 'unknown' };
    }
  }

  private determineCategory(ast: any, findings: any[], content: string): AttackCategory | undefined {
    // Priority: critical findings > risk surfaces > TME class

    // 1. Critical/high findings with attack class
    const critical = findings
      .filter((f: any) => f.severity === 'critical' || f.severity === 'high')
      .sort((a: any, b: any) => (a.severity === 'critical' ? -1 : 1));

    for (const f of critical) {
      const cat = mapToCategory(f.attackClass);
      if (cat) return disambiguateExfil(content, cat);
    }

    // 2. Any finding with attack class
    for (const f of findings) {
      const cat = mapToCategory(f.attackClass);
      if (cat) return disambiguateExfil(content, cat);
    }

    // 3. AST risk surfaces
    if (ast.inferredRiskSurface?.length > 0) {
      const sorted = [...ast.inferredRiskSurface].sort((a: any, b: any) => b.confidence - a.confidence);
      for (const risk of sorted) {
        const cat = mapToCategory(risk.attackClass);
        if (cat) return disambiguateExfil(content, cat);
      }
    }

    // 4. TME attack class (via AST intent metadata)
    // The compiler stores TME result in the AST
    if (ast.intentMetadata?.tmeAttackClass) {
      const cat = mapToCategory(ast.intentMetadata.tmeAttackClass);
      if (cat) return disambiguateExfil(content, cat);
    }

    return undefined;
  }
}

// ============================================================================
// Static-Only Adapter (no NanoMind, pure regex)
// ============================================================================

export class HMAPipelineStaticAdapter implements ScannerAdapter {
  name = 'HMA Static Patterns (no NanoMind)';
  version = hmaBuildVersion();
  id = 'hma-static-pipeline';

  async scan(content: string, sampleId: string): Promise<ScannerResult> {
    const startMs = Date.now();

    // Check unicode steganography
    if (/[\u200B\u200C\u200D\u2060\u2062\u00AD\uFEFF]/.test(content)) {
      return { sampleId, verdict: 'malicious', category: 'unicode_stego', confidence: 0.95, scanTimeMs: Date.now() - startMs };
    }

    // Static pattern groups with associated categories
    const patternGroups: Array<{ category: AttackCategory; patterns: RegExp[]; weight: number }> = [
      {
        category: 'credential_exfiltration',
        weight: 1.0,
        patterns: [
          /sk-ant-api\d{2}-[a-zA-Z0-9_-]{20,}/i,
          /sk-proj-[a-zA-Z0-9]{20,}/i,
          /AKIA[0-9A-Z]{16}/,
          /ghp_[a-zA-Z0-9]{36}/,
          /forward.*credential|send.*token.*external|export.*api.?key/i,
          /provide.*password|share.*credential|enter.*key.*for.*verification/i,
        ],
      },
      {
        category: 'data_exfiltration',
        weight: 1.0,
        patterns: [
          /webhook\.site|requestbin|pipedream\.net|hookbin/i,
          /forward.*data.*external|send.*to.*endpoint/i,
          /select\s+\*\s+from|dump.*database|export.*records/i,
          /exfiltrat|leak.*data|siphon/i,
        ],
      },
      {
        category: 'prompt_injection',
        weight: 0.9,
        patterns: [
          /ignore.*previous.*instruction/i,
          /override.*system.*prompt/i,
          /new.*task.*ignore|bypass.*safety/i,
          /disable.*safety.*check|jailbreak/i,
          /you are now|from now on.*you must/i,
        ],
      },
      {
        category: 'heartbeat_rce',
        weight: 0.8,
        patterns: [
          /fetch.*config.*from.*http/i,
          /download.*instruction.*from/i,
          /check.*update.*external|load.*config.*remote/i,
          /eval\(|exec\(|child_process|subprocess/i,
        ],
      },
      {
        category: 'persistence',
        weight: 0.8,
        patterns: [
          /save.*permanently.*instruction|remember.*forever/i,
          /persist.*across.*session|write.*memory.*always/i,
          /modify.*system.*config|install.*backdoor/i,
        ],
      },
      {
        category: 'privilege_escalation',
        weight: 0.8,
        patterns: [
          /escalat.*admin|access.*any.*database/i,
          /bypass.*permission|grant.*full.*access/i,
          /sudo|root.*privilege|admin.*right/i,
        ],
      },
      {
        category: 'social_engineering',
        weight: 0.7,
        patterns: [
          /urgent.*credential|emergency.*password/i,
          /immediate.*share.*key|account.*compromised/i,
          /verify.*identity.*by.*sharing|confirm.*by.*entering/i,
        ],
      },
      {
        category: 'supply_chain',
        weight: 0.7,
        patterns: [
          /npm install.*\|\s*sh/i,
          /curl.*\|\s*(bash|sh)/i,
          /dependency.*confus|typosquat/i,
        ],
      },
    ];

    let bestMatch: { category: AttackCategory; score: number } | null = null;

    for (const group of patternGroups) {
      const matches = group.patterns.filter(r => r.test(content)).length;
      if (matches > 0) {
        const score = (matches / group.patterns.length) * group.weight;
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { category: group.category, score };
        }
      }
    }

    if (bestMatch) {
      return {
        sampleId,
        verdict: 'malicious',
        category: bestMatch.category,
        confidence: Math.min(0.95, 0.4 + bestMatch.score * 0.5),
        scanTimeMs: Date.now() - startMs,
      };
    }

    return { sampleId, verdict: 'benign', confidence: 0.7, scanTimeMs: Date.now() - startMs };
  }
}
