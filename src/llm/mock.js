// Offline heuristic reviewer used when no LLM provider is configured (local dev / tests).
const RULES = [
  {
    test: l => /@Transactional/.test(l.content),
    fileTest: p => /Controller\.java$/.test(p),
    severity: 'medium',
    category: 'architecture',
    title: 'Transaction boundary declared in a controller',
    body: 'Transactions usually belong in the service layer so they wrap business operations, not HTTP handling.',
    suggestion: 'Move @Transactional to the relevant service method.'
  },
  {
    test: l => /(password|secret|api[_-]?key|token)\s*[:=]\s*["'][^"']{6,}["']/i.test(l.content),
    severity: 'high',
    category: 'security',
    title: 'Possible hard-coded secret',
    body: 'A credential-like value appears to be committed in source code.',
    suggestion: 'Load the value from configuration or a secret manager and rotate the exposed credential.'
  },
  {
    test: l => /\bconsole\.log\(|System\.out\.println\(|\bprintStackTrace\(\)/.test(l.content),
    severity: 'low',
    category: 'maintainability',
    title: 'Debug output left in code',
    body: 'Direct stdout logging bypasses the structured logger and may leak data.',
    suggestion: 'Use the project logger with an appropriate level, or remove it.'
  },
  {
    test: l => /catch\s*\([^)]*\)\s*\{\s*\}/.test(l.content),
    severity: 'medium',
    category: 'error-handling',
    title: 'Exception swallowed silently',
    body: 'An empty catch block hides failures and makes issues hard to diagnose.',
    suggestion: 'Log the exception with context or rethrow a meaningful error.'
  }
];

export function createMockClient() {
  return {
    name: 'mock/heuristic',
    async review({ entries }) {
      const findings = [];
      for (const { file } of entries) {
        for (const hunk of file.hunks) {
          for (const line of hunk.lines) {
            if (line.type !== 'add') continue;
            for (const rule of RULES) {
              if (rule.fileTest && !rule.fileTest(file.path)) continue;
              if (!rule.test(line)) continue;
              findings.push({
                path: file.path,
                line: line.newLine,
                severity: rule.severity,
                category: rule.category,
                title: rule.title,
                body: rule.body,
                suggestion: rule.suggestion,
                confidence: 0.6
              });
            }
          }
        }
      }
      return {
        review: {
          summary: `Heuristic review of ${entries.length} file(s). Configure AI_PROVIDER=anthropic or openai for an LLM-powered review.`,
          verdict: findings.some(f => f.severity === 'high' || f.severity === 'critical') ? 'request_changes' : findings.length ? 'comment' : 'approve',
          findings
        }
      };
    }
  };
}
