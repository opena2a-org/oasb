// Resolve the wildcard-MCP labeling tension empirically.
// Re-measure full-corpus recall + FPR under verdict variants that treat the
// wildcard-tool-access finding (AST-SCOPE-001) as POSTURE (not an attack), the
// same way AST-GOV-001..005 are already treated. The scanner is unchanged; only
// which finding categories drive the binary malicious verdict changes.
//
// Adversarial guard: also reports how many MALICIOUS samples are caught ONLY by
// the wildcard finding (these become FN if wildcard is posture-only — honest,
// since a config whose only signal is wildcard access is indistinguishable from
// a benign over-permissioned server).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const core = await import(path.resolve(__dirname, '..', '..', 'hackmyagent', 'dist', 'nanomind-core', 'index.js'));
const { SemanticCompiler, analyzeCapabilities, analyzeCredentials, analyzeGovernance, analyzeScope, analyzePrompt, analyzeCode } = core;

const BASE_HARDENING = ['AST-PROMPT-001','AST-PROMPT-003','AST-PROMPT-004','AST-GOV-001','AST-GOV-002','AST-GOV-003','AST-GOV-004','AST-GOV-005'];
const rn = (id,t) => t==='mcp_tool'?`${id}/mcp.json`:t==='soul'?`${id}/SOUL.md`:t==='system_prompt'?`${id}.system-prompt.md`:t==='agent_config'?`${id}.agent-config.json`:`${id}.skill.md`;

async function findingsOf(content, fname) {
  const c = new SemanticCompiler({ useNanoMind: true });
  const { ast } = await c.compile(content, fname);
  const v = a => c.verifyAST(a);
  const all = [
    ...analyzeCapabilities(ast),
    ...analyzeCredentials(ast, v, undefined, content),
    ...analyzeGovernance(ast, v, undefined, undefined, content),
    ...analyzeScope(ast, v, undefined, content),
    ...analyzePrompt(ast, v, undefined, content),
    ...analyzeCode(ast, v),
  ];
  const stego = /[​‌‍⁠⁢­﻿]/.test(content);
  return { findings: all.filter(f => !f.passed), stego };
}

function verdict(findings, stego, excludeSet) {
  if (stego) return true;
  return findings.some(f => !excludeSet.has(f.checkId) && (f.severity === 'critical' || f.severity === 'high'));
}

const variants = {
  'V0 current (GOV+PROMPT excl)':        new Set(BASE_HARDENING),
  'V1 +wildcard posture (AST-SCOPE-001)': new Set([...BASE_HARDENING, 'AST-SCOPE-001']),
  'V2 +wildcard +purpose-mismatch (001+003)': new Set([...BASE_HARDENING, 'AST-SCOPE-001', 'AST-SCOPE-003']),
};

const d = JSON.parse(readFileSync(path.resolve(__dirname,'..','corpus','v2.json'),'utf-8'));
const samples = d.samples.filter(s => s.label !== 'malicious' || s.category); // categorized-only

const stats = {}; for (const k of Object.keys(variants)) stats[k] = { tp:0, fp:0, fn:0, tn:0 };
let malTotal=0, benTotal=0, wildcardOnlyMal=0;
const perCat = {};

for (const s of samples) {
  const { findings, stego } = await findingsOf(s.content, rn(s.id, s.artifactType));
  const isMal = s.label === 'malicious';
  if (isMal) { malTotal++; const cat=s.category; perCat[cat]=perCat[cat]||{total:0}; perCat[cat].total++; }
  else if (s.label === 'benign') benTotal++;
  // adversarial: malicious caught ONLY by wildcard?
  if (isMal) {
    const hc = findings.filter(f => f.severity==='critical'||f.severity==='high');
    const nonWild = hc.filter(f => f.checkId!=='AST-SCOPE-001' && !new Set(BASE_HARDENING).has(f.checkId));
    const hasWild = hc.some(f=>f.checkId==='AST-SCOPE-001');
    if (hasWild && nonWild.length===0 && !stego) wildcardOnlyMal++;
  }
  for (const [k, ex] of Object.entries(variants)) {
    const m = verdict(findings, stego, ex);
    if (s.label === 'malicious') { if (m) { stats[k].tp++; perCat[s.category][k]=(perCat[s.category][k]||0)+1; } else stats[k].fn++; }
    else if (s.label === 'benign') { if (m) stats[k].fp++; else stats[k].tn++; }
  }
}

const pct=(a,b)=>b?((a/b)*100).toFixed(1)+'%':'n/a';
console.log(`Corpus: ${malTotal} malicious, ${benTotal} benign (categorized-only)\n`);
console.log('Verdict variant'.padEnd(44), 'Recall'.padEnd(8), 'FPR'.padEnd(8), 'Precision'.padEnd(10), 'F1');
for (const [k, st] of Object.entries(stats)) {
  const prec = st.tp+st.fp>0 ? st.tp/(st.tp+st.fp):0;
  const rec = st.tp+st.fn>0 ? st.tp/(st.tp+st.fn):0;
  const f1 = prec+rec>0 ? 2*prec*rec/(prec+rec):0;
  const fpr = st.fp+st.tn>0 ? st.fp/(st.fp+st.tn):0;
  console.log(k.padEnd(44), pct(st.tp,st.tp+st.fn).padEnd(8), (fpr*100).toFixed(2)+'%'.padEnd(4), (prec*100).toFixed(1).padStart(6)+'%'.padEnd(3), (f1*100).toFixed(1)+'%');
}
console.log(`\nAdversarial: malicious samples caught ONLY by the wildcard finding (become FN under V1/V2): ${wildcardOnlyMal}`);
const v0k=Object.keys(variants)[0], v1k=Object.keys(variants)[1], v2k=Object.keys(variants)[2];
console.log('\nPer-category recall: V0 -> V1 -> V2');
for (const [cat,o] of Object.entries(perCat).sort()) {
  console.log('  '+cat.padEnd(24), pct(o[v0k]||0,o.total).padStart(6), '->', pct(o[v1k]||0,o.total).padStart(6), '->', pct(o[v2k]||0,o.total).padStart(6));
}
