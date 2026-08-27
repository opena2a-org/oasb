#!/usr/bin/env node
/**
 * Export Registry Scan Results as OASB Benchmark Corpus
 *
 * Pulls scanned packages from the OpenA2A Registry and converts
 * HMA scan results into ground-truth labeled benchmark samples.
 *
 * Each package with a completed scan becomes a sample. THIS COMMENT DRIFTED ONCE AND THE
 * DRIFT REACHED FIVE PUBLIC SURFACES: it described a `verdict=safe + score>=80` rule that the
 * code has not applied since commit f689b86, and the 2026-08-09 withdrawal notice quoted the
 * comment rather than the code. Keep it in step with labelClassification() below or delete it.
 *
 * The rule as implemented:
 * - verdict=blocked                          -> malicious
 * - verdict=warning AND overall_score >= 70  -> benign
 * - verdict=warning AND overall_score <  40  -> malicious
 * - anything else (incl. warning 40-69)      -> edge_case
 *
 * Note what the second line means: the benign class is not "artifacts the scanner called
 * clean". There is no `safe` verdict in the shipped corpus at all. It is artifacts the
 * scanner emitted a WARNING on and kept because they scored 70 or above.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/export-registry-corpus.mjs --limit=10000
 *   DATABASE_URL="postgresql://..." node scripts/export-registry-corpus.mjs --limit=10000 --min-score=0 --max-score=50
 */

import pg from 'pg';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CATEGORY_MAP = {
  'credentials': 'credential_exfiltration',
  'supply_chain': 'supply_chain',
  'supply-chain': 'supply_chain',
  'prompt': 'prompt_injection',
  'injection': 'prompt_injection',
  'heartbeat': 'heartbeat_rce',
  'rce': 'heartbeat_rce',
  'unicode': 'unicode_stego',
  'steganography': 'unicode_stego',
  'privilege': 'privilege_escalation',
  'escalation': 'privilege_escalation',
  'persistence': 'persistence',
  'memory': 'persistence',
  'social': 'social_engineering',
  'data': 'data_exfiltration',
  'exfiltration': 'credential_exfiltration',
  'config': 'privilege_escalation',
  'mcp': 'supply_chain',
  'skill': 'prompt_injection',
};

function mapFindingCategory(findingCategory) {
  const cat = (findingCategory || '').toLowerCase();
  for (const [key, value] of Object.entries(CATEGORY_MAP)) {
    if (cat.includes(key)) return value;
  }
  return undefined;
}

function mapPackageType(packageType) {
  const typeMap = {
    'mcp_server': 'mcp_tool',
    'a2a_agent': 'agent_config',
    'skill': 'skill',
    'ai_tool': 'agent_config',
    'llm': 'system_prompt',
  };
  return typeMap[packageType] || 'agent_config';
}

