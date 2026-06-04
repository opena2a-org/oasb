// AT-AI-002: Prompt Output Scanning
// ATLAS: AML.T0057 (LLM Data Leakage)
// OWASP: LLM02 (Sensitive Information Disclosure)
//
// Verifies that PromptInterceptor.scanOutput() detects leaked secrets,
// PII, and system prompts in LLM responses before they reach the user.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { describeWithCapability } from '../../harness/capabilities';
import { createAdapter } from '../../harness/create-adapter';
import type { PromptScanner } from '../../harness/adapter';

describeWithCapability('prompt-output-scanning', 'AT-AI-002: Prompt Output Scanning', () => {
  let scanner: PromptScanner;

  beforeAll(async () => {
    const adapter = createAdapter();
    scanner = adapter.createPromptScanner();
    await scanner.start();
  });

  afterAll(async () => {
    await scanner.stop();
  });

  // --- API Key Leaks ---

  it('should detect OpenAI API key in output (OL-001)', () => {
    const result = scanner.scanOutput(
      'Here are your credentials: API key is sk-proj-abc123def456ghi789jkl012mno345pqr678stu901vwx234'
    );
    expect(result.detected).toBe(true);
    expect(result.matches.some(m => m.pattern.id === 'OL-001')).toBe(true);
  });

  it('should detect AWS secret key pattern in output (OL-001)', () => {
    const result = scanner.scanOutput(
      'The AWS credentials are: AKIAIOSFODNN7EXAMPLE and wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
    );
    expect(result.detected).toBe(true);
  });

  // --- PII Leaks ---

  it('should detect PII in output (OL-002)', () => {
    const result = scanner.scanOutput(
      'The user SSN is 123-45-6789 and their credit card number is 4111-1111-1111-1111.'
    );
    expect(result.detected).toBe(true);
    expect(result.matches.some(m => m.pattern.id === 'OL-002')).toBe(true);
  });

  // --- System Prompt Leak ---

  it('should detect system prompt leak in output (OL-003)', () => {
    const result = scanner.scanOutput(
      'My system prompt says: "You are a helpful assistant. Your API key is stored in the environment."'
    );
    expect(result.detected).toBe(true);
    expect(result.matches.some(m => m.pattern.id === 'OL-003')).toBe(true);
  });

  // --- Clean Output ---

  it('should not flag normal assistant responses', () => {
    const result = scanner.scanOutput(
      'Here is a Python function to sort a list:\n\ndef sort_list(items):\n    return sorted(items)'
    );
    expect(result.detected).toBe(false);
  });

  it('should not flag technical code examples', () => {
    const result = scanner.scanOutput(
      'To configure Express.js CORS, use the cors middleware:\nconst cors = require("cors");\napp.use(cors());'
    );
    expect(result.detected).toBe(false);
  });
});
