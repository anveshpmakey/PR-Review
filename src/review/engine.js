import { buildChunks } from './chunker.js';
import { normalizeReview, SEVERITIES } from './schema.js';
import { buildSystemPrompt, buildUserPrompt } from '../prompts/reviewPrompt.js';
import { nearestCommentableLine } from '../utils/diff.js';
import { logger } from '../utils/logger.js';

const rank = s => SEVERITIES.indexOf(s);

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      try {
        results[i] = { ok: true, value: await fn(items[i], i) };
      } catch (error) {
        results[i] = { ok: false, error };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

function resolveFile(filesByPath, path) {
  if (filesByPath.has(path)) return filesByPath.get(path);
  for (const [p, f] of filesByPath) {
    if (p.endsWith(`/${path}`) || path.endsWith(`/${p}`)) return f;
  }
  return null;
}

const normTitle = t => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function anchorAndFilterFindings(findings, files, reviewConfig, existingInline = []) {
  const filesByPath = new Map(files.map(f => [f.path, f]));
  const seen = new Set(existingInline.map(c => `${c.path}|${normTitle(c.title)}`));
  const out = [];
  for (const finding of findings) {
    if (rank(finding.severity) < rank(reviewConfig.minSeverity)) continue;
    if (finding.confidence < reviewConfig.minConfidence) continue;
    const file = resolveFile(filesByPath, finding.path);
    if (!file) {
      out.push({ ...finding, line: null, anchored: false });
      continue;
    }
    const key = `${file.path}|${normTitle(finding.title)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const line = finding.line ? nearestCommentableLine(file, finding.line) : null;
    out.push({ ...finding, path: file.path, line, anchored: true });
  }
  return out.sort((a, b) => rank(b.severity) - rank(a.severity) || b.confidence - a.confidence);
}

export function computeVerdict(findings) {
  if (findings.some(f => rank(f.severity) >= rank('high'))) return 'request_changes';
  return findings.length ? 'comment' : 'approve';
}

export async function runReview({ pr, files, llm, reviewConfig, guidelines = '', contents = new Map(), existingInline = [] }) {
  const { chunks, skipped } = buildChunks(files, {
    maxChunkChars: reviewConfig.maxChunkChars,
    maxChunks: reviewConfig.maxChunks,
    contents
  });
  const system = buildSystemPrompt({ profile: reviewConfig.profile, guidelines });
  const allPaths = files.map(f => f.path);

  logger.info(`Reviewing PR #${pr.id} with ${llm.name}: ${files.length} file(s) in ${chunks.length} chunk(s)`);

  const results = await mapWithConcurrency(chunks, reviewConfig.concurrency, async (entries, i) => {
    const user = buildUserPrompt({ pr, entries, allPaths, chunkIndex: i, chunkCount: chunks.length, skipped });
    const { review, usage, model } = await llm.review({ system, user, entries });
    if (usage) logger.debug(`Chunk ${i + 1}/${chunks.length} usage`, JSON.stringify(usage));
    return { ...normalizeReview(review), model: model || llm.name };
  });

  const failures = results.filter(r => !r.ok).map(r => r.error);
  failures.forEach(e => logger.error('Review chunk failed:', e.message));
  const succeeded = results.filter(r => r.ok).map(r => r.value);
  if (!succeeded.length && failures.length) throw failures[0];

  const findings = anchorAndFilterFindings(succeeded.flatMap(r => r.findings), files, reviewConfig, existingInline);
  const inlineable = findings.filter(f => f.anchored);
  const inline = inlineable.slice(0, reviewConfig.maxInlineComments);
  const overflow = [...inlineable.slice(reviewConfig.maxInlineComments), ...findings.filter(f => !f.anchored)];
  const summaries = succeeded.map(r => r.summary).filter(Boolean);

  return {
    model: [...new Set(succeeded.map(r => r.model))].join(', ') || llm.name,
    summary: summaries.length > 1 ? summaries.map(s => `- ${s}`).join('\n') : summaries[0] || '',
    verdict: computeVerdict(findings),
    findings,
    inline,
    overflow,
    skippedFiles: skipped,
    failedChunks: failures.length,
    totalChunks: chunks.length
  };
}
