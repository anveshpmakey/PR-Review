import crypto from 'crypto';
import { config } from '../config/env.js';
import { buildJavaSpringReviewPrompt } from '../prompts/javaSpringReviewPrompt.js';

function fingerprint(pr) {
  return crypto.createHash('sha256').update(`${pr.id}:${pr.updated_on}`).digest('hex').slice(0, 12);
}

function mockReview({ pr, diffText, changedPaths, summary }) {
  const findings = [];
  if (/src\/main\/java\/.*Controller\.java/i.test(diffText) && /@Transactional/.test(diffText)) {
    findings.push({
      severity: 'medium',
      location: 'Controller.java',
      category: 'layering',
      issue: 'A controller appears to own transaction management, which usually belongs in the service layer.',
      suggestion: 'Move transactional boundaries to the relevant service method unless there is a strong documented exception.'
    });
  }
  if (/JpaRepository|CrudRepository/.test(diffText) && !changedPaths.some(p => /src\/test\/java/i.test(p))) {
    findings.push({
      severity: 'medium',
      location: 'src/main/java',
      category: 'testing',
      issue: 'Persistence-related changes were detected without corresponding test updates.',
      suggestion: 'Add or update repository/service integration tests for the changed query or persistence flow.'
    });
  }
  if (/application\.(yml|yaml|properties)|@Value\(|System\.getenv\(/.test(diffText)) {
    findings.push({
      severity: 'low',
      location: 'configuration',
      category: 'config',
      issue: 'Configuration handling changed in this PR and should be checked for externalization and environment safety.',
      suggestion: 'Prefer strongly typed configuration properties and verify defaults, secret handling, and environment overrides.'
    });
  }

  const header = findings.length
    ? `This PR introduces ${findings.length} architecture concern(s) worth checking.`
    : 'From an architecture standpoint, this PR looks sound based on the basic review rules.';

  const lines = [header, '', `Files changed: ${summary.files}`, `Lines added: ${summary.linesAdded}`, `Lines removed: ${summary.linesRemoved}`, `Review fingerprint: ${fingerprint(pr)}`, ''];
  if (!findings.length) {
    lines.push('Optional suggestions:', '1. SEVERITY: low', '   LOCATION: PR', '   CATEGORY: testing', '   ISSUE: No major architecture issues were detected, but behavior-changing paths should still be verified with tests.', '   SUGGESTION: Confirm service and integration coverage for the main happy path and one failure path.');
  } else {
    findings.forEach((f, i) => {
      lines.push(`${i + 1}. SEVERITY: ${f.severity}`);
      lines.push(`   LOCATION: ${f.location}`);
      lines.push(`   CATEGORY: ${f.category}`);
      lines.push(`   ISSUE: ${f.issue}`);
      lines.push(`   SUGGESTION: ${f.suggestion}`);
      lines.push('');
    });
  }
  return { text: lines.join('\n'), prompt: buildJavaSpringReviewPrompt({ pr, diffText, changedPaths }) };
}

async function openAiReview({ prompt }) {
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openAiApiKey}`
    },
    body: JSON.stringify({
      model: config.openAiModel,
      input: prompt
    })
  });
  if (!res.ok) throw new Error(`OpenAI call failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const text = data.output_text || '';
  return { text };
}

export async function runReview(input) {
  const mock = mockReview(input);
  if (config.aiProvider === 'openai') {
    if (!config.openAiApiKey) throw new Error('OPENAI_API_KEY is required when AI_PROVIDER=openai');
    const live = await openAiReview({ prompt: mock.prompt });
    return { text: live.text || mock.text, prompt: mock.prompt };
  }
  return mock;
}
