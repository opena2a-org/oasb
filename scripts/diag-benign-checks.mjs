// Tally which checkIds drive benign false positives across the full v2 benign set
// under correct routing + content passing (the new adapter behavior).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const core = await import(path.resolve(__dirname,'..','..','hackmyagent','dist','nanomind-core','index.js'));
const { SemanticCompiler, analyzeCapabilities, analyzeCredentials, analyzeGovernance, analyzeScope, analyzePrompt, analyzeCode } = core;
const HARD = new Set(['AST-PROMPT-001','AST-PROMPT-003','AST-PROMPT-004','AST-GOV-001','AST-GOV-002','AST-GOV-003','AST-GOV-004','AST-GOV-005']);
const rn=(id,t)=>t==='mcp_tool'?`${id}/mcp.json`:t==='soul'?`${id}/SOUL.md`:t==='system_prompt'?`${id}.system-prompt.md`:t==='agent_config'?`${id}.agent-config.json`:`${id}.skill.md`;
const d=JSON.parse(readFileSync(path.resolve(__dirname,'..','corpus','v2.json'),'utf-8'));
const benign=d.samples.filter(s=>s.label==='benign');
let fp=0; const byCheck={}; const byType={};
for(const s of benign){
  const c=new SemanticCompiler({useNanoMind:false});
  const{ast}=await c.compile(s.content, rn(s.id,s.artifactType));
  const v=a=>c.verifyAST(a);
  const all=[...analyzeCapabilities(ast),...analyzeCredentials(ast,v,undefined,s.content),...analyzeGovernance(ast,v,undefined,undefined,s.content),...analyzeScope(ast,v,undefined,s.content),...analyzePrompt(ast,v,undefined,s.content),...analyzeCode(ast,v)];
  const hc=all.filter(f=>!f.passed&&!HARD.has(f.checkId)&&(f.severity==='critical'||f.severity==='high'));
  if(hc.length){fp++; byType[s.artifactType]=(byType[s.artifactType]||0)+1; const seen=new Set(); for(const f of hc){if(seen.has(f.checkId))continue;seen.add(f.checkId); byCheck[f.checkId]=(byCheck[f.checkId]||0)+1;}}
}
console.log('benign total:',benign.length,'FP (>=1 high/crit):',fp,'FPR',((fp/benign.length)*100).toFixed(2)+'%');
console.log('FP by artifactType:',byType);
console.log('FP-driving checkIds (samples flagged):',Object.fromEntries(Object.entries(byCheck).sort((a,b)=>b[1]-a[1])));
