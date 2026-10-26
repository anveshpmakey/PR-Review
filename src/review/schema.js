export const SEVERITIES = ['low', 'medium', 'high', 'critical'];
export const CATEGORIES = [
  'bug',
  'security',
  'performance',
  'concurrency',
  'error-handling',
  'api-design',
  'architecture',
  'persistence',
  'testing',
  'maintainability',
  'config',
  'other'
];
export const VERDICTS = ['approve', 'comment', 'request_changes'];

// Strict-mode compatible (all properties required, nullable instead of optional) so the same schema
// works for OpenAI structured outputs and Anthropic tool input.
export const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'verdict', 'findings'],
  properties: {
    summary: {
      type: 'string',
      description: '2-5 sentence overview of what the change does and its overall risk.'
    },
    verdict: { type: 'string', enum: VERDICTS },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'line', 'severity', 'category', 'title', 'body', 'suggestion', 'confidence'],
        properties: {
          path: { type: 'string', description: 'File path exactly as shown in the "### File:" header.' },
          line: {
            type: ['integer', 'null'],
            description: 'New-file line number from the left column of the diff. Prefer added (+) lines. null for file-level issues.'
          },
          severity: { type: 'string', enum: SEVERITIES },
          category: { type: 'string', enum: CATEGORIES },
          title: { type: 'string', description: 'One-line statement of the problem.' },
          body: { type: 'string', description: 'Why this is a problem and its concrete impact. Markdown allowed, be concise.' },
          suggestion: {
            type: ['string', 'null'],
            description: 'Concrete fix. May include a short code snippet. null if not applicable.'
          },
          confidence: { type: 'number', description: '0.0-1.0 confidence that this is a real issue.' }
        }
      }
    }
  }
};

function clampConfidence(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

export function normalizeReview(raw) {
  const review = raw && typeof raw === 'object' ? raw : {};
  const findings = Array.isArray(review.findings) ? review.findings : [];
  return {
    summary: typeof review.summary === 'string' ? review.summary.trim() : '',
    verdict: VERDICTS.includes(review.verdict) ? review.verdict : 'comment',
    findings: findings
      .filter(f => f && typeof f === 'object' && f.path && (f.title || f.body))
      .map(f => ({
        path: String(f.path).replace(/^[ab]\//, '').trim(),
        line: Number.isInteger(Number(f.line)) && Number(f.line) > 0 ? Number(f.line) : null,
        severity: SEVERITIES.includes(String(f.severity).toLowerCase()) ? String(f.severity).toLowerCase() : 'medium',
        category: CATEGORIES.includes(f.category) ? f.category : 'other',
        title: String(f.title || '').trim() || String(f.body).split('\n')[0].slice(0, 120),
        body: String(f.body || '').trim(),
        suggestion: f.suggestion ? String(f.suggestion).trim() : null,
        confidence: clampConfidence(f.confidence)
      }))
  };
}

export function extractJson(text) {
  if (!text) throw new Error('Empty LLM response');
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) return JSON.parse(fenced[1]);
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error('LLM response did not contain valid JSON');
  }
}
