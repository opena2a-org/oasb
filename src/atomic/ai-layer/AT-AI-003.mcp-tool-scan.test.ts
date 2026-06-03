// AT-AI-003: MCP Tool Call Scanning
// ATLAS: AML.T0053 (AI Agent Tool Invocation)
// OWASP: LLM06 (Excessive Agency)
//
// Verifies that MCPProtocolInterceptor.scanToolCall() detects path traversal,
// command injection, and SSRF in MCP tool call parameters.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { describeWithCapability } from '../../harness/capabilities';
import { createAdapter } from '../../harness/create-adapter';
import type { MCPScanner } from '../../harness/adapter';

describeWithCapability('mcp-scanning', 'AT-AI-003: MCP Tool Call Scanning', () => {
  let scanner: MCPScanner;
  const adapter = createAdapter();

  beforeAll(async () => {
    scanner = adapter.createMCPScanner();
    await scanner.start();
  });

  afterAll(async () => {
    await scanner.stop();
  });

  // --- Path Traversal ---

  it('should detect path traversal in file read (MCP-001)', () => {
    const result = scanner.scanToolCall('read_file', {
      path: '../../../../etc/passwd',
    });
    expect(result.detected).toBe(true);
    expect(result.matches.some(m => m.pattern.id === 'MCP-001')).toBe(true);
  });

  it('should detect path traversal to SSH keys', () => {
    const result = scanner.scanToolCall('read_file', {
      path: '../../../home/user/.ssh/id_rsa',
    });
    expect(result.detected).toBe(true);
    expect(result.matches.some(m => m.pattern.id === 'MCP-001')).toBe(true);
  });

  // --- Command Injection ---

  it('should detect command injection with semicolon (MCP-002)', () => {
    const result = scanner.scanToolCall('execute', {
      command: 'echo hello; cat /etc/shadow',
    });
    expect(result.detected).toBe(true);
    expect(result.matches.some(m => m.pattern.id === 'MCP-002')).toBe(true);
  });

  it('should detect command injection with pipe', () => {
    const result = scanner.scanToolCall('execute', {
      command: 'ls | cat /etc/passwd',
    });
    expect(result.detected).toBe(true);
    expect(result.matches.some(m => m.pattern.id === 'MCP-002')).toBe(true);
  });

  it('should detect command injection with backticks', () => {
    const result = scanner.scanToolCall('execute', {
      command: 'echo `whoami`',
    });
    expect(result.detected).toBe(true);
    expect(result.matches.some(m => m.pattern.id === 'MCP-002')).toBe(true);
  });

  // --- SSRF ---

  it('should detect SSRF to cloud metadata (MCP-003)', () => {
    const result = scanner.scanToolCall('fetch_url', {
      url: 'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
    });
    expect(result.detected).toBe(true);
    expect(result.matches.some(m => m.pattern.id === 'MCP-003')).toBe(true);
  });

  it('should detect SSRF to localhost', () => {
    const result = scanner.scanToolCall('fetch_url', {
      url: 'http://localhost:9000/admin',
    });
    expect(result.detected).toBe(true);
    expect(result.matches.some(m => m.pattern.id === 'MCP-003')).toBe(true);
  });

  // --- Tool Allowlist ---

  it('should flag tool not in allowlist', async () => {
    const restricted = adapter.createMCPScanner(['read_file', 'search']);
    await restricted.start();
    const result = restricted.scanToolCall('execute', { command: 'ls' });
    expect(result.detected).toBe(true);
    expect(result.matches.some(m => m.pattern.id === 'MCP-ALLOWLIST')).toBe(true);
    await restricted.stop();
  });

  it('should allow tool in allowlist with clean parameters', async () => {
    const restricted = adapter.createMCPScanner(['read_file', 'search']);
    await restricted.start();
    const result = restricted.scanToolCall('read_file', { path: './data/report.txt' });
    expect(result.detected).toBe(false);
    await restricted.stop();
  });

  // --- Clean Parameters ---

  it('should not flag normal file reads', () => {
    const result = scanner.scanToolCall('read_file', {
      path: './src/index.ts',
    });
    expect(result.detected).toBe(false);
  });

  it('should not flag normal commands', () => {
    const result = scanner.scanToolCall('execute', {
      command: 'npm test',
    });
    expect(result.detected).toBe(false);
  });
});
