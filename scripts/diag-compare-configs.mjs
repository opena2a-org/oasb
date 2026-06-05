// Compare BASELINE (prior adapter) vs NEW (this fix) over the full batch corpus.
//   BASELINE: every sample compiled as `${id}.skill.md`; hardening filter excludes
//             AST-GOV-001/002/003 only (the verdict that produced the 82.1% run).
//   NEW:      compiled under correct artifactType routing; hardening filter also
//             excludes AST-GOV-004/005 (non-discriminative governance gaps);
//             analyzers receive artifactContent; AST-SCOPE-004 present in dist.
// Reports malicious recall and benign FPR for both, so the gate can verify the
// new config raises recall WITHOUT raising benign FPR.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corePath = path.resolve(__dirname, '..', '..', 'hackmyagent', 'dist', 'nanomind-core', 'index.js');
const core = await import(corePath);
const { SemanticCompiler, analyzeCapabilities, analyzeCredentials, analyzeGovernance, analyzeScope, analyzePrompt, analyzeCode } = core;

const HARD_BASE = new Set(['AST-PROMPT-001','AST-PROMPT-003','AST-PROMPT-004','AST-GOV-001','AST-GOV-002','AST-GOV-003']);
const HARD_NEW = new Set([...HARD_BASE, 'AST-GOV-004','AST-GOV-005']);

function routedName(id, t) {
  switch (t) {
    case 'mcp_tool': return 'mcp.json';
    case 'soul': return 'SOUL.md';
    case 'system_prompt': return `${id}.system-prompt.md`;
    case 'agent_config': return `${id}.agent-config.json`;
    case 'skill': default: return `${id}.skill.md`;
  }
}

async function verdict(content, fname, hardSet, passContent) {
  const compiler = new SemanticCompiler({ useNanoMind: false });
  const { ast } = await compiler.compile(content, fname);
  const v = (a) => compiler.verifyAST(a);
  const c = passContent ? content : undefined;
  const all = [
    ...analyzeCapabilities(ast),
    ...analyzeCredentials(ast, v, undefined, c),
    ...analyzeGovernance(ast, v, undefined, undefined, c),
    ...analyzeScope(ast, v, undefined, c),
    ...analyzePrompt(ast, v, undefined, c),
    ...analyzeCode(ast, v),
  ];
  if (/[​‌‍⁠⁢­﻿]/.test(content)) return true; // unicode stego
  const attack = all.filter(f => !f.passed && !hardSet.has(f.checkId));
  const highCrit = attack.some(f => f.severity === 'critical' || f.severity === 'high');
  const hasRisk = (ast.inferredRiskSurface?.length ?? 0) > 0;
  return highCrit || hasRisk;
}

const files = readdirSync(path.resolve(__dirname,'..','corpus')).filter(f => f.startsWith('batch-'));
let malTotal=0, benTotal=0;
let baseMalHit=0, baseBenFp=0, newMalHit=0, newBenFp=0;
const perCat = {}; // category -> {total, baseHit, newHit}

for (const f of files) {
  const samples = JSON.parse(readFileSync(path.resolve(__dirname,'..','corpus',f),'utf-8'));
  for (const s of samples) {
    const isMal = s.label === 'malicious';
    const base = await verdict(s.content, `${s.id}.skill.md`, HARD_BASE, false);
    const neu = await verdict(s.content, routedName(s.id, s.artifactType), HARD_NEW, true);
    if (isMal) {
      malTotal++; if (base) baseMalHit++; if (neu) newMalHit++;
      const cat = s.category || 'unknown';
      perCat[cat] = perCat[cat] || {total:0, baseHit:0, newHit:0};
      perCat[cat].total++; if (base) perCat[cat].baseHit++; if (neu) perCat[cat].newHit++;
    } else {
      benTotal++; if (base) baseBenFp++; if (neu) newBenFp++;
    }
  }
}

const pct = (a,b) => b ? ((a/b)*100).toFixed(1)+'%' : 'n/a';
console.log(`Corpus: ${malTotal} malicious, ${benTotal} benign (batch-* only, excludes registry-corpus)\n`);
console.log(`                     BASELINE(.skill.md, GOV001-3)   NEW(routed, GOV001-5, +SCOPE-004)`);
console.log(`Malicious recall:    ${pct(baseMalHit,malTotal).padEnd(8)} (${baseMalHit}/${malTotal})            ${pct(newMalHit,malTotal)} (${newMalHit}/${malTotal})`);
console.log(`Benign FPR:          ${pct(baseBenFp,benTotal).padEnd(8)} (${baseBenFp}/${benTotal})           ${pct(newBenFp,benTotal)} (${newBenFp}/${benTotal})`);
console.log(`\nPer-category recall (malicious):`);
for (const [cat, d] of Object.entries(perCat).sort()) {
  console.log(`  ${cat.padEnd(24)} base ${pct(d.baseHit,d.total).padStart(6)} -> new ${pct(d.newHit,d.total).padStart(6)}  (${d.newHit}/${d.total})`);
}
