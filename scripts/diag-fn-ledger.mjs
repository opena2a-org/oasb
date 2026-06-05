// Diagnostic: pin the FN ledger for the OASB scanner under-detection.
// For each malicious sample, compile under (a) the current .skill.md routing and
// (b) correct artifactType routing, then report classified type, extracted
// capabilities, risk surfaces, and the hardening-filtered attack findings.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corePath = path.resolve(__dirname, '..', '..', 'hackmyagent', 'dist', 'nanomind-core', 'index.js');
const core = await import(corePath);
const { SemanticCompiler, analyzeCapabilities, analyzeCredentials, analyzeGovernance, analyzeScope, analyzePrompt, analyzeCode } = core;

const HARDENING = new Set(['AST-PROMPT-001','AST-PROMPT-003','AST-PROMPT-004','AST-GOV-001','AST-GOV-002','AST-GOV-003','AST-GOV-004','AST-GOV-005']);

// Map corpus artifactType -> a filename that triggers the matching classifier signature.
function routedName(id, artifactType) {
  switch (artifactType) {
    case 'skill': return `${id}.skill.md`;
    case 'mcp_tool': return `mcp.json`;
    case 'soul': return `SOUL.md`;
    case 'system_prompt': return `${id}.system-prompt.md`;
    case 'agent_config': return `${id}.agent-config.json`;
    default: return `${id}.skill.md`;
  }
}

async function findings(content, fname) {
  const compiler = new SemanticCompiler({ useNanoMind: false });
  const { ast } = await compiler.compile(content, fname);
  const verifier = (a) => compiler.verifyAST(a);
  // Mirror shipped runAllAnalyzers: pass artifactContent + projectType.
  const all = [
    ...analyzeCapabilities(ast),
    ...(analyzeCredentials ? analyzeCredentials(ast, verifier, undefined, content) : []),
    ...(analyzeGovernance ? analyzeGovernance(ast, verifier, undefined, undefined, content) : []),
    ...(analyzeScope ? analyzeScope(ast, verifier, undefined, content) : []),
    ...(analyzePrompt ? analyzePrompt(ast, verifier, undefined, content) : []),
    ...(analyzeCode ? analyzeCode(ast, verifier) : []),
  ];
  const attack = all.filter(f => !f.passed && !HARDENING.has(f.checkId));
  const highCrit = attack.filter(f => f.severity === 'critical' || f.severity === 'high');
  const hasRisk = (ast.inferredRiskSurface?.length ?? 0) > 0;
  return { ast, attack, highCrit, hasRisk, classified: ast.artifactType };
}

const batches = process.argv.slice(2);
const files = batches.length ? batches : ['batch-priv.json','batch-persist.json','batch-social.json'];
let totalMal = 0, missedSkill = 0, missedRouted = 0;
const ledger = [];

for (const f of files) {
  const samples = JSON.parse(readFileSync(path.resolve(__dirname,'..','corpus',f),'utf-8'));
  for (const s of samples) {
    if (s.label !== 'malicious') continue;
    totalMal++;
    const skillF = await findings(s.content, `${s.id}.skill.md`);
    const routedF = await findings(s.content, routedName(s.id, s.artifactType));
    const detSkill = skillF.highCrit.length > 0 || skillF.hasRisk;
    const detRouted = routedF.highCrit.length > 0 || routedF.hasRisk;
    if (!detSkill) missedSkill++;
    if (!detRouted) missedRouted++;
    ledger.push({
      id: s.id, cat: s.category, art: s.artifactType,
      classifiedRouted: routedF.classified,
      detSkill, detRouted,
      routedHighCrit: routedF.highCrit.map(x=>x.checkId+':'+x.severity),
      routedRisk: routedF.ast.inferredRiskSurface?.map(r=>r.attackClass) ?? [],
      declCaps: routedF.ast.declaredCapabilities?.map(c=>c.name) ?? [],
      infCaps: routedF.ast.inferredCapabilities?.map(c=>c.name) ?? [],
    });
  }
}

console.log(`\nMalicious samples: ${totalMal}`);
console.log(`Missed under .skill.md routing: ${missedSkill} (recall ${(((totalMal-missedSkill)/totalMal)*100).toFixed(1)}%)`);
console.log(`Missed under correct routing:   ${missedRouted} (recall ${(((totalMal-missedRouted)/totalMal)*100).toFixed(1)}%)`);
console.log(`\nSamples still MISSED even with correct routing (the analyzer gap):`);
for (const l of ledger.filter(x=>!x.detRouted)) {
  console.log(`  ${l.id} [${l.cat}/${l.art}->${l.classifiedRouted}] declCaps=${JSON.stringify(l.declCaps)} infCaps=${JSON.stringify(l.infCaps)} risk=${JSON.stringify(l.routedRisk)}`);
}
console.log(`\nRecovered by routing alone (missed as skill, caught when routed):`);
for (const l of ledger.filter(x=>!x.detSkill && x.detRouted)) {
  console.log(`  ${l.id} [${l.cat}/${l.art}->${l.classifiedRouted}] highCrit=${JSON.stringify(l.routedHighCrit)} risk=${JSON.stringify(l.routedRisk)}`);
}
