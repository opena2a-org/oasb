// Diagnostic: does the AST-SCOPE-004 change raise benign FPR?
// Run every benign/edge_case sample through the faithfully-routed pipeline and
// count malicious verdicts + any AST-SCOPE-004 firings.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corePath = path.resolve(__dirname, '..', '..', 'hackmyagent', 'dist', 'nanomind-core', 'index.js');
const core = await import(corePath);
const { SemanticCompiler, analyzeCapabilities, analyzeCredentials, analyzeGovernance, analyzeScope, analyzePrompt, analyzeCode } = core;

const HARDENING = new Set(['AST-PROMPT-001','AST-PROMPT-003','AST-PROMPT-004','AST-GOV-001','AST-GOV-002','AST-GOV-003','AST-GOV-004','AST-GOV-005']);

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

async function scan(content, fname) {
  const compiler = new SemanticCompiler({ useNanoMind: false });
  const { ast } = await compiler.compile(content, fname);
  const verifier = (a) => compiler.verifyAST(a);
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
  return { highCrit, hasRisk, scope004: attack.filter(f => f.checkId === 'AST-SCOPE-004') };
}

const samples = JSON.parse(readFileSync(path.resolve(__dirname,'..','corpus','batch-benign.json'),'utf-8'));
let n = 0, fp = 0, scope004Fires = 0;
const fpList = [], scope004List = [];
for (const s of samples) {
  n++;
  const r = await scan(s.content, routedName(s.id, s.artifactType));
  const malicious = r.highCrit.length > 0 || r.hasRisk;
  if (malicious) { fp++; fpList.push(`${s.id}/${s.label}/${s.artifactType} -> ${r.highCrit.map(f=>f.checkId+':'+f.severity).join(',')}${r.hasRisk?' +risk':''}`); }
  if (r.scope004.length > 0) { scope004Fires++; scope004List.push(`${s.id}/${s.label} -> ${r.scope004.map(f=>f.name).join(',')}`); }
}
console.log(`Benign+edge samples: ${n}`);
console.log(`Malicious verdicts (FP): ${fp} (FPR ${((fp/n)*100).toFixed(2)}%)`);
console.log(`AST-SCOPE-004 firings on benign: ${scope004Fires}`);
if (scope004List.length) { console.log('  AST-SCOPE-004 benign hits:'); scope004List.forEach(x=>console.log('   '+x)); }
if (fpList.length) { console.log('\nFP detail (all checks, severity-gated verdict):'); fpList.forEach(x=>console.log('  '+x)); }