async function main() {
  const args = process.argv.slice(2);
  const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '10000');
  const minScore = parseInt(args.find(a => a.startsWith('--min-score='))?.split('=')[1] || '0');
  const maxScore = parseInt(args.find(a => a.startsWith('--max-score='))?.split('=')[1] || '100');
  const outputFile = args.find(a => a.startsWith('--output='))?.split('=')[1] || join(__dirname, '..', 'corpus', 'registry-corpus.json');

  const dbUrl = process.env.REGISTRY_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('REGISTRY_DATABASE_URL or DATABASE_URL required');
    process.exit(1);
  }

  // Parse URL explicitly to handle special chars in password
  const parsedUrl = new URL(dbUrl);
  const pool = new pg.Pool({
    host: parsedUrl.hostname,
    port: parseInt(parsedUrl.port) || 5432,
    database: parsedUrl.pathname.slice(1).split('?')[0],
    user: parsedUrl.username,
    password: parsedUrl.password,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  console.log(`Exporting registry scan results (limit=${limit}, score=${minScore}-${maxScore})...`);

  // Pull packages with completed scans + their findings from the findings table
  const { rows } = await pool.query(`
    SELECT
      s.id as scan_id,
      p.id as package_id,
      p.name,
      p.package_type,
      p.description,
      s.overall_score,
      s.verdict,
      s.critical_count,
      s.high_count,
      s.medium_count,
      s.low_count,
      s.scanner_version,
      s.scan_date,
      COALESCE(
        (SELECT json_agg(json_build_object(
          'category', f.category,
          'severity', f.severity,
          'title', f.title,
          'type', f.finding_type
        ))
        FROM registry_security_findings f
        WHERE f.scan_id = s.id AND f.false_positive = false AND f.suppressed = false),
        '[]'::json
      ) as findings
    FROM registry_security_scans s
    JOIN registry_packages p ON p.id = s.package_id
    WHERE s.scan_status = 'completed'
      AND s.overall_score >= $1
      AND s.overall_score <= $2
    ORDER BY s.scan_date DESC
    LIMIT $3
  `, [minScore, maxScore, limit]);

  console.log(`Fetched ${rows.length} scanned packages`);

  const samples = [];
  let malCount = 0, benCount = 0, edgeCount = 0;
  const categoryCounts = {};

  for (const row of rows) {
    const id = `REG-${row.package_id.slice(0, 8).toUpperCase()}`;
    const artifactType = mapPackageType(row.package_type);

    // Build content from package metadata + description
    // (Real content would come from the package source, but metadata is a starting proxy)
    const content = buildArtifactContent(row, artifactType);

    let label, category;
    const findings = Array.isArray(row.findings) ? row.findings : [];

    if (row.verdict === 'blocked') {
      label = 'malicious';
      const criticalFinding = findings.find(f => f.severity === 'CRITICAL') || findings[0];
      category = mapFindingCategory(criticalFinding?.category);
      if (category) {
        categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      }
      malCount++;
    } else if (row.verdict === 'warning' && row.overall_score >= 70) {
      // High-scoring warnings are essentially benign with minor issues
      label = 'benign';
      benCount++;
    } else if (row.verdict === 'warning' && row.overall_score < 40) {
      // Low-scoring warnings are suspicious
      label = 'malicious';
      const criticalFinding = findings.find(f => f.severity === 'CRITICAL') || findings[0];
      category = mapFindingCategory(criticalFinding?.category);
      if (category) {
        categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      }
      malCount++;
    } else {
      // Mid-range warnings and passed with low scores
      label = 'edge_case';
      edgeCount++;
    }

    const sample = {
      id,
      label,
      ...(category && { category }),
      ...(label === 'edge_case' && { confidence: row.overall_score / 100 }),
      source: 'registry',
      version: 'v2.0',
      artifactType,
      content,
      metadata: {
        packageName: row.name,
        packageType: row.package_type,
        scanScore: row.overall_score,
        scanVerdict: row.verdict,
        scannerVersion: row.scanner_version,
        scanDate: row.scan_date,
        criticalCount: row.critical_count,
        highCount: row.high_count,
      },
    };

    samples.push(sample);
  }

  const dataset = {
    version: 'v2.0',
    createdAt: new Date().toISOString(),
    source: 'opena2a-registry',
    totalSamples: samples.length,
    maliciousSamples: malCount,
    benignSamples: benCount,
    edgeCaseSamples: edgeCount,
    categoryCounts,
    samples,
  };

  writeFileSync(outputFile, JSON.stringify(dataset, null, 2));
  console.log(`Wrote ${samples.length} samples to ${outputFile}`);
  console.log(`  Malicious: ${malCount} (${JSON.stringify(categoryCounts)})`);
  console.log(`  Benign: ${benCount}`);
  console.log(`  Edge cases: ${edgeCount}`);

  await pool.end();
}

function buildArtifactContent(row, artifactType) {
  const name = row.name || 'unknown';
  const desc = row.description || '';
  const findings = Array.isArray(row.findings_json) ? row.findings_json : [];

  switch (artifactType) {
    case 'skill':
      return `---\nname: ${name}\ndescription: ${desc.slice(0, 200)}\n---\n\n# ${name}\n\n${desc}\n`;

    case 'mcp_tool':
      return JSON.stringify({
        mcpServers: {
          [name]: {
            command: 'npx',
            args: ['-y', name],
            allowedTools: ['*'],
          },
        },
      }, null, 2);

    case 'agent_config':
      return JSON.stringify({
        name,
        description: desc,
        capabilities: findings.length > 0
          ? findings.slice(0, 3).map(f => f.category || 'unknown')
          : ['general'],
      }, null, 2);

    case 'system_prompt':
      return `You are ${name}. ${desc}\n`;

    default:
      return `# ${name}\n\n${desc}\n`;
  }
}

main().catch(err => {
  console.error('Export failed:', err.message);
  process.exit(1);
});
